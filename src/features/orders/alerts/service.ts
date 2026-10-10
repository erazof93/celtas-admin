import { z } from 'zod'
import { createOrderSound } from './sound'

export interface AlertScope {
  api: string
  identity: string
  generation: string
}
interface Notice {
  orderId: string
  at: number
}
interface AlertState {
  notices: Notice[]
  unreviewed: Notice[]
  enabled: boolean
  ready: boolean
  volume: number
  error?: string
  coordinated: boolean
}
// Legacy chime claims are deduplicated, but never restored as new alarms.
const recordSchema = z
  .object({
    orderId: z.uuid(),
    at: z.number().int().nonnegative().safe(),
    sounded: z.boolean(),
    generation: z.string().optional(),
    reviewed: z.boolean().default(true),
  })
  .strict()
const ledgerSchema = z.array(recordSchema)
const preferenceSchema = z
  .object({ enabled: z.boolean(), volume: z.number().min(0).max(1) })
  .strict()
const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('changed') }).strict(),
  z
    .object({ type: z.literal('retire'), ids: z.array(z.uuid()).max(512) })
    .strict(),
  z.object({ type: z.literal('notice'), notice: recordSchema }).strict(),
])
const TTL = 24 * 60 * 60 * 1000
const INTERVAL = 8000
const RECENT = 5000

