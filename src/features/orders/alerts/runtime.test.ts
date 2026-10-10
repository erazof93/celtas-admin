import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  createCoordinationBrowser,
  flushCoordination,
} from '../events/coordination-test-utils'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  invalidate: vi.fn(),
  subscribe: vi.fn(),
  session: {
    accessToken: 'test-only',
    user: { id: 'admin', role: 'admin' },
    roleStatus: 'confirmed',
    sessionEnding: false,
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
  queryClient: { invalidateQueries: mocks.invalidate },
}))
import { mountOrderAlerts, orderAlerts, reconciledOrderAlerts } from './runtime'
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
