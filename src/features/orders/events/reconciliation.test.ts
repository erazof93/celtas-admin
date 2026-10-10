import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { AxiosError, type AxiosResponse } from 'axios'
import { get } from '@/lib/api-client'
import { createCursorState } from './cursor-state'
import { createOrderEventsReconciliation } from './reconciliation'
import type { OrderStreamEvent } from './types'

vi.mock('@/lib/api-client', () => ({ get: vi.fn() }))
const scope = {
  api: 'http://localhost:3000/admin/orders/events',
  identity: 'admin',
  generation: 'a',
}
const session = { identity: 'admin', sessionId: 1 }
const id = '10000000-0000-4000-8000-000000000000'
const event = (
  cursor: string,
  orderId = id,
): Extract<OrderStreamEvent, { cursor: string }> => ({
  type: 'order.updated',
  cursor,
  payload: {
    v: 1,
    orderId,
    eventId: `00000000-0000-4000-8000-${cursor.slice(-12).padStart(12, '0')}`,
    status: 'confirmado',
    occurredAt: '2026-10-08T12:00:00Z',
  },
})
const ready = (headCursor: string): OrderStreamEvent => ({
  type: 'stream.ready',
  payload: { v: 1, headCursor, floorCursor: '0', recovery: 'rest' },
})
const list = {
  items: [],
  meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
}
const detail = {
  id,
  status: 'confirmado',
  items: [],
  user: null,
  updatedAt: '2026-10-08T12:00:00Z',
}
const cleanups: (() => void)[] = []
function http(status: number) {
  return new AxiosError('REST failed', undefined, undefined, undefined, {
    status,
  } as AxiosResponse)
}
function fixture(leader = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const cursors = createCursorState(scope)
  let valid = true
  const lost = vi.fn(),
    gap = vi.fn()
  const reconciled = vi.fn()
  const attentionReconciled = vi.fn()
  const recovery = createOrderEventsReconciliation({
    client,
    cursors: () => cursors,
    session,
    current: () => valid,
    leader: () => leader,
    onAuthorizationLost: lost,
    onGap: gap,
    onReconciled: reconciled,
    onAttentionReconciled: attentionReconciled,
  })
  cleanups.push(() => {
    recovery.close()
    client.clear()
  })
  return {
    client,
    cursors,
    recovery,
    lost,
    gap,
    reconciled,
    attentionReconciled,
    invalidate: () => {
      valid = false
      recovery.cancel()
    },
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  vi.stubGlobal('navigator', { onLine: true })
  vi.mocked(get)
    .mockReset()
    .mockImplementation(async (url) => (url === '/orders' ? list : detail))
})
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const tick = () => vi.advanceTimersByTimeAsync(100)
describe('REST acknowledgement of SSE', () => {
  it('reconciles the independent pending tray on new, accepted, reconnect and reset without historical alerts', async () => {
    const { client, recovery, cursors, reconciled, attentionReconciled } =
      fixture()
    const key = ['orders', 'pending', session]
    const observer = new QueryObserver(client, {
      queryKey: key,
      queryFn: async () => list,
      initialData: list,
      staleTime: Infinity,
    })
    cleanups.push(observer.subscribe(() => {}))
    let pending = true
    const pendingDetail = {
      ...detail,
      status: 'pendiente',
      createdAt: '2026-10-09T12:00:00Z',
    }
    vi.mocked(get).mockImplementation(async (url, config) => {
      if (url !== '/orders') return pending ? pendingDetail : detail
      const filtered = config?.params?.status === 'pendiente'
      return filtered && pending
        ? {
            items: [pendingDetail],
            meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
          }
        : list
    })
    recovery.accept(ready('0'))
    await tick()
    expect(client.getQueryData(key)).toMatchObject({ items: [pendingDetail] })
    expect(reconciled).toHaveBeenLastCalledWith([])
    expect(attentionReconciled).toHaveBeenLastCalledWith(
      [],
      [id],
      expect.any(Number),
    )
    recovery.accept({ ...event('1'), type: 'order.created' })
    await tick()
    expect(cursors.getSnapshot().durable).toBe('1')
    expect(reconciled.mock.lastCall?.[0]).toHaveLength(1)
    pending = false
    recovery.accept({ ...event('2'), type: 'order.status_changed' })
    await tick()
    expect(client.getQueryData(key)).toMatchObject({ items: [] })
    expect(reconciled).toHaveBeenLastCalledWith([])
    expect(attentionReconciled).toHaveBeenLastCalledWith(
      [id],
      [],
      expect.any(Number),
    )
    pending = true
    recovery.position('2')
    recovery.accept(ready('3'))
    recovery.accept({ ...event('3'), type: 'order.created' })
    await tick()
    expect(client.getQueryData(key)).toMatchObject({ items: [pendingDetail] })
    expect(reconciled).toHaveBeenLastCalledWith([])
    pending = false
    recovery.accept({
      type: 'stream.reset',
      payload: { v: 1, reason: 'cursor_unavailable' },
    })
    recovery.position(null)
    recovery.accept(ready('4'))
    await tick()
    expect(client.getQueryData(key)).toMatchObject({ items: [] })
    expect(reconciled).toHaveBeenLastCalledWith([])
  })
  it('only live created events alert, after successful REST and durable acknowledgement', async () => {
    const { recovery, cursors, reconciled } = fixture()
    recovery.accept(ready('9'))
    const created = { ...event('10'), type: 'order.created' as const }
    recovery.accept(created)
    expect(reconciled).not.toHaveBeenCalled()
    await tick()
    expect(cursors.getSnapshot().durable).toBe('10')
    expect(reconciled).toHaveBeenLastCalledWith([created])
    recovery.accept(created)
    await tick()
    expect(reconciled).toHaveBeenCalledTimes(1)
  })
  it.each(['order.updated', 'order.status_changed'] as const)(
    '%s refreshes data without a new-order alert',
    async (type) => {
      const { recovery, reconciled } = fixture()
      recovery.accept(ready('9'))
      recovery.accept({ ...event('10'), type })
      await tick()
      expect(reconciled).toHaveBeenLastCalledWith([])
    },
  )
  it('Last-Event-ID replay and reset recovery do not generate historical alerts', async () => {
    const { recovery, cursors, reconciled } = fixture()
    cursors.acknowledge('8', true)
    recovery.position('8')
    recovery.accept(ready('10'))
    recovery.accept({ ...event('9'), type: 'order.created' })
    recovery.accept({ ...event('10'), type: 'order.created' })
    await tick()
    expect(reconciled).toHaveBeenLastCalledWith([])
    recovery.accept({ ...event('11'), type: 'order.created' })
    recovery.accept({
      type: 'stream.reset',
      payload: { v: 1, reason: 'cursor_unavailable' },
    })
    recovery.position(null)
    recovery.accept(ready('12'))
    await tick()
    expect(reconciled).toHaveBeenLastCalledWith([])
  })
  it('failed REST cannot alert, and a retry alerts only once after confirmation', async () => {
    const { recovery, reconciled } = fixture()
    vi.mocked(get).mockRejectedValueOnce(http(503))
    recovery.accept(ready('9'))
    recovery.accept({ ...event('10'), type: 'order.created' })
    await tick()
    expect(reconciled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(reconciled).toHaveBeenCalledTimes(1)
    expect(reconciled.mock.calls[0][0]).toHaveLength(1)
  })
  it('coalesces dashboard invalidation and cancels it when closed', async () => {
    const { recovery, client } = fixture()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    recovery.accept(ready('9'))
    recovery.accept(event('10'))
    await tick()
    recovery.accept(event('11'))
    await tick()
    expect(
      invalidate.mock.calls.filter(
        ([options]) => options?.queryKey?.[0] === 'dashboard',
      ),
    ).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(500)
    expect(
      invalidate.mock.calls.filter(
        ([options]) => options?.queryKey?.[0] === 'dashboard',
      ),
    ).toHaveLength(1)
    recovery.accept(event('12'))
    await tick()
    recovery.close()
    await vi.advanceTimersByTimeAsync(500)
    expect(
      invalidate.mock.calls.filter(
        ([options]) => options?.queryKey?.[0] === 'dashboard',
      ),
    ).toHaveLength(1)
  })
  it('recovers known pending IDs before confirming a fresh base after a failed connection', async () => {
    const { recovery, cursors } = fixture()
    vi.mocked(get).mockRejectedValueOnce(http(503))
    recovery.accept(ready('8'))
    recovery.accept(event('9'))
    await tick()
    recovery.position(null)
    recovery.accept(ready('12'))
    await vi.advanceTimersByTimeAsync(2000)
    expect(get).toHaveBeenCalledWith(
      `/orders/${id}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(cursors.getSnapshot().durable).toBe('12')
  })
  it.each(['list', 'detail'])(
    'does not acknowledge a malformed REST %s response',
    async (kind) => {
      const { recovery, cursors } = fixture()
      vi.mocked(get).mockImplementation(async (url) =>
        url === '/orders'
          ? kind === 'list'
            ? { items: [] }
            : list
          : { ...detail, id: 'wrong-id' },
      )
      recovery.accept(ready('8'))
      recovery.accept(event('9'))
      await tick()
      expect(cursors.getSnapshot().processed).toBeNull()
      expect(cursors.getSnapshot().durable).toBeNull()
    },
  )
  it('never confirms events delivered before a ready boundary', async () => {
    const { recovery, cursors } = fixture()
    recovery.accept(event('9'))
    await tick()
    expect(cursors.getSnapshot().durable).toBeNull()
  })

  it('does not publish a staged list over a newer polling response', async () => {
    const { recovery, cursors, client } = fixture()
    const key = ['orders', 'list', 1, 10, 'all', 'all', session]
    const observer = new QueryObserver(client, {
      queryKey: key,
      queryFn: async () => list,
      staleTime: Infinity,
      initialData: list,
    })
    cleanups.push(observer.subscribe(() => {}))
    let resolve!: (value: unknown) => void
    vi.mocked(get).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    recovery.accept(ready('9'))
    await tick()
    const latest = { ...list, items: [detail] }
    client.setQueryData(key, latest)
    resolve(list)
    await vi.advanceTimersByTimeAsync(0)
    expect(client.getQueryData(key)).toEqual(latest)
    expect(cursors.getSnapshot().durable).toBeNull()
    vi.mocked(get).mockResolvedValue(latest)
    await tick()
    expect(cursors.getSnapshot().durable).toBe('9')
  })

  it('recovers a new ready boundary without waiting for a REST provider that ignores abort', async () => {
    const { recovery, cursors } = fixture()
    vi.mocked(get).mockImplementationOnce(() => new Promise(() => {}))
    recovery.accept(ready('9'))
    await tick()
    recovery.accept({
      type: 'stream.reset',
      payload: { v: 1, reason: 'cursor_unavailable' },
    })
    recovery.position(null)
    recovery.accept(ready('12'))
    await tick()
    expect(cursors.getSnapshot().durable).toBe('12')
  })
  it('discards staged results if a mutation starts and ends during the REST read', async () => {
    const { recovery, cursors, client } = fixture()
    let resolve!: (value: unknown) => void
    vi.mocked(get).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    recovery.accept(ready('9'))
    await tick()
    const mutation = client.getMutationCache().build(client, {
      mutationKey: ['orders', 'status'],
      mutationFn: async () => undefined,
    })
    await mutation.execute(undefined)
    resolve(list)
    await vi.advanceTimersByTimeAsync(0)
    expect(cursors.getSnapshot().durable).toBeNull()
    await tick()
    expect(cursors.getSnapshot().durable).toBe('9')
  })

  it('invalidates conflicting event IDs instead of treating them as safe replay', async () => {
    const { recovery, cursors, gap } = fixture()
    recovery.accept(ready('8'))
    const first = event('9'),
      second = event('10')
    if ('cursor' in first && 'cursor' in second)
      second.payload.eventId = first.payload.eventId
    recovery.accept(first)
    recovery.accept(second)
    await tick()
    expect(gap).toHaveBeenCalledOnce()
    expect(cursors.getSnapshot().durable).toBeNull()
  })
  it('recovers outside orders and only then establishes a fresh head baseline', async () => {
    const { recovery, cursors } = fixture()
    recovery.position(null)
    recovery.accept(ready('9'))
    expect(cursors.getSnapshot().durable).toBeNull()
    await tick()
    expect(get).toHaveBeenCalledWith(
      '/orders',
      expect.objectContaining({ params: { page: 1, limit: 10 } }),
    )
    expect(cursors.getSnapshot()).toMatchObject({
      processed: '9',
      durable: '9',
    })
  })
  it('coalesces bursts, deduplicates IDs and updates active filtered lists and details from REST', async () => {
    const { recovery, cursors, client } = fixture()
    const listKey = ['orders', 'list', 2, 10, 'pendiente', 'all', session]
    const detailKey = ['orders', 'detail', id, session]
    const observer = new QueryObserver(client, {
      queryKey: listKey,
      queryFn: async () => list,
      staleTime: Infinity,
      initialData: list,
    })
    cleanups.push(observer.subscribe(() => {}))
    client.setQueryData(detailKey, { ...detail, status: 'pendiente' })
    recovery.position(null)
    recovery.accept(ready('8'))
    for (const cursor of ['9', '10', '11', '12']) {
      recovery.accept(event(cursor))
      recovery.accept(event(cursor))
    }
    await tick()
    expect(
      vi.mocked(get).mock.calls.filter(([url]) => url === `/orders/${id}`),
    ).toHaveLength(1)
    expect(get).toHaveBeenCalledWith(
      '/orders',
      expect.objectContaining({
        params: { page: 2, limit: 10, status: 'pendiente' },
      }),
    )
    expect(client.getQueryData(detailKey)).toEqual(detail)
    expect(cursors.getSnapshot().durable).toBe('12')
  })
  it('does not skip replay to ready head with a previous durable cursor', async () => {
    const { cursors, recovery } = fixture()
    cursors.acknowledge('8', true)
    recovery.position('8')
    recovery.accept(ready('12'))
    await tick()
    expect(cursors.getSnapshot().durable).toBe('8')
    for (const cursor of ['9', '10', '11', '12']) recovery.accept(event(cursor))
    await tick()
    expect(cursors.getSnapshot().durable).toBe('12')
  })
  it('handles a full replay of 100 without skipping or parallel detail requests', async () => {
    const { recovery, cursors } = fixture()
    cursors.acknowledge('8', true)
    recovery.position('8')
    recovery.accept(ready('108'))
    for (let cursor = 9; cursor <= 108; cursor++)
      recovery.accept(event(String(cursor)))
    await tick()
    expect(cursors.getSnapshot().durable).toBe('108')
    expect(get).toHaveBeenCalledTimes(2)
  })
  it('keeps bigint cursors exact', async () => {
    const { recovery, cursors } = fixture()
    recovery.position(null)
    recovery.accept(ready('9223372036854775806'))
    recovery.accept(event('9223372036854775807'))
    await tick()
    expect(cursors.getSnapshot().durable).toBe('9223372036854775807')
  })
  it('never acknowledges failed REST and retries the retained batch', async () => {
    const { recovery, cursors } = fixture()
    vi.mocked(get).mockRejectedValueOnce(http(503))
    recovery.accept(ready('9'))
    recovery.accept(event('10'))
    await tick()
    expect(cursors.getSnapshot().durable).toBeNull()
    await vi.advanceTimersByTimeAsync(2000)
    expect(cursors.getSnapshot().durable).toBe('10')
  })
  it.each([401, 403])(
    'blocks on definitive REST %s without cursor advancement',
    async (status) => {
      const { recovery, cursors, lost } = fixture()
      vi.mocked(get).mockRejectedValue(http(status))
      recovery.accept(ready('9'))
      await tick()
      expect(lost).toHaveBeenCalledOnce()
      expect(lost).toHaveBeenCalledWith(status)
      expect(cursors.getSnapshot().durable).toBeNull()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(get).toHaveBeenCalledOnce()
    },
  )
  it('treats individual 404 as confirmed absence', async () => {
    const { recovery, cursors, client } = fixture()
    const key = ['orders', 'detail', id, session]
    client.setQueryData(key, detail)
    vi.mocked(get).mockImplementation(async (url) => {
      if (url !== '/orders') throw http(404)
      return list
    })
    recovery.accept(ready('9'))
    recovery.accept(event('10'))
    await tick()
    expect(client.getQueryData(key)).toBeNull()
    expect(cursors.getSnapshot().durable).toBe('10')
  })
  it('ignores late old-session responses even when REST ignores abort', async () => {
    const { recovery, cursors, client, invalidate } = fixture()
    let resolve!: (value: unknown) => void
    vi.mocked(get).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    recovery.accept(ready('9'))
    await tick()
    invalidate()
    resolve(list)
    await tick()
    expect(cursors.getSnapshot().durable).toBeNull()
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })
  it('queues signals arriving during a recovery in a later batch', async () => {
    const { recovery, cursors } = fixture()
    let resolve!: (value: unknown) => void
    vi.mocked(get).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    recovery.accept(ready('9'))
    await tick()
    recovery.accept(event('10'))
    resolve(list)
    await vi.advanceTimersByTimeAsync(0)
    expect(cursors.getSnapshot().durable).toBe('9')
    await tick()
    expect(cursors.getSnapshot().durable).toBe('10')
  })
  it('does not write durable from a follower', async () => {
    const { recovery, cursors } = fixture(false)
    recovery.accept(ready('9'))
    recovery.accept(event('10'))
    await tick()
    expect(cursors.getSnapshot()).toMatchObject({
      processed: '10',
      durable: null,
    })
    expect(createCursorState(scope).getSnapshot().durable).toBeNull()
  })
  it('clears untrusted positions on reset and recovers before a fresh base', async () => {
    const { recovery, cursors } = fixture()
    cursors.acknowledge('8', true)
    recovery.accept({
      type: 'stream.reset',
      payload: { v: 1, reason: 'cursor_unavailable' },
    })
    await tick()
    expect(cursors.getSnapshot().durable).toBeNull()
    recovery.position(null)
    recovery.accept(ready('12'))
    await tick()
    expect(cursors.getSnapshot().durable).toBe('12')
  })
  it('does not advance over a gap or out-of-order delivery', async () => {
    const { recovery, cursors, gap } = fixture()
    recovery.accept(ready('8'))
    recovery.accept(event('10'))
    recovery.accept(event('9'))
    await tick()
    expect(gap).toHaveBeenCalled()
    expect(cursors.getSnapshot().durable).toBeNull()
  })
  it('pauses offline and preserves queued work', async () => {
    const { recovery, cursors } = fixture()
    vi.stubGlobal('navigator', { onLine: false })
    recovery.accept(ready('9'))
    await tick()
    expect(get).not.toHaveBeenCalled()
    expect(cursors.getSnapshot().durable).toBeNull()
    vi.stubGlobal('navigator', { onLine: true })
    recovery.recoverViews()
    await tick()
    expect(cursors.getSnapshot().durable).toBe('9')
  })
  it('waits for pending order mutations and repeats reads if a mutation intervenes', async () => {
    const { recovery, cursors, client } = fixture()
    let finish!: () => void
    const mutation = client.getMutationCache().build(client, {
      mutationKey: ['orders', 'status'],
      mutationFn: () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    })
    const mutationResult = mutation.execute(undefined)
    recovery.accept(ready('9'))
    await tick()
    expect(get).not.toHaveBeenCalled()
    finish()
    await mutationResult
    await vi.advanceTimersByTimeAsync(250)
    expect(cursors.getSnapshot().durable).toBe('9')
  })
})
