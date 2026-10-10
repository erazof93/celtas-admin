import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '@/lib/api-client'
import { QueryClient } from '@tanstack/react-query'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/features/auth/store'
import type { AuthUser } from '@/features/auth/types'
import AdminLayout from '@/layouts/AdminLayout'
import { createOrderEventsService } from './coordinated-service'
import {
  createCoordinationBrowser,
  flushCoordination,
} from './coordination-test-utils'

const shared = vi.hoisted(() => ({
  identity: 'admin-test',
  generation: 'generation-a',
  revoked: false,
}))
vi.mock('@/lib/firebase', () => ({
  capturePushSession: () => ({ ...shared }),
  capturePushGeneration: () => shared.generation,
  registerPushNotifications: vi.fn(),
  activatePushSession: vi.fn(),
  stopPushNotifications: vi.fn().mockResolvedValue(undefined),
}))
const admin = {
  id: 'admin-test',
  role: 'admin',
  email: 'test@local',
} as AuthUser
const originalBase = api.defaults.baseURL
const originalAdapter = api.defaults.adapter
const disposers: (() => void)[] = []
let browser: ReturnType<typeof createCoordinationBrowser>
let live = 0,
  peak = 0
let wires: ReadableStreamDefaultController<Uint8Array>[]
const encode = (text: string) => new TextEncoder().encode(text)
const event = (cursor: string) =>
  encode(
    `id: ${cursor}\nevent: order.created\ndata: ${JSON.stringify({ v: 1, eventId: `00000000-0000-4000-8000-${cursor.slice(-12).padStart(12, '0')}`, orderId: '10000000-0000-4000-8000-000000000000', status: 'pendiente', occurredAt: '2026-10-08T12:00:00.000Z' })}\n\n`,
  )
