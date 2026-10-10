import { useAuthStore } from '@/features/auth/store'
import { isAxiosError } from 'axios'
import {
  openOrderEventsStream,
  orderEventsUrl,
  refreshSseAccessToken,
} from '@/lib/api-client'
import type { SseTransportResult } from '@/lib/sse-transport'
import {
  localOrderEventsApi,
  orderEventsApi,
  productionOrderEventsEnabled,
} from './environment'
import {
  decodeOrderStreamFrame,
  orderEventCursorSchema,
  type OrderStreamEvent,
} from './types'

export interface OrderEventsState {
  status:
    | 'disabled'
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'retrying'
    | 'degraded'
    | 'offline'
    | 'stopped'
  error?:
    'http' | 'protocol' | 'network' | 'disconnected' | 'authorization' | 'reset'
  httpStatus?: number
  retryAt?: number
  retryAttempt?: number
  retryFloor?: number
}

/** Development retains its local opt-in; production requires its own explicit flag. */
export function orderEventsEnabled(): boolean {
  if (!import.meta.env.DEV)
    return productionOrderEventsEnabled(orderEventsUrl())
  if (
    !import.meta.env.DEV ||
    import.meta.env.VITE_ORDER_EVENTS_ENABLED !== 'true'
  )
    return false
  try {
    const url = orderEventsApi(
      new URL(orderEventsUrl(), window.location.href).href,
    )
    return Boolean(url && localOrderEventsApi(url))
  } catch {
    return false
  }
}

/**
 * Session-bound transport runner. Production callers mount it only while
 * holding the SSE leadership lock (see coordinated-service.ts).
 */
