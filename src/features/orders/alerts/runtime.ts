import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useAuthStore } from '@/features/auth/store'
import { get, orderEventsUrl } from '@/lib/api-client'
import { capturePushSession } from '@/lib/firebase'
import { queryClient } from '@/lib/query-client'
import { localOrderAlertsEnabled } from './environment'
import { subscribeForegroundOrders, type ForegroundOrder } from './foreground'
import { createOrderAlertsService, type AlertScope } from './service'
import type { OrderStreamEvent } from '../events/types'

function currentScope(): AlertScope | undefined {
  if (!localOrderAlertsEnabled()) return
  const session = useAuthStore.getState()
  const shared = capturePushSession()
  if (
    !session.accessToken ||
    session.user?.role !== 'admin' ||
    session.roleStatus !== 'confirmed' ||
    session.sessionEnding ||
    !shared ||
    shared.revoked ||
    shared.identity !== session.user.id
  )
    return
  return {
    api: orderEventsUrl(),
    identity: shared.identity,
    generation: shared.generation,
  }
}
export const orderAlerts = createOrderAlertsService({
  scope: currentScope,
  async validateRestored(ids, signal) {
    const retained: string[] = []
    for (const id of ids) {
      if (signal.aborted) throw new Error('Session ended')
      try {
        const result = confirmedOrder.parse(
          await get<unknown>(`/orders/${id}`, { signal, timeout: 15000 }),
        )
        if (result.id !== id) throw new Error('Unexpected order')
        if (result.status === 'pendiente') retained.push(id)
      } catch (error) {
        if (!isAxiosError(error) || error.response?.status !== 404) throw error
      }
    }
    return retained
  },
})
let mounts = 0
let cleanup: (() => void) | undefined
let activeSignature: string | undefined
let since = Date.now()
let requests = new AbortController()
const pending = new Set<string>()
const signature = () => JSON.stringify(currentScope())
function sync() {
  const next = signature()
  if (next !== activeSignature) {
    activeSignature = next
    since = Date.now()
    requests.abort()
    requests = new AbortController()
    pending.clear()
  }
  orderAlerts.sync()
}
const confirmedOrder = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  status: z.enum([
    'pendiente',
    'confirmado',
    'en_camino',
    'entregado',
    'cancelado',
  ]),
})
async function foreground(order: ForegroundOrder) {
  const captured = currentScope()
  if (
    !mounts ||
    !captured ||
    captured.identity !== order.identity ||
    captured.generation !== order.generation ||
    pending.has(order.orderId) ||
    pending.size >= 256
  )
    return
  const capturedSignature = signature()
  const signal = requests.signal
  pending.add(order.orderId)
  try {
    const result = confirmedOrder.safeParse(
      await get<unknown>(`/orders/${order.orderId}`, {
        signal,
        timeout: 15000,
      }),
    )
    if (
      signal.aborted ||
      signature() !== capturedSignature ||
      !result.success ||
      result.data.id !== order.orderId
    )
      return
    const createdAt = Date.parse(result.data.createdAt)
    if (result.data.status !== 'pendiente') {
      await orderAlerts.retire([order.orderId])
      return
    }
    // FCM has no cursor/timestamp in this API contract. Confirm freshness via REST.
    if (createdAt < since || createdAt > Date.now() + 5000) return
    void queryClient.invalidateQueries({ queryKey: ['orders'] })
    scheduleDashboard()
    await orderAlerts.offer(order.orderId)
  } catch {
    /* Keep FCM best-effort; SSE and REST retain their existing retry policy. */
  } finally {
    if (requests.signal === signal) pending.delete(order.orderId)
  }
}
let dashboardTimer: ReturnType<typeof setTimeout> | undefined
function scheduleDashboard() {
  if (dashboardTimer) return
  const captured = signature()
  dashboardTimer = setTimeout(() => {
    dashboardTimer = undefined
    if (mounts && captured === signature() && currentScope())
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }, 500)
}
export function mountOrderAlerts() {
  if (!localOrderAlertsEnabled()) return () => {}
  if (++mounts === 1) {
    const unsubscribe = useAuthStore.subscribe(sync)
    const stopForeground = subscribeForegroundOrders((order) => {
      void foreground(order)
    })
    const pendingReads = new Map<string, number>()
    const stopCache = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || !currentScope()) return
      const { queryKey, state } = event.query
      const session = useAuthStore.getState()
      const tail = queryKey.at(-1)
      if (
        queryKey[0] !== 'orders' ||
        typeof tail !== 'object' ||
        !tail ||
        !('identity' in tail) ||
        !('sessionId' in tail) ||
        tail.identity !== session.user?.id ||
        tail.sessionId !== session.sessionId
      )
        return
      if (event.action.type === 'fetch' && queryKey[1] === 'pending') {
        pendingReads.set(event.query.queryHash, Date.now())
        return
      }
      if (event.action.type !== 'success') return
      if (queryKey[1] === 'detail' && typeof queryKey[2] === 'string') {
        const detail = confirmedOrder.safeParse(state.data)
        if (
          state.data === null ||
          (detail.success &&
            detail.data.id === queryKey[2] &&
            detail.data.status !== 'pendiente')
        )
          void orderAlerts.retire([queryKey[2]])
      } else if (queryKey[1] === 'pending') {
        // Reconciliation handles manual cache writes with its own REST start boundary.
        if (event.action.manual) return
        const observedAt =
          pendingReads.get(event.query.queryHash) ?? state.dataUpdatedAt
        pendingReads.delete(event.query.queryHash)
        const list = z
          .object({
            items: z.array(
              z.object({ id: z.uuid(), status: z.literal('pendiente') }),
            ),
            meta: z.object({ total: z.number().int().nonnegative() }),
          })
          .safeParse(state.data)
        if (list.success && list.data.items.length === list.data.meta.total)
          void orderAlerts.retainPending(
            list.data.items.map((order) => order.id),
            observedAt,
          )
      }
    })
    window.addEventListener('storage', sync)
    cleanup = () => {
      unsubscribe()
      stopForeground()
      stopCache()
      window.removeEventListener('storage', sync)
      requests.abort()
      clearTimeout(dashboardTimer)
      dashboardTimer = undefined
      pending.clear()
      activeSignature = undefined
      orderAlerts.close()
    }
    sync()
    queueMicrotask(() => {
      if (mounts) sync()
    })
  }
  let disposed = false
  return () => {
    if (!disposed) {
      disposed = true
      if (--mounts === 0) cleanup?.()
    }
  }
}
/** Called only after REST reconciliation has committed its cache/cursor results. */
export function reconciledOrderAlerts(
  liveCreated: Extract<OrderStreamEvent, { cursor: string }>[],
) {
  if (!mounts || !currentScope()) return
  liveCreated.forEach((event) => {
    if (event.type === 'order.created')
      void orderAlerts.offer(event.payload.orderId)
  })
}

/** Only committed REST results can retire attention; absence from a paginated list cannot. */
export function reconciledOrderAttention(
  retired: string[],
  pendingIds?: string[],
  observedAt = Date.now(),
) {
  if (!mounts || !currentScope()) return
  void orderAlerts.retire(retired)
  if (pendingIds) void orderAlerts.retainPending(pendingIds, observedAt)
}