function start(onEvent = vi.fn()) {
  const service = createOrderEventsService({
    enabled: () => true,
    random: () => 1,
    onEvent,
    client: new QueryClient(),
  })
  disposers.push(service.mount())
  return { service, onEvent }
}
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  live = 0
  peak = 0
  wires = []
  shared.identity = admin.id
  shared.generation = 'generation-a'
  shared.revoked = false
  browser = createCoordinationBrowser()
  vi.stubGlobal('navigator', { onLine: true, locks: browser.locks })
  vi.stubGlobal('BroadcastChannel', browser.BroadcastChannel)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, options: RequestInit) => {
      live++
      peak = Math.max(peak, live)
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          wires.push(controller)
        },
        cancel() {
          live--
        },
      })
      options.signal?.addEventListener('abort', () => {
        void body.cancel().catch(() => undefined)
      })
      return new Response(body, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }),
  )
  api.defaults.baseURL = 'http://localhost:3000'
  api.defaults.adapter = async (config) => ({
    data: {
      success: true,
      data: config.url?.startsWith('/orders/')
        ? {
            id: config.url.slice('/orders/'.length),
            items: [],
            user: null,
            status: 'pendiente',
            updatedAt: '2026-10-08T12:00:00Z',
          }
        : {
            items: [],
            meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
          },
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  })
  useAuthStore.getState().setSession('inert-access', admin, true)
})
afterEach(async () => {
  disposers.splice(0).forEach((dispose) => dispose())
  await flushCoordination()
  useAuthStore.getState().clearSession()
  api.defaults.baseURL = originalBase
  api.defaults.adapter = originalAdapter
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
describe('coordinated SSE session service', () => {
  it('acknowledges REST in both tabs but persists only the leader, then reconnects from durable', async () => {
    const first = start(),
      second = start()
    await flushCoordination()
    wires[0].enqueue(
      encode(
        'event: stream.ready\ndata: {"v":1,"headCursor":"9","floorCursor":"0","recovery":"rest"}\n\n',
      ),
    )
    wires[0].enqueue(event('10'))
    await flushCoordination()
    await vi.advanceTimersByTimeAsync(100)
    expect(first.service.getCursorSnapshot()).toMatchObject({
      processed: '10',
      durable: '10',
    })
    expect(second.service.getCursorSnapshot()).toMatchObject({
      processed: '10',
      durable: null,
    })
    wires[0].close()
    live--
    await flushCoordination()
    await vi.advanceTimersByTimeAsync(5000)
    expect(vi.mocked(fetch).mock.calls[1][1]?.headers).toHaveProperty(
      'Last-Event-ID',
      '10',
    )
    expect(peak).toBe(1)
    disposers.shift()!()
    await flushCoordination()
    expect(second.service.getSnapshot().role).toBe('leader')
    expect(vi.mocked(fetch).mock.calls[2][1]?.headers).toHaveProperty(
      'Last-Event-ID',
      '10',
    )
  })

  it('aborts pending REST on logout before FCM cleanup and ignores its late response', async () => {
    let resolve!: (value: AxiosResponse) => void
    // The adapter intentionally ignores abort; Axios and session fencing still reject its result.
    let config!: InternalAxiosRequestConfig
    api.defaults.adapter = (request) => {
      config = request
      return new Promise((done) => {
        resolve = done
      })
    }
    const { service } = start()
    await flushCoordination()
    wires[0].enqueue(
      encode(
        'event: stream.ready\ndata: {"v":1,"headCursor":"9","floorCursor":"0","recovery":"rest"}\n\n',
      ),
    )
    await flushCoordination()
    await vi.advanceTimersByTimeAsync(100)
    expect(config.signal?.aborted).toBe(false)
    useAuthStore.setState({ sessionEnding: true })
    expect(config.signal?.aborted).toBe(true)
    expect(live).toBe(0)
    resolve({
      data: { success: true, data: { items: [], meta: {} } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
    await flushCoordination()
    expect(service.getCursorSnapshot()?.durable ?? null).toBeNull()
    expect(browser.held.size).toBe(0)
  })
  it('does not reset backoff when a short successful stream changes leader', async () => {
    start()
    const follower = start()
    await flushCoordination()
    wires[0].close()
    live--
    await flushCoordination()
    await vi.advanceTimersByTimeAsync(5000)
    disposers.shift()!()
    await flushCoordination()
    expect(fetch).toHaveBeenCalledTimes(3)
    wires[2].close()
    live--
    await flushCoordination()
    expect(follower.service.getSnapshot().connection?.retryAt).toBe(
      Date.now() + 10_000,
    )
    expect(peak).toBe(1)
  })

  it('keeps one leader through EOF reconnection and online/offline cycles', async () => {
    const first = start(),
      second = start()
    await flushCoordination()
    wires[0].close()
    live--
    await flushCoordination()
    expect(first.service.getSnapshot()).toMatchObject({
      role: 'leader',
      status: 'retrying',
    })
    expect(second.service.getSnapshot().role).toBe('follower')
    await vi.advanceTimersByTimeAsync(4999)
    expect(fetch).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    vi.stubGlobal('navigator', { onLine: false, locks: browser.locks })
    window.dispatchEvent(new Event('offline'))
    await flushCoordination()
    expect(live).toBe(0)
    expect(browser.held.size).toBe(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetch).toHaveBeenCalledTimes(2)
    vi.stubGlobal('navigator', { onLine: true, locks: browser.locks })
    window.dispatchEvent(new Event('online'))
    await flushCoordination()
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(peak).toBe(1)
  })

  it('fails closed if lease persistence is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Unavailable', 'QuotaExceededError')
    })
    const client = start()
    await flushCoordination()
    expect(fetch).not.toHaveBeenCalled()
    expect(client.service.getSnapshot().status).toBe('unavailable')
    expect(browser.held.size).toBe(0)
  })

  it('does not acquire locks, open a channel or write metadata with the flag disabled', async () => {
    const service = createOrderEventsService({ enabled: () => false })
    disposers.push(service.mount())
    await flushCoordination()
    expect(service.getSnapshot().status).toBe('disabled')
    expect(fetch).not.toHaveBeenCalled()
    expect(browser.names).toEqual([])
    expect(browser.channels).toEqual([])
    expect(localStorage.length).toBe(0)
  })

  it.each([2, 3])(
    'opens one stream for %i tab instances, distributes and deduplicates signals',
    async (count) => {
      const clients = Array.from({ length: count }, () => start())
      await flushCoordination()
      expect(fetch).toHaveBeenCalledOnce()
      expect(peak).toBe(1)
      expect(clients[0].service.getSnapshot().role).toBe('leader')
      expect(
        clients
          .slice(1)
          .every((client) => client.service.getSnapshot().role === 'follower'),
      ).toBe(true)
      for (const cursor of ['9', '10', '11', '12', '9007199254740993'])
        wires[0].enqueue(event(cursor))
      wires[0].enqueue(event('12'))
      wires[0].enqueue(event('8'))
      await flushCoordination()
      for (const client of clients) {
        expect(client.onEvent).toHaveBeenCalledTimes(5)
        expect(client.service.getCursorSnapshot()).toMatchObject({
          observed: '9007199254740993',
          processed: null,
          durable: null,
          requiresRecovery: true,
        })
      }
      expect(vi.mocked(fetch).mock.calls[0][1]?.headers).not.toHaveProperty(
        'Last-Event-ID',
      )
    },
  )
  it('aborts and releases on leader unmount; a queued follower opens without parallel live streams', async () => {
    start()
    const follower = start()
    await flushCoordination()
    disposers.shift()!()
    await flushCoordination()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(peak).toBe(1)
    expect(follower.service.getSnapshot().role).toBe('leader')
  })
  it('handles StrictMode and clears all locks/listeners on final unmount', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_ORDER_EVENTS_ENABLED', 'true')
    const view = render(
      <StrictMode>
        <MemoryRouter>
          <AdminLayout />
        </MemoryRouter>
      </StrictMode>,
    )
    await flushCoordination()
    expect(fetch).toHaveBeenCalledOnce()
    expect(peak).toBe(1)
    view.unmount()
    await flushCoordination()
    expect(live).toBe(0)
    expect(browser.held.size).toBe(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('closes immediately on logout start and rejects old generation messages after identity changes', async () => {
    const first = start(),
      second = start()
    await flushCoordination()
    wires[0].enqueue(event('9'))
    await flushCoordination()
    const oldMessage = browser.messages.find(
      (message) =>
        (message as { signal: { kind: string } }).signal.kind === 'event',
    )
    useAuthStore.setState({ sessionEnding: true })
    expect(live).toBe(0)
    await flushCoordination()
    expect(browser.held.size).toBe(0)
    shared.identity = 'other-admin'
    shared.generation = 'generation-b'
    useAuthStore
      .getState()
      .setSession('new-inert-access', { ...admin, id: shared.identity }, true)
    await flushCoordination()
    for (const channel of browser.channels)
      if (!channel.closed)
        channel.onmessage?.(new MessageEvent('message', { data: oldMessage }))
    expect(first.onEvent).toHaveBeenCalledOnce()
    expect(second.onEvent).toHaveBeenCalledOnce()
    expect(first.service.getCursorSnapshot()?.observed).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(peak).toBe(1)
  })
  it('honors shared generation revocation even if FCM registration is unavailable', async () => {
    start()
    start()
    await flushCoordination()
    shared.revoked = true
    window.dispatchEvent(new StorageEvent('storage'))
    expect(live).toBe(0)
    await flushCoordination()
    expect(browser.held.size).toBe(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetch).toHaveBeenCalledOnce()
  })
  it.each(['locks', 'channel', 'generation'])(
    'opens no streams when %s is unavailable',
    async (missing) => {
      if (missing === 'locks') vi.stubGlobal('navigator', { onLine: true })
      if (missing === 'channel') vi.stubGlobal('BroadcastChannel', undefined)
      if (missing === 'generation') shared.generation = ''
      const first = start(),
        second = start()
      await flushCoordination()
      expect(fetch).not.toHaveBeenCalled()
      expect(first.service.getSnapshot().status).toBe('unavailable')
      expect(second.service.getSnapshot().status).toBe('unavailable')
    },
  )
  it('keeps leadership during backoff and preserves retry deadline across succession', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }))
    const first = start(),
      second = start()
    await flushCoordination()
    const retryAt = first.service.getSnapshot().connection?.retryAt
    expect(second.service.getSnapshot().role).toBe('follower')
    disposers.shift()!()
    await flushCoordination()
    expect(fetch).toHaveBeenCalledOnce()
    expect(second.service.getSnapshot().connection?.retryAt).toBe(retryAt)
    await vi.advanceTimersByTimeAsync(59_999)
    expect(fetch).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(second.service.getSnapshot().connection?.retryAt).toBe(
      Date.now() + 120_000,
    )
  })
  it('recovers reset positions and retries only in the leader with existing backoff', async () => {
    const first = start(),
      second = start()
    await flushCoordination()
    wires[0].enqueue(event('9'))
    await flushCoordination()
    wires[0].enqueue(
      encode(
        'event: stream.reset\ndata: {"v":1,"reason":"cursor_unavailable"}\n\n',
      ),
    )
    await flushCoordination()
    const third = start()
    await flushCoordination()
    for (const client of [first, second, third]) {
      expect(client.service.getCursorSnapshot()?.durable).toBeNull()
    }
    expect(first.service.getCursorSnapshot()?.observed).toBeNull()
    expect(second.service.getCursorSnapshot()?.observed).toBeNull()
    await vi.advanceTimersByTimeAsync(4999)
    expect(fetch).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(peak).toBe(1)
    expect(vi.mocked(fetch).mock.calls[1][1]?.headers).not.toHaveProperty(
      'Last-Event-ID',
    )
  })
  it('releases and fences a fetch that never settles after abort; later response cannot deliver events', async () => {
    let resolve!: (response: Response) => void
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done
        }),
    )
    const first = start(),
      second = start()
    await flushCoordination()
    const oldSignal = vi.mocked(fetch).mock.calls[0][1]?.signal
    disposers.shift()!()
    await flushCoordination()
    expect(oldSignal?.aborted).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(second.service.getSnapshot().role).toBe('leader')
    const cancel = vi.fn()
    resolve(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(event('9'))
          },
          cancel,
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    )
    await flushCoordination()
    expect(cancel).toHaveBeenCalledOnce()
    expect(first.onEvent).not.toHaveBeenCalled()
    expect(second.onEvent).not.toHaveBeenCalled()
  })
  it('yields on freeze/pagehide and resumes safely while a follower keeps leadership', async () => {
    start()
    start()
    await flushCoordination()
    document.dispatchEvent(new Event('freeze'))
    await flushCoordination()
    expect(live).toBe(0)
    expect(browser.held.size).toBe(0)
    document.dispatchEvent(new Event('resume'))
    await flushCoordination()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(peak).toBe(1)
    window.dispatchEvent(new Event('pagehide'))
    await flushCoordination()
    expect(live).toBe(0)
  })
})
