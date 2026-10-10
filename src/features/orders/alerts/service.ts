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
  enabled: boolean
  ready: boolean
  volume: number
  error?: string
  coordinated: boolean
}
const recordSchema = z
  .object({
    orderId: z.uuid(),
    at: z.number().int().nonnegative().safe(),
    sounded: z.boolean(),
  })
  .strict()
const ledgerSchema = z.array(recordSchema).max(512)
const TTL = 24 * 60 * 60 * 1000
const RECENT = 5000
const preferenceSchema = z
  .object({
    enabled: z.boolean(),
    volume: z.number().min(0).max(1),
  })
  .strict()

/** A separate short lock for alert claims; never owns or opens an SSE stream. */
export function createOrderAlertsService(options: {
  scope: () => AlertScope | undefined
  now?: () => number
  storage?: Storage
}) {
  const now = options.now ?? (() => Date.now())
  const storage = options.storage ?? localStorage
  const listeners = new Set<() => void>()
  let state: AlertState = {
    notices: [],
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
  const seen = new Set<string>()
  const sound = createOrderSound(() => publish({ ...sound.snapshot() }), now)
  function publish(change: Partial<AlertState>) {
    state = { ...state, ...change }
    listeners.forEach((listener) => listener())
  }
  const signature = (value: AlertScope | undefined) =>
    value && JSON.stringify([value.api, value.identity, value.generation])
  const valid = (captured: AlertScope) =>
    signature(captured) === signature(options.scope()) &&
    !controller.signal.aborted
  const key = (captured: AlertScope) =>
    `celtas-order-alerts:v1:${JSON.stringify([captured.api, captured.identity])}`
  const preferenceKey = (captured: AlertScope) =>
    `celtas-order-alert-preferences:v1:${JSON.stringify([captured.api, captured.identity])}`
  function preferences(captured: AlertScope) {
    try {
      const parsed = preferenceSchema.safeParse(
        JSON.parse(storage.getItem(preferenceKey(captured)) ?? 'null'),
      )
      if (parsed.success) return parsed.data
    } catch {
      /* Storage may be unavailable; retain the initial preference. */
    }
    return { enabled: true, volume: 0.35 }
  }
  function savePreferences() {
    if (!scope || !valid(scope)) return
    const { enabled, volume } = sound.snapshot()
    try {
      storage.setItem(preferenceKey(scope), JSON.stringify({ enabled, volume }))
    } catch {
      publish({ error: 'No se pudo guardar la preferencia de sonido.' })
    }
  }
  function read(captured: AlertScope) {
    const raw = storage.getItem(key(captured))
    if (raw && raw.length > 65536) throw Error('Alert ledger too large')
    const parsed = ledgerSchema.parse(raw ? JSON.parse(raw) : [])
    return parsed.filter(
      (record) => record.at >= now() - TTL && record.at <= now(),
    )
  }
  function show(notice: Notice) {
    if (seen.has(notice.orderId)) return
    seen.add(notice.orderId)
    if (seen.size > 512) seen.delete(seen.values().next().value!)
    publish({ notices: [...state.notices, notice].slice(-5) })
    clearTimeout(expiry)
    expiry = setTimeout(() => publish({ notices: [] }), 15000)
  }
  async function claimSound(notice: Notice, captured: AlertScope) {
    if (
      !sound.eligible(notice.at) ||
      !state.coordinated ||
      !valid(captured) ||
      now() - notice.at > RECENT ||
      notice.at < startedAt
    )
      return
    let claimed = false
    try {
      await navigator.locks.request(
        key(captured),
        { signal: controller.signal },
        () => {
          if (!valid(captured) || !sound.eligible(notice.at)) return
          const records = read(captured)
          const record = records.find(
            (entry) =>
              entry.orderId === notice.orderId && entry.at === notice.at,
          )
          if (!record || record.sounded) return
          record.sounded = true
          storage.setItem(key(captured), JSON.stringify(records))
          claimed = true
        },
      )
      if (claimed && valid(captured)) await sound.play()
    } catch {
      if (valid(captured))
        publish({ error: 'No se pudo coordinar el sonido entre pestañas.' })
    }
  }
  function receive(notice: Notice, captured: AlertScope) {
    if (
      !valid(captured) ||
      notice.at < startedAt ||
      now() - notice.at > RECENT ||
      notice.at > now()
    )
      return
    show(notice)
    void claimSound(notice, captured)
  }
  function close() {
    controller.abort()
    channel?.close()
    channel = undefined
    scope = undefined
    clearTimeout(expiry)
    seen.clear()
    sound.close()
    publish({ notices: [], coordinated: false })
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
      const next = options.scope()
      if (signature(next) === signature(scope)) return
      close()
      if (!next) return
      scope = next
      sound.configure(preferences(next))
      startedAt = now()
      controller = new AbortController()
      try {
        // Expire stale identifiers on session start as well as on each new claim.
        read(next)
        if (!navigator.locks || typeof BroadcastChannel === 'undefined') return
        channel = new BroadcastChannel(`celtas-order-alerts:${signature(next)}`)
        channel.onmessage = (event) => {
          const parsed = recordSchema.safeParse(event.data)
          if (parsed.success) receive(parsed.data, next)
        }
        publish({ coordinated: true })
        void navigator.locks
          .request(key(next), { signal: controller.signal }, () => {
            if (valid(next))
              storage.setItem(key(next), JSON.stringify(read(next)))
          })
          .catch(() => {
            if (valid(next))
              publish({
                coordinated: false,
                error: 'La coordinación no está disponible.',
              })
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
      if (!captured || !valid(captured) || !z.uuid().safeParse(orderId).success)
        return
      const notice = { orderId, at: now() }
      if (!state.coordinated) {
        show(notice)
        return
      }
      try {
        let record: z.infer<typeof recordSchema> | undefined
        let fresh = false
        await navigator.locks.request(
          key(captured),
          { signal: controller.signal },
          () => {
            if (!valid(captured)) return
            const records = read(captured)
            record = records.find((entry) => entry.orderId === orderId)
            if (!record) {
              fresh = true
              record = { ...notice, sounded: false }
              records.push(record)
              storage.setItem(
                key(captured),
                JSON.stringify(records.slice(-512)),
              )
            }
          },
        )
        if (!record || !valid(captured)) return
        // Existing claims never create another banner on remount/reload/replay.
        if (fresh) {
          show(record)
          channel?.postMessage(record)
        }
        await claimSound(record, captured)
      } catch {
        if (valid(captured)) {
          show(notice)
          sound.suspend()
          publish({
            error:
              'No se pudo guardar la deduplicación; el sonido está suspendido.',
          })
        }
      }
    },
    enableSound() {
      if (!state.coordinated) return Promise.resolve()
      const activation = sound.enable()
      savePreferences()
      return activation
    },
    mute() {
      sound.mute()
      savePreferences()
    },
    setVolume(volume: number) {
      sound.setVolume(volume)
      savePreferences()
    },
    dismiss(orderId: string) {
      publish({
        notices: state.notices.filter((notice) => notice.orderId !== orderId),
      })
    },
    close,
  }
}
