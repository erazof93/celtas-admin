import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  createCoordinationBrowser,
  flushCoordination,
} from '../events/coordination-test-utils'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  invalidate: vi.fn(),
  subscribe: vi.fn(),
  subscribeCache: vi.fn(),
  session: {
    accessToken: 'test-only',
    user: { id: 'admin', role: 'admin' },
    roleStatus: 'confirmed',
    sessionEnding: false,
    sessionId: 1,
  },
  owner: { identity: 'admin', generation: 'test', revoked: false },
}))
vi.mock('@/features/auth/store', () => ({
  useAuthStore: { getState: () => mocks.session, subscribe: mocks.subscribe },
}))
vi.mock('@/lib/api-client', () => ({
  get: mocks.get,
  orderEventsUrl: () => 'http://localhost:3000/admin/orders/events',
}))
vi.mock('@/lib/firebase', () => ({ capturePushSession: () => mocks.owner }))
vi.mock('@/lib/query-client', () => ({
  queryClient: {
    invalidateQueries: mocks.invalidate,
    getQueryCache: () => ({ subscribe: mocks.subscribeCache }),
  },
}))
import {
  mountOrderAlerts,
  orderAlerts,
  reconciledOrderAlerts,
  reconciledOrderAttention,
} from './runtime'
import { publishForegroundOrder } from './foreground'
const id = '10000000-0000-4000-8000-000000000001'
const play = vi.fn()
let stop: () => void
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'))
  vi.stubEnv('DEV', true)
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000')
  localStorage.clear()
  mocks.session.sessionEnding = false
  mocks.subscribe.mockReturnValue(() => {})
  mocks.subscribeCache.mockReturnValue(() => {})
  mocks.get.mockReset().mockResolvedValue({
    id,
    createdAt: new Date().toISOString(),
    status: 'pendiente',
  })
  mocks.invalidate.mockClear()
  play.mockReset().mockResolvedValue(undefined)
  vi.stubGlobal(
    'Audio',
    class {
      play = play
      pause = vi.fn()
      load = vi.fn()
      removeAttribute = vi.fn()
      currentTime = 0
      volume = 1
    },
  )
  const browser = createCoordinationBrowser()
  vi.stubGlobal('navigator', { locks: browser.locks })
  vi.stubGlobal('BroadcastChannel', browser.BroadcastChannel)
  stop = mountOrderAlerts()
})
afterEach(async () => {
  stop()
  await flushCoordination()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})
function sse(type: 'order.created' | 'order.updated' = 'order.created') {
  reconciledOrderAlerts([
    {
      type,
      cursor: '1',
      payload: {
        v: 1,
        orderId: id,
        eventId: id,
        status: 'pendiente',
        occurredAt: new Date().toISOString(),
      },
    },
  ])
}
it('FCM confirmation and reconciled SSE share a single visual and sound claim', async () => {
  await orderAlerts.enableSound()
  await vi.advanceTimersByTimeAsync(500)
  play.mockClear()
  publishForegroundOrder({ orderId: id, status: 'pendiente' }, mocks.owner)
  sse()
  await flushCoordination()
  expect(mocks.get).toHaveBeenCalledWith(
    `/orders/${id}`,
    expect.objectContaining({ timeout: 15000 }),
  )
  expect(orderAlerts.getSnapshot().notices).toHaveLength(1)
  expect(play).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(500)
  expect(
    mocks.invalidate.mock.calls.filter(
      ([arg]) => arg.queryKey[0] === 'dashboard',
    ),
  ).toHaveLength(1)
})
it('ignores updated events, malformed FCM and historical REST orders', async () => {
  sse('order.updated')
  publishForegroundOrder(
    { orderId: '../private', status: 'pendiente' },
    mocks.owner,
  )
  expect(mocks.get).not.toHaveBeenCalled()
  mocks.get.mockResolvedValue({
    id,
    createdAt: '2026-10-08T00:00:00Z',
    status: 'pendiente',
  })
  publishForegroundOrder({ orderId: id, status: 'pendiente' }, mocks.owner)
  await flushCoordination()
  expect(orderAlerts.getSnapshot().notices).toEqual([])
  expect(play).not.toHaveBeenCalled()
})
it('unmount aborts pending REST and removes foreground listeners', async () => {
  let resolve!: (value: unknown) => void
  mocks.get.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  publishForegroundOrder({ orderId: id, status: 'pendiente' }, mocks.owner)
  const signal = mocks.get.mock.calls[0][1].signal as AbortSignal
  stop()
  expect(signal.aborted).toBe(true)
  resolve({ id, createdAt: new Date().toISOString(), status: 'pendiente' })
  publishForegroundOrder({ orderId: id, status: 'pendiente' }, mocks.owner)
  await flushCoordination()
  expect(mocks.get).toHaveBeenCalledTimes(1)
  expect(orderAlerts.getSnapshot().notices).toEqual([])
})

it('retirements from committed SSE REST reconciliation stop attention without rearming on duplicates', async () => {
  sse()
  await flushCoordination()
  expect(orderAlerts.getSnapshot().unreviewed).toHaveLength(1)
  reconciledOrderAttention([id])
  await flushCoordination()
  sse()
  await flushCoordination()
  expect(orderAlerts.getSnapshot().unreviewed).toEqual([])
})

it('historical pending snapshots cannot start alarms; complete new snapshots can retire a missing new order', async () => {
  const notify = mocks.subscribeCache.mock.calls.at(-1)![0]
  const cacheEvent = (
    items: { id: string; status: string }[],
    total = items.length,
  ) => ({
    type: 'updated',
    action: { type: 'success' },
    query: {
      queryKey: ['orders', 'pending', { identity: 'admin', sessionId: 1 }],
      state: { dataUpdatedAt: Date.now(), data: { items, meta: { total } } },
    },
  })
  notify(cacheEvent([{ id, status: 'pendiente' }]))
  expect(orderAlerts.getSnapshot().unreviewed).toEqual([])
  sse()
  await flushCoordination()
  notify(cacheEvent([], 10)) // Partial pages never imply absence.
  await flushCoordination()
  expect(orderAlerts.getSnapshot().unreviewed).toHaveLength(1)
  notify(cacheEvent([]))
  await flushCoordination()
  expect(orderAlerts.getSnapshot().unreviewed).toEqual([])
})

it('an FCM notice whose confirmed REST order is already cancelled never starts an alarm', async () => {
  mocks.get.mockResolvedValue({
    id,
    createdAt: new Date().toISOString(),
    status: 'cancelado',
  })
  publishForegroundOrder({ orderId: id, status: 'pendiente' }, mocks.owner)
  await flushCoordination()
  expect(orderAlerts.getSnapshot().unreviewed).toEqual([])
  expect(play).not.toHaveBeenCalled()
})

it('navigation retains new IDs, and final unmount closes the service and cancels repeats', async () => {
  const secondMount = mountOrderAlerts()
  await orderAlerts.enableSound()
  await vi.advanceTimersByTimeAsync(500)
  sse()
  await flushCoordination()
  stop()
  expect(orderAlerts.getSnapshot().unreviewed).toHaveLength(1)
  secondMount()
  await flushCoordination()
  await vi.advanceTimersByTimeAsync(0)
  expect(vi.getTimerCount()).toBe(0)
  play.mockClear()
  await vi.advanceTimersByTimeAsync(24000)
  expect(play).not.toHaveBeenCalled()
})
