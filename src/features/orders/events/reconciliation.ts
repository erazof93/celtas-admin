import { isAxiosError } from 'axios'
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { get } from '@/lib/api-client'
import type { Order, PaginatedOrders } from '../types'
import type { createCursorState } from './cursor-state'
import type { OrderStreamEvent } from './types'
import { readPendingOrders } from '../pending-orders'

type CursorState = ReturnType<typeof createCursorState>
type OrderEvent = Extract<OrderStreamEvent, { cursor: string }>
function validOrder(order: Order | null | undefined) {
  return Boolean(
    order &&
    typeof order.id === 'string' &&
    Array.isArray(order.items) &&
    ['pendiente', 'confirmado', 'en_camino', 'entregado', 'cancelado'].includes(
      order.status,
    ) &&
    typeof order.updatedAt === 'string' &&
    Number.isFinite(Date.parse(order.updatedAt)) &&
    (order.user === null ||
      (typeof order.user === 'object' && order.user !== undefined)),
  )
}

/** REST acknowledges current views and affected entities, never historical transitions. */
export function createOrderEventsReconciliation(options: {
  client: QueryClient
  current: () => boolean
  leader: () => boolean
  cursors: () => CursorState
  session: { identity: string; sessionId: number }
  onAuthorizationLost: (status: 401 | 403) => void
  onGap: () => void
  onReconciled?: (liveCreated: OrderEvent[]) => void
}) {
  const { client } = options
  let closed = false
  let epoch = 0
  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let pending: OrderEvent[] = []
  const carry = new Set<string>()
  let exhausted = false
  let baseline: string | undefined
  let full = false
  let unsafe = true // No cursor acknowledgement before a validated ready boundary.
  let expected: string | null = options.cursors().getSnapshot().durable
  let connectionCursor: string | null = expected
  let mutationVersion = 0
  let failures = 0
  let status: 'idle' | 'pending' | 'recovering' | 'failed' | 'blocked' = 'idle'
  let readyHead: string | undefined
  const liveCreated = new Set<string>()
  let dashboardTimer: ReturnType<typeof setTimeout> | undefined
  const isOrderMutation = (key?: QueryKey) => key?.[0] === 'orders'
  const busy = () =>
    client
      .getMutationCache()
      .getAll()
      .some(
        (mutation) =>
          isOrderMutation(mutation.options.mutationKey) &&
          mutation.state.status === 'pending',
      )
  const unsubscribe = client.getMutationCache().subscribe((event) => {
    if (
      'mutation' in event &&
      event.mutation &&
      isOrderMutation(event.mutation.options.mutationKey)
    )
      mutationVersion++
  })
  const current = () => !closed && options.current()
  const scoped = (key: QueryKey) => {
    const tail = key.at(-1)
    return (
      typeof tail === 'object' &&
      tail !== null &&
      'identity' in tail &&
      'sessionId' in tail &&
      tail.identity === options.session.identity &&
      tail.sessionId === options.session.sessionId
    )
  }
  function gap() {
    if (unsafe) return
    unsafe = true
    liveCreated.clear()
    options.cursors().invalidatePosition(options.leader())
    full = true
    options.onGap()
  }
  function retainPendingIds() {
    for (const event of pending) {
      if (carry.size < 256 || carry.has(event.payload.orderId))
        carry.add(event.payload.orderId)
      else exhausted = true
    }
    pending = []
    if (exhausted) options.cursors().invalidatePosition(options.leader())
  }
  function schedule(delay = 100) {
    if (!current() || timer || running) return
    status = 'pending'
    timer = setTimeout(() => {
      timer = undefined
      void recover()
    }, delay)
  }
  async function recover() {
    if (!current() || !navigator.onLine) return
    if (busy()) {
      schedule(250)
      return
    }
    running = true
    status = 'recovering'
    const capturedEpoch = epoch
    const version = mutationVersion
    const batch = pending.slice()
    const carriedIds = [...carry]
    const base = baseline
    const allDetails = full
    controller = new AbortController()
    const signal = controller.signal
    const request = {
      signal,
      timeout: 90_000,
      onAuthorizationError: () => options.onAuthorizationLost(403),
    }
    const read = <T>(url: string, params?: Record<string, unknown>) =>
      new Promise<T>((resolve, reject) => {
        if (signal.aborted) {
          reject(new Error('Recovery canceled'))
          return
        }
        const abort = () => reject(new Error('Recovery canceled'))
        signal.addEventListener('abort', abort, { once: true })
        void get<T>(url, { ...request, ...(params ? { params } : {}) }).then(
          (value) => {
            signal.removeEventListener('abort', abort)
            resolve(value)
          },
          (error: unknown) => {
            signal.removeEventListener('abort', abort)
            reject(error)
          },
        )
      })
    const valid = () => current() && epoch === capturedEpoch && !signal.aborted
    const staged: { key: QueryKey; value: unknown }[] = []
    const confirmedIds = new Set<string>()
    try {
      const lists = client
        .getQueryCache()
        .findAll({ queryKey: ['orders', 'list'] })
        .filter((query) => query.isActive() && scoped(query.queryKey))
      const details = client
        .getQueryCache()
        .findAll({ queryKey: ['orders', 'detail'] })
        .filter(
          (query) =>
            scoped(query.queryKey) &&
            (allDetails ||
              batch.some(
                (event) => event.payload.orderId === query.queryKey[2],
              )),
        )
      const trays = client
        .getQueryCache()
        .findAll({ queryKey: ['orders', 'pending'] })
        .filter((query) => query.isActive() && scoped(query.queryKey))
      const versions = [...lists, ...details, ...trays].map((query) => ({
        query,
        updatedAt: query.state.dataUpdatedAt,
        data: query.state.data,
      }))
      await client.invalidateQueries({
        queryKey: ['orders', 'list'],
        refetchType: 'none',
      })
      await client.invalidateQueries({
        queryKey: ['orders', 'detail'],
        refetchType: 'none',
      })
      // Cancel superseded reads, not mutations. Their old responses must not overwrite this batch.
      await Promise.all(
        [...lists, ...details, ...trays].map((query) =>
          client.cancelQueries({ queryKey: query.queryKey, exact: true }),
        ),
      )
      if (!valid()) return
      const listRequests = new Map<
        string,
        { params: Record<string, unknown>; keys: QueryKey[] }
      >()
      const addList = (params: Record<string, unknown>, key?: QueryKey) => {
        const signature = JSON.stringify(params)
        const entry = listRequests.get(signature) ?? { params, keys: [] }
        if (key) entry.keys.push(key)
        listRequests.set(signature, entry)
      }
      addList({ page: 1, limit: 10 }) // Explicit recovery even with no mounted orders query.
      lists.forEach(({ queryKey: key }) =>
        addList(
          {
            page: key[2],
            limit: key[3],
            ...(key[4] !== 'all' ? { status: key[4] } : {}),
            ...(key[5] !== 'all' ? { userId: key[5] } : {}),
          },
          key,
        ),
      )
      for (const entry of listRequests.values()) {
        const result = await read<PaginatedOrders>('/orders', entry.params)
        if (
          !result ||
          !Array.isArray(result.items) ||
          !result.items.every(validOrder) ||
          !result.meta ||
          ![
            result.meta.page,
            result.meta.limit,
            result.meta.total,
            result.meta.totalPages,
          ].every(Number.isSafeInteger) ||
          result.meta.page < 1 ||
          result.meta.limit < 1 ||
          result.meta.limit > 100 ||
          result.meta.total < 0 ||
          result.meta.totalPages < 0
        )
          throw new Error('Invalid orders recovery response')
        if (!valid()) return
        entry.keys.forEach((key) => staged.push({ key, value: result }))
      }
      if (trays.length) {
        const result = await readPendingOrders((page) =>
          read<PaginatedOrders>('/orders', {
            page,
            limit: 100,
            status: 'pendiente',
          }),
        )
        if (!result.items.every(validOrder))
          throw new Error('Invalid pending recovery response')
        if (!valid()) return
        trays.forEach((query) =>
          staged.push({ key: query.queryKey, value: result }),
        )
      }
      const ids = new Set([
        ...carriedIds,
        ...batch.map((event) => event.payload.orderId),
      ])
      details.forEach((query) => {
        if (typeof query.queryKey[2] === 'string') ids.add(query.queryKey[2])
      })
      // Sequential, bounded by 256 signals; no burst of 100 parallel detail requests.
      for (const id of ids) {
        let result: Order | null
        try {
          result = await read<Order>(`/orders/${id}`)
          if (!validOrder(result) || result.id !== id)
            throw new Error('Invalid order recovery response')
        } catch (error) {
          if (!isAxiosError(error) || error.response?.status !== 404)
            throw error
          result = null // A confirmed absence is authoritative, not an SSE deletion.
        }
        if (!valid()) return
        if (result) confirmedIds.add(id)
        details
          .filter((query) => query.queryKey[2] === id)
          .forEach((query) =>
            staged.push({ key: query.queryKey, value: result }),
          )
      }
      if (!valid()) return
      if (
        busy() ||
        version !== mutationVersion ||
        versions.some(
          ({ query, updatedAt, data }) =>
            query.state.dataUpdatedAt !== updatedAt ||
            query.state.data !== data,
        )
      ) {
        status = 'pending'
        return
      }
      staged.forEach(({ key, value }) => client.setQueryData(key, value))
      pending.splice(0, batch.length)
      carriedIds.forEach((id) => carry.delete(id))
      if (baseline === base) baseline = undefined
      full = false
      const cursor = batch.at(-1)?.cursor ?? base
      if (cursor !== undefined && !unsafe)
        options.cursors().acknowledge(cursor, options.leader())
      const alerts = !unsafe
        ? batch.filter(
            (event) =>
              liveCreated.has(event.payload.eventId) &&
              confirmedIds.has(event.payload.orderId),
          )
        : []
      batch.forEach((event) => liveCreated.delete(event.payload.eventId))
      // Alert failures must never invalidate an already confirmed REST/cursor batch.
      try {
        options.onReconciled?.(alerts)
      } catch {
        /* Optional UI consumer. */
      }
      if (!dashboardTimer)
        dashboardTimer = setTimeout(() => {
          dashboardTimer = undefined
          if (current())
            void client.invalidateQueries({ queryKey: ['dashboard'] })
        }, 500)
      failures = 0
      status = 'idle'
    } catch (error) {
      if (!valid()) return
      status = 'failed'
      const http = isAxiosError(error) ? error.response?.status : undefined
      if (http === 401 || http === 403) {
        status = 'blocked'
        options.onAuthorizationLost(http)
        return
      }
      failures = Math.min(failures + 1, 6)
    } finally {
      running = false
      controller = undefined
      if (
        current() &&
        status !== 'blocked' &&
        (pending.length || carry.size || baseline !== undefined || full)
      )
        schedule(failures ? Math.min(60_000, 1000 * 2 ** failures) : 100)
    }
  }
  return {
    position(cursor: string | null) {
      connectionCursor = cursor
    },
    getSnapshot: () => ({ status, pending: pending.length, exhausted }),
    recoverViews() {
      full = true
      schedule()
    },
    cancel() {
      epoch++
      controller?.abort()
      clearTimeout(timer)
      timer = undefined
    },
    accept(event: OrderStreamEvent) {
      if (!current()) return
      if (event.type === 'stream.reset') {
        readyHead = undefined
        liveCreated.clear()
        epoch++
        controller?.abort()
        retainPendingIds()
        baseline = undefined
        options.cursors().clear(options.leader())
        expected = null
        unsafe = true
        full = true
        if (event.payload.reason !== 'authorization_unavailable') schedule()
      } else if (event.type === 'stream.ready') {
        readyHead = event.payload.headCursor
        liveCreated.clear()
        epoch++
        controller?.abort()
        retainPendingIds()
        // With durable replay, ready is not an acknowledgement of the head.
        const durable = connectionCursor
        expected = durable
        unsafe = exhausted
        baseline = durable === null ? event.payload.headCursor : undefined
        full = true
        schedule()
      } else if ('cursor' in event) {
        const conflict = [
          ...pending.map((entry) => ({
            cursor: entry.cursor,
            eventId: entry.payload.eventId,
          })),
          ...options.cursors().getSnapshot().recent,
        ].some(
          (entry) =>
            (entry.cursor === event.cursor ||
              entry.eventId === event.payload.eventId) &&
            (entry.cursor !== event.cursor ||
              entry.eventId !== event.payload.eventId),
        )
        if (conflict) {
          gap()
        }
        if (
          pending.some(
            (entry) =>
              entry.cursor === event.cursor &&
              entry.payload.eventId === event.payload.eventId,
          )
        )
          return
        const processed = options.cursors().getSnapshot().processed
        if (processed !== null && BigInt(event.cursor) <= BigInt(processed))
          return
        // Backend assigns contiguous cursors in a locked transaction. A missing signal is unsafe.
        const previous = expected ?? baseline
        if (
          (previous !== undefined &&
            previous !== null &&
            BigInt(event.cursor) !== BigInt(previous) + 1n) ||
          pending.length >= 256
        ) {
          gap()
        }
        expected = event.cursor
        if (
          !unsafe &&
          readyHead !== undefined &&
          event.type === 'order.created' &&
          BigInt(event.cursor) > BigInt(readyHead)
        )
          liveCreated.add(event.payload.eventId)
        if (pending.length < 256) pending.push(event)
        schedule()
      }
    },
    close() {
      closed = true
      epoch++
      controller?.abort()
      clearTimeout(timer)
      clearTimeout(dashboardTimer)
      unsubscribe()
    },
  }
}