/** One candidate timer per tab; a shared clock and playback lock own the audible sequence. */
export function createOrderAlertsService(options: {
  scope: () => AlertScope | undefined
  now?: () => number
  storage?: Storage
  validateRestored?: (ids: string[], signal: AbortSignal) => Promise<string[]>
}) {
  const now = options.now ?? (() => Date.now())
  const storage = options.storage ?? localStorage
  const listeners = new Set<() => void>()
  let state: AlertState = {
    notices: [],
    unreviewed: [],
    enabled: false,
    ready: false,
    volume: 0.35,
    coordinated: false,
  }
  let scope: AlertScope | undefined
  let startedAt = now()
  let channel: BroadcastChannel | undefined
  let controller = new AbortController()
  let expiry: ReturnType<typeof setTimeout> | undefined
  let alarm: ReturnType<typeof setTimeout> | undefined
  let ringing: AlertScope | undefined
  let restoring = false
  let restoreFailed = false
  const seen = new Set<string>()
  const retired = new Set<string>()
  const sound = createOrderSound(() => {
    publish(sound.snapshot())
    if (!state.enabled || !state.ready) clearAlarm()
  }, now)
  function publish(change: Partial<AlertState>) {
    state = { ...state, ...change }
    listeners.forEach((listener) => listener())
  }
  const signature = (value: AlertScope | undefined) =>
    value && JSON.stringify([value.api, value.identity, value.generation])
  const valid = (captured: AlertScope) =>
    scope === captured &&
    signature(captured) === signature(options.scope()) &&
    !controller.signal.aborted
  const key = (captured: AlertScope) =>
    `celtas-order-alerts:v1:${JSON.stringify([captured.api, captured.identity])}`
  const preferenceKey = (captured: AlertScope) =>
    `celtas-order-alert-preferences:v1:${JSON.stringify([captured.api, captured.identity])}`
  const clockKey = (captured: AlertScope) =>
    `celtas-order-alarm:v1:${signature(captured)}`
  function preferences(captured: AlertScope) {
    try {
      const parsed = preferenceSchema.safeParse(
        JSON.parse(storage.getItem(preferenceKey(captured)) ?? 'null'),
      )
      if (parsed.success) return parsed.data
    } catch {
      /* Storage may be unavailable. */
    }
    return { enabled: true, volume: 0.35 }
  }
  function savePreferences() {
    if (!scope || !valid(scope)) return
    const { enabled, volume } = sound.snapshot()
    try {
      storage.setItem(preferenceKey(scope), JSON.stringify({ enabled, volume }))
      channel?.postMessage({ type: 'changed' })
    } catch {
      publish({ error: 'No se pudo guardar la preferencia de sonido.' })
    }
  }
  function read(captured: AlertScope) {
    const raw = storage.getItem(key(captured))
    if (raw && raw.length > 1048576) throw Error('Alert ledger too large')
    return ledgerSchema
      .parse(raw ? JSON.parse(raw) : [])
      .filter(
        (record) =>
          record.at <= now() &&
          (record.at >= now() - TTL ||
            (record.generation === captured.generation && !record.reviewed)),
      )
  }
  function write(
    records: z.infer<typeof recordSchema>[],
    captured: AlertScope,
  ) {
    const active = records.filter(
      (record) => record.generation === captured.generation && !record.reviewed,
    )
    const history = records
      .filter(
        (record) =>
          record.generation !== captured.generation || record.reviewed,
      )
      .slice(-512)
    const value = JSON.stringify([...history, ...active])
    if (value.length > 1048576) throw Error('Alert ledger too large')
    storage.setItem(key(captured), value)
  }
  function clearAlarm() {
    clearTimeout(alarm)
    alarm = undefined
  }
  function apply(
    records: z.infer<typeof recordSchema>[],
    captured: AlertScope,
  ) {
    if (!valid(captured)) return
    const unreviewed = records.filter(
      (record) =>
        record.generation === captured.generation &&
        !record.reviewed &&
        !retired.has(record.orderId),
    )
    publish({
      unreviewed,
      notices: state.notices.filter((notice) =>
        unreviewed.some((record) => record.orderId === notice.orderId),
      ),
    })
    if (!unreviewed.length) {
      clearAlarm()
      sound.stop()
    }
  }
  function show(notice: Notice) {
    if (seen.has(notice.orderId) || retired.has(notice.orderId)) return
    seen.add(notice.orderId)
    if (seen.size > 512) seen.delete(seen.values().next().value!)
    publish({ notices: [...state.notices, notice].slice(-5) })
    clearTimeout(expiry)
    expiry = setTimeout(() => publish({ notices: [] }), 15000)
  }
  function nextAt(captured: AlertScope) {
    const value = Number(storage.getItem(clockKey(captured)) ?? 0)
    if (!Number.isSafeInteger(value) || value < 0 || value > now() + INTERVAL)
      return 0
    return value
  }
  function schedule() {
    const captured = scope
    if (
      !captured ||
      !valid(captured) ||
      restoring ||
      ringing ||
      alarm ||
      !state.coordinated ||
      !state.enabled ||
      !state.ready ||
      !state.unreviewed.length
    )
      return
    try {
      const delay = Math.max(0, nextAt(captured) - now())
      if (!delay) {
        void ring(captured)
        return
      }
      alarm = setTimeout(() => {
        alarm = undefined
        void ring(captured)
      }, delay)
    } catch {
      fail()
    }
  }
  function fail() {
    sound.suspend()
    publish({
      error: 'No se pudo guardar la deduplicación; el sonido está suspendido.',
    })
  }
  async function ring(captured: AlertScope) {
    if (ringing === captured || !valid(captured)) return
    ringing = captured
    try {
      // Separate playback lock stays held until audio ends, so tabs cannot overlap.
      await navigator.locks.request(
        `${clockKey(captured)}:playback`,
        { signal: controller.signal },
        async () => {
          if (!valid(captured) || !state.enabled || !state.ready) return
          let claimed = false
          await navigator.locks.request(
            key(captured),
            { signal: controller.signal },
            () => {
              if (!valid(captured)) return
              apply(read(captured), captured)
              if (!state.unreviewed.length || nextAt(captured) > now()) return
              storage.setItem(clockKey(captured), String(now() + INTERVAL))
              claimed = true
            },
          )
          if (
            claimed &&
            valid(captured) &&
            state.enabled &&
            state.ready &&
            state.unreviewed.length
          )
            await sound.play()
        },
      )
    } catch {
      if (valid(captured)) fail()
    } finally {
      if (ringing === captured) ringing = undefined
      if (valid(captured)) schedule()
    }
  }
  function refresh() {
    const captured = scope
    if (!captured || !valid(captured)) return
    try {
      const preference = preferences(captured)
      if (!preference.enabled && state.enabled) sound.mute()
      else if (preference.enabled && !state.enabled) sound.configure(preference)
      if (preference.volume !== state.volume) sound.setVolume(preference.volume)
      apply(read(captured), captured)
      schedule()
    } catch {
      fail()
    }
  }
  async function retire(ids: string[]) {
    const captured = scope
    if (!captured || !valid(captured)) return
    const accepted = [...new Set(ids)].filter(
      (id) => z.uuid().safeParse(id).success,
    )
    if (!accepted.length) return
    accepted.forEach((id) => retired.add(id))
    publish({
      unreviewed: state.unreviewed.filter(
        (record) => !retired.has(record.orderId),
      ),
      notices: state.notices.filter((record) => !retired.has(record.orderId)),
    })
    if (!state.unreviewed.length) {
      clearAlarm()
      sound.stop()
    }
    for (let offset = 0; offset < accepted.length; offset += 512)
      channel?.postMessage({
        type: 'retire',
        ids: accepted.slice(offset, offset + 512),
      })
    try {
      if (!state.coordinated) return
      await navigator.locks.request(
        key(captured),
        { signal: controller.signal },
        () => {
          if (!valid(captured)) return
          const records = read(captured)
          for (const id of accepted) {
            const record = records.find((record) => record.orderId === id)
            if (record) record.reviewed = true
            else
              records.push({
                orderId: id,
                at: now(),
                sounded: false,
                reviewed: true,
                generation: captured.generation,
              })
          }
          write(records, captured)
          if (
            !records.some(
              (record) =>
                record.generation === captured.generation && !record.reviewed,
            )
          )
            storage.removeItem(clockKey(captured))
          apply(records, captured)
        },
      )
      if (valid(captured)) channel?.postMessage({ type: 'changed' })
    } catch {
      if (valid(captured)) fail()
    }
  }
  function close() {
    controller.abort()
    clearAlarm()
    clearTimeout(expiry)
    window.removeEventListener('storage', refresh)
    channel?.close()
    channel = undefined
    scope = undefined
    ringing = undefined
    restoring = false
    restoreFailed = false
    seen.clear()
    retired.clear()
    sound.close()
    publish({ notices: [], unreviewed: [], coordinated: false })
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    sync() {
      const current = options.scope()
      const next = current && { ...current }
      if (signature(next) === signature(scope)) return
      close()
      if (!next) return
      scope = next
      startedAt = now()
      controller = new AbortController()
      sound.configure(preferences(next))
      try {
        apply(read(next), next)
        if (!navigator.locks || typeof BroadcastChannel === 'undefined') return
        channel = new BroadcastChannel(`celtas-order-alerts:${signature(next)}`)
        channel.onmessage = (event) => {
          if (!valid(next)) return
          const parsed = messageSchema.safeParse(event.data)
          if (!parsed.success) return
          if (parsed.data.type === 'retire') {
            parsed.data.ids.forEach((id) => retired.add(id))
          }
          refresh()
          if (parsed.data.type === 'notice') {
            const notice = parsed.data.notice
            if (
              notice.at >= startedAt &&
              notice.at <= now() &&
              now() - notice.at <= RECENT &&
              state.unreviewed.some(
                (record) => record.orderId === notice.orderId,
              )
            )
              show(notice)
          }
        }
        window.addEventListener('storage', refresh)
        publish({ coordinated: true })
        const restored = state.unreviewed.map((record) => record.orderId)
        restoring = Boolean(restored.length && options.validateRestored)
        void navigator.locks
          .request(key(next), { signal: controller.signal }, () => {
            if (valid(next)) write(read(next), next)
          })
          .then(async () => {
            if (!valid(next) || !restoring || !options.validateRestored) return
            const retained = await options.validateRestored(
              restored,
              controller.signal,
            )
            if (!valid(next)) return
            await retire(restored.filter((id) => !retained.includes(id)))
            restoring = false
            schedule()
          })
          .catch(() => {
            if (valid(next)) {
              restoreFailed = true
              sound.suspend()
              publish({
                error:
                  'No se pudieron comprobar las alarmas guardadas. Actualiza el panel para reintentar.',
              })
            }
          })
      } catch {
        publish({
          error:
            'La coordinación no está disponible; los avisos serán locales y sin sonido.',
        })
      }
    },
    async offer(orderId: string) {
      const captured = scope
      if (
        !captured ||
        !valid(captured) ||
        !z.uuid().safeParse(orderId).success ||
        retired.has(orderId)
      )
        return
      const notice = { orderId, at: now() }
      if (!state.coordinated) {
        if (!state.unreviewed.some((record) => record.orderId === orderId))
          publish({ unreviewed: [...state.unreviewed, notice] })
        show(notice)
        return
      }
      try {
        let fresh: z.infer<typeof recordSchema> | undefined
        await navigator.locks.request(
          key(captured),
          { signal: controller.signal },
          () => {
            if (!valid(captured) || retired.has(orderId)) return
            const records = read(captured)
            if (!records.some((record) => record.orderId === orderId)) {
              fresh = {
                ...notice,
                sounded: false,
                reviewed: false,
                generation: captured.generation,
              }
              records.push(fresh)
              write(records, captured)
            }
            apply(records, captured)
          },
        )
        if (!valid(captured)) return
        if (fresh) {
          show(fresh)
          channel?.postMessage({ type: 'notice', notice: fresh })
        }
        // Ring now only for a new sequence; more orders do not reset its clock.
        if (
          state.ready &&
          state.enabled &&
          state.unreviewed.length &&
          !alarm &&
          !ringing &&
          !restoring
        )
          await ring(captured)
        else schedule()
      } catch {
        if (valid(captured)) {
          if (!state.unreviewed.some((record) => record.orderId === orderId))
            publish({ unreviewed: [...state.unreviewed, notice] })
          show(notice)
          fail()
        }
      }
    },
    async enableSound() {
      if (!state.coordinated || restoreFailed) return
      const captured = scope
      const activation = sound.enable()
      savePreferences()
      await activation
      if (captured && valid(captured)) schedule()
    },
    mute() {
      sound.mute()
      savePreferences()
    },
    setVolume(volume: number) {
      sound.setVolume(volume)
      savePreferences()
    },
    markReviewed: (orderId: string) => retire([orderId]),
    retire,
    retainPending(ids: string[], observedAt: number) {
      return retire(
        state.unreviewed
          .filter(
            (record) =>
              record.at <= observedAt && !ids.includes(record.orderId),
          )
          .map((record) => record.orderId),
      )
    },
    dismiss(orderId: string) {
      publish({
        notices: state.notices.filter((notice) => notice.orderId !== orderId),
      })
    },
    close,
  }
}