export function createOrderEventsTransportService(
  options: {
    enabled?: () => boolean
    random?: () => number
    lastEventId?: string
    getLastEventId?: () => string | undefined
    onEvent?: (event: OrderStreamEvent) => void
    initialRetryAttempt?: number
    initialRetryFloor?: number
  } = {},
) {
  const enabled = options.enabled ?? orderEventsEnabled
  const random = options.random ?? Math.random
  let state: OrderEventsState = { status: 'idle' }
  const listeners = new Set<() => void>()
  let mounts = 0
  let epoch = 0
  let controller: AbortController | undefined
  let running = false
  let blockedSession: number | undefined
  let blockedState: OrderEventsState | undefined
  let attempts = options.initialRetryAttempt ?? 0
  let retryFloor = options.initialRetryFloor ?? 5000
  let timer: ReturnType<typeof setTimeout> | undefined
  let unsubscribe: (() => void) | undefined

  function publish(next: OrderEventsState) {
    // Preserve policy across leadership changes even during a short HTTP 200 stream.
    state = { retryAttempt: attempts, retryFloor, ...next }
    listeners.forEach((listener) => listener())
  }
  function authorized() {
    const s = useAuthStore.getState()
    return (
      Boolean(s.accessToken) &&
      s.user?.role === 'admin' &&
      s.roleStatus === 'confirmed' &&
      !s.sessionEnding
    )
  }
  function cancel() {
    epoch++
    clearTimeout(timer)
    timer = undefined
    controller?.abort()
  }
  function stop(error?: OrderEventsState['error'], httpStatus?: number) {
    blockedSession = useAuthStore.getState().sessionId
    cancel()
    blockedState = { status: 'stopped', error, httpStatus }
    publish(blockedState)
  }
  function backoff() {
    const base = Math.min(60_000, retryFloor * 2 ** Math.min(attempts, 8))
    attempts = Math.min(attempts + 1, 9)
    return Math.round(base * (0.8 + Math.max(0, Math.min(1, random())) * 0.2))
  }
  function schedule(result: SseTransportResult, delay?: number) {
    if (!mounts || !authorized()) return
    if (!navigator.onLine) {
      publish({ status: 'offline' })
      return
    }
    const wait = Math.max(backoff(), delay ?? 0)
    publish({
      status:
        result.kind === 'http' && result.status === 503
          ? 'degraded'
          : 'retrying',
      error: result.kind === 'aborted' ? undefined : result.kind,
      ...(result.kind === 'http' ? { httpStatus: result.status } : {}),
      retryAt: Date.now() + wait,
      retryAttempt: attempts,
      retryFloor,
    })
    timer = setTimeout(() => {
      timer = undefined
      reconcile()
    }, wait)
  }

  async function run() {
    running = true
    const s = useAuthStore.getState()
    const sessionId = s.sessionId
    const identity = s.user!.id
    const runEpoch = epoch
    const current = () =>
      mounts > 0 &&
      epoch === runEpoch &&
      authorized() &&
      useAuthStore.getState().sessionId === sessionId &&
      useAuthStore.getState().user?.id === identity
    controller = new AbortController()
    const signal = controller.signal
    let refreshed = false
    let result: SseTransportResult = { kind: 'aborted' }
    let openedAt: number | undefined
    let ready = false
    let reconnect = false
    try {
      while (current()) {
        const rejectedToken = useAuthStore.getState().accessToken!
        publish({ status: 'connecting' })
        openedAt = undefined
        ready = false
        reconnect = false
        result = await openOrderEventsStream({
          accessToken: rejectedToken,
          lastEventId: options.getLastEventId?.() ?? options.lastEventId,
          signal,
          onOpen: () => {
            if (current()) {
              openedAt = Date.now()
              publish({ status: 'connected' })
            }
          },
          onItem: (item) => {
            if (!current() || signal.aborted) return
            if (item.type === 'retry') {
              retryFloor = Math.max(5000, Math.min(60_000, item.milliseconds))
              return
            }
            const decoded = decodeOrderStreamFrame(item.frame)
            if (!decoded.ok) {
              stop('protocol')
              return
            }
            const event = decoded.event
            if (event.type === 'stream.ready') ready = true
            if (
              event.type === 'access.revoked' ||
              (event.type === 'stream.reset' &&
                event.payload.reason === 'authorization_unavailable')
            ) {
              stop('authorization', 403)
            } else if (event.type === 'stream.reset') {
              if (options.getLastEventId) {
                reconnect = true
                controller?.abort()
              } else stop('reset')
            } else if (event.type === 'auth.expiring') {
              reconnect = true
              controller?.abort()
            }
            options.onEvent?.(event)
          },
        })
        if (!current()) return
        if (result.kind !== 'http' || result.status !== 401) break
        if (refreshed) {
          stop('authorization', 401)
          return
        }
        refreshed = true
        try {
          await refreshSseAccessToken({ sessionId, identity, rejectedToken })
        } catch (error) {
          if (current()) {
            const status = isAxiosError(error)
              ? error.response?.status
              : undefined
            if (
              isAxiosError(error) &&
              (status === undefined ||
                status === 408 ||
                status === 429 ||
                status >= 500)
            )
              schedule({ kind: 'network' })
            else stop('authorization', 401)
          }
          return
        }
      }
      if (!current()) return
      // Only a ready stream surviving a heartbeat window resets failures, never HTTP 200 alone.
      if (ready && openedAt !== undefined && Date.now() - openedAt >= 60_000)
        attempts = 0
      if (reconnect) {
        schedule({ kind: 'disconnected' })
        return
      }
      if (result.kind === 'protocol') {
        stop('protocol')
        return
      }
      if (result.kind === 'http') {
        if (
          result.status === 403 ||
          result.status === 404 ||
          (result.status < 500 && result.status !== 429)
        ) {
          stop(result.status === 403 ? 'authorization' : 'http', result.status)
          return
        }
        schedule(
          result,
          result.status === 429
            ? (result.retryAfterMs ?? 30_000)
            : result.status === 503
              ? Math.min(300_000, 60_000 * 2 ** Math.min(attempts, 3))
              : undefined,
        )
      } else schedule(result)
    } finally {
      running = false
      controller = undefined
      // Remount/session change may have arrived while an old request ignored abort.
      if (epoch !== runEpoch && mounts && !timer) reconcile()
    }
  }

  function reconcile() {
    if (!mounts) return
    if (!enabled()) {
      cancel()
      publish({ status: 'disabled' })
      return
    }
    if (!authorized()) {
      cancel()
      publish({ status: 'stopped' })
      return
    }
    if (blockedSession === useAuthStore.getState().sessionId) {
      if (blockedState) publish(blockedState)
      return
    }
    if (!navigator.onLine) {
      cancel()
      publish({ status: 'offline' })
      return
    }
    if (running || timer) return
    if (
      options.lastEventId !== undefined &&
      !orderEventCursorSchema.safeParse(options.lastEventId).success
    ) {
      stop('protocol')
      return
    }
    void run()
  }
  function connectivity() {
    reconcile()
  }

  return {
    restart() {
      cancel()
      schedule({ kind: 'disconnected' })
    },
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    mount() {
      mounts++
      if (mounts === 1) {
        unsubscribe = useAuthStore.subscribe((next, previous) => {
          if (
            next.sessionId !== previous.sessionId ||
            next.user?.id !== previous.user?.id
          ) {
            cancel()
            blockedSession = undefined
            blockedState = undefined
            attempts = 0
            retryFloor = 5000
          }
          reconcile()
        })
        window.addEventListener('online', connectivity)
        window.addEventListener('offline', connectivity)
      }
      reconcile()
      let disposed = false
      return () => {
        if (disposed) return
        disposed = true
        if (--mounts === 0) {
          cancel()
          unsubscribe?.()
          window.removeEventListener('online', connectivity)
          window.removeEventListener('offline', connectivity)
          publish({ status: 'idle' })
        }
      }
    },
  }
}
