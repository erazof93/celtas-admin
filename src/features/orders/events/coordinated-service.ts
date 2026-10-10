import { useAuthStore } from '@/features/auth/store'
import { capturePushSession } from '@/lib/firebase'
import { orderEventsUrl } from '@/lib/api-client'
import {
  createCursorState,
  scopeKey,
  type OrderEventsScope,
} from './cursor-state'
import { createOrderEventsCoordinator } from './coordination'
import {
  createOrderEventsTransportService,
  orderEventsEnabled,
  type OrderEventsState,
} from './service'
import type { OrderStreamEvent } from './types'
import { queryClient } from '@/lib/query-client'
import type { QueryClient } from '@tanstack/react-query'
import { createOrderEventsReconciliation } from './reconciliation'
import {
  reconciledOrderAlerts,
  reconciledOrderAttention,
} from '../alerts/runtime'

export interface CoordinatedOrderEventsState {
  role: 'none' | 'leader' | 'follower'
  status: OrderEventsState['status'] | 'follower' | 'unavailable'
  connection?: OrderEventsState
}

/** One coordinator per tab; shared generation comes from existing login/bootstrap metadata. */
export function createOrderEventsService(
  options: {
    enabled?: () => boolean
    random?: () => number
    onEvent?: (event: OrderStreamEvent) => void
    client?: QueryClient
    onReconciled?: (
      events: Extract<OrderStreamEvent, { cursor: string }>[],
    ) => void
    onAttentionReconciled?: (
      retired: string[],
      pendingIds?: string[],
      observedAt?: number,
    ) => void
  } = {},
) {
  const enabled = options.enabled ?? orderEventsEnabled
  let state: CoordinatedOrderEventsState = { role: 'none', status: 'idle' }
  const listeners = new Set<() => void>()
  let mounts = 0
  let paused = false
  let sessionId: number | undefined
  let scope: OrderEventsScope | undefined
  let cursors: ReturnType<typeof createCursorState> | undefined
  let coordinator: ReturnType<typeof createOrderEventsCoordinator> | undefined
  let stopTransport: (() => void) | undefined
  let unsubscribeTransport: (() => void) | undefined
  let unsubscribeSession: (() => void) | undefined
  let monitor: ReturnType<typeof setInterval> | undefined
  let resumeTimer: ReturnType<typeof setTimeout> | undefined
  let blockedGeneration: string | undefined
  let recovery: ReturnType<typeof createOrderEventsReconciliation> | undefined
  let restartTransport: (() => void) | undefined

  function publish(next: CoordinatedOrderEventsState) {
    state = next
    listeners.forEach((listener) => listener())
  }
  function authorized() {
    const s = useAuthStore.getState()
    return (
      s.accessToken &&
      s.user?.role === 'admin' &&
      s.roleStatus === 'confirmed' &&
      !s.sessionEnding
    )
  }
  function currentScope(): OrderEventsScope | undefined {
    if (!authorized()) return undefined
    const shared = capturePushSession()
    if (
      !shared ||
      shared.revoked ||
      shared.identity !== useAuthStore.getState().user?.id ||
      !shared.generation ||
      shared.generation.length > 128
    )
      return undefined
    try {
      const url = new URL(orderEventsUrl(), window.location.href)
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.href.length > 2048
      )
        return undefined
      return {
        api: url.href,
        identity: shared.identity,
        generation: shared.generation,
      }
    } catch {
      return undefined
    }
  }
  function stopRunner() {
    recovery?.cancel()
    restartTransport = undefined
    clearTimeout(resumeTimer)
    resumeTimer = undefined
    unsubscribeTransport?.()
    unsubscribeTransport = undefined
    stopTransport?.()
    stopTransport = undefined
  }
  function release() {
    recovery?.close()
    recovery = undefined
    stopRunner()
    coordinator?.close()
    coordinator = undefined
  }
  function accept(event: OrderStreamEvent, write: boolean) {
    recovery?.accept(event)
    if (cursors?.observe(event, write) !== 'accepted') return
    options.onEvent?.(event)
  }
  function reconcile() {
    if (!mounts) return
    if (!enabled()) {
      release()
      publish({ role: 'none', status: 'disabled' })
      return
    }
    const next = currentScope()
    const nextSessionId = useAuthStore.getState().sessionId
    const changed =
      scope &&
      (!next ||
        next.generation !== scope.generation ||
        scopeKey(next) !== scopeKey(scope))
    if (changed) {
      cursors?.clear()
      blockedGeneration = undefined
    }
    if (!next || paused || !navigator.onLine) {
      release()
      if (changed) {
        scope = undefined
        cursors = undefined
      }
      publish({
        role: 'none',
        status:
          paused || !navigator.onLine
            ? 'offline'
            : authorized()
              ? 'unavailable'
              : 'stopped',
      })
      return
    }
    if (coordinator && !changed && sessionId === nextSessionId) return
    release()
    if (
      scope?.generation !== next.generation ||
      !scope ||
      scopeKey(scope) !== scopeKey(next)
    )
      cursors = createCursorState(next)
    scope = next
    sessionId = nextSessionId
    if (blockedGeneration === next.generation) return
    const captured = next
    const capturedSessionId = nextSessionId
    const valid = () => {
      const latest = currentScope()
      return (
        mounts > 0 &&
        enabled() &&
        !paused &&
        navigator.onLine &&
        capturedSessionId === useAuthStore.getState().sessionId &&
        latest?.generation === captured.generation &&
        scopeKey(latest) === scopeKey(captured)
      )
    }
    const created = createOrderEventsCoordinator(captured, {
      current: valid,
      onFollower: () => {
        recovery?.recoverViews()
        if (valid()) publish({ role: 'follower', status: 'follower' })
      },
      onLost: stopRunner,
      onUnavailable: () => {
        if (mounts) publish({ role: 'none', status: 'unavailable' })
      },
      onSignal: (signal) => {
        if (!valid()) return
        if (signal.kind === 'position') recovery?.position(signal.cursor)
        else if (signal.kind === 'event') accept(signal.event, false)
        else {
          publish({
            role: 'follower',
            status: signal.state.status === 'stopped' ? 'stopped' : 'follower',
            connection: signal.state,
          })
          if (signal.state.status === 'stopped') {
            if (signal.state.error === 'reset') cursors?.clear()
            blockedGeneration = captured.generation
            created.retire()
          }
        }
      },
      onLeader: (previous) => {
        if (!valid()) return
        cursors = createCursorState(captured)
        if (previous?.status === 'stopped') {
          blockedGeneration = captured.generation
          publish({ role: 'none', status: 'stopped', connection: previous })
          if (previous.error === 'reset') cursors?.clear()
          created.retire()
          return
        }
        const start = () => {
          if (!valid() || !created.isLeader()) return
          const transport = createOrderEventsTransportService({
            enabled: () => valid() && created.isLeader(),
            random: options.random,
            initialRetryAttempt: previous?.retryAttempt,
            initialRetryFloor: previous?.retryFloor,
            getLastEventId: () => {
              const cursor = cursors?.getSnapshot().durable ?? null
              recovery?.position(cursor)
              created.send({ kind: 'position', cursor })
              return cursor ?? undefined
            },
            onEvent: (event) => {
              if (!valid() || !created.isLeader()) return
              // Wire signals always go through the coordinator's v1 projection.
              created.send({ kind: 'event', event })
              if (!valid() || !created.isLeader()) return
              accept(event, true)
            },
          })
          unsubscribeTransport = transport.subscribe(() => {
            if (!valid() || !created.isLeader()) return
            const connection = transport.getSnapshot()
            created.send({ kind: 'state', state: connection })
            publish({ role: 'leader', status: connection.status, connection })
            if (connection.status === 'stopped') {
              blockedGeneration = captured.generation
              // Let synchronous control delivery finish before releasing the lock.
              queueMicrotask(() => {
                if (coordinator === created) release()
              })
            }
          })
          stopTransport = transport.mount()
          restartTransport = transport.restart
        }
        publish({
          role: 'leader',
          status:
            previous?.retryAt && previous.retryAt > Date.now()
              ? previous.status
              : 'connecting',
          connection: previous,
        })
        if (previous?.retryAt && previous.retryAt > Date.now())
          resumeTimer = setTimeout(start, previous.retryAt - Date.now())
        else start()
      },
    })
    recovery = createOrderEventsReconciliation({
      client: options.client ?? queryClient,
      current: valid,
      leader: () => created.isLeader(),
      cursors: () => cursors!,
      session: { identity: captured.identity, sessionId: capturedSessionId },
      onGap: () =>
        queueMicrotask(() => {
          if (valid()) restartTransport?.()
        }),
      onAuthorizationLost: (httpStatus) => {
        if (!valid()) return
        blockedGeneration = captured.generation
        if (created.isLeader())
          created.send({
            kind: 'state',
            state: {
              status: 'stopped',
              error: 'authorization',
              httpStatus,
            },
          })
        release()
        publish({ role: 'none', status: 'stopped' })
      },
      onReconciled: options.onReconciled,
      onAttentionReconciled: options.onAttentionReconciled,
    })
    coordinator = created
    created.start()
  }
  function suspend() {
    paused = true
    release()
    if (mounts) publish({ role: 'none', status: 'offline' })
  }
  function resume() {
    paused = false
    reconcile()
  }
  return {
    getSnapshot: () => state,
    getCursorSnapshot: () => cursors?.getSnapshot(),
    getRecoverySnapshot: () => recovery?.getSnapshot(),
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    mount() {
      if (++mounts === 1) {
        unsubscribeSession = useAuthStore.subscribe(reconcile)
        window.addEventListener('storage', reconcile)
        window.addEventListener('online', reconcile)
        window.addEventListener('offline', reconcile)
        window.addEventListener('pagehide', suspend)
        window.addEventListener('pageshow', resume)
        document.addEventListener('freeze', suspend)
        document.addEventListener('resume', resume)
        monitor = setInterval(reconcile, 5000)
        // FCM initializes legacy shared metadata in its layout effect in this same turn.
        queueMicrotask(reconcile)
      }
      reconcile()
      let disposed = false
      return () => {
        if (disposed) return
        disposed = true
        if (--mounts === 0) {
          release()
          unsubscribeSession?.()
          clearInterval(monitor)
          window.removeEventListener('storage', reconcile)
          window.removeEventListener('online', reconcile)
          window.removeEventListener('offline', reconcile)
          window.removeEventListener('pagehide', suspend)
          window.removeEventListener('pageshow', resume)
          document.removeEventListener('freeze', suspend)
          document.removeEventListener('resume', resume)
          publish({ role: 'none', status: 'idle' })
        }
      }
    },
  }
}
export const orderEventsService = createOrderEventsService({
  onReconciled: reconciledOrderAlerts,
  onAttentionReconciled: reconciledOrderAttention,
})
