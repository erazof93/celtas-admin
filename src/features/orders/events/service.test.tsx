import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import api from '@/lib/api-client'
import { useAuthStore, setRefreshToken } from '@/features/auth/store'
import type { AuthUser } from '@/features/auth/types'
import { logout } from '@/features/auth/hooks'
import { stopPushNotifications } from '@/lib/firebase'
import AdminLayout from '@/layouts/AdminLayout'
import {
  createOrderEventsTransportService as createOrderEventsService,
  orderEventsEnabled,
} from './service'
import { orderEventsService } from './coordinated-service'
import { createCoordinationBrowser } from './coordination-test-utils'

vi.mock('@/lib/firebase', () => ({
  capturePushGeneration: () => 'inert-generation',
  capturePushSession: () => ({
    generation: 'inert-generation',
    identity: useAuthStore.getState().user?.id,
    revoked: false,
  }),
  activatePushSession: vi.fn(),
  registerPushNotifications: vi.fn(),
  stopPushNotifications: vi.fn().mockResolvedValue(undefined),
}))
const admin = {
  id: 'admin-test',
  email: 'test@local',
  role: 'admin',
} as AuthUser
const disposers: (() => void)[] = []
const originalAdapter = api.defaults.adapter
const originalBase = api.defaults.baseURL
const encode = (text: string) => new TextEncoder().encode(text)
async function flush() {
  for (let i = 0; i < 500; i++) await Promise.resolve()
}
function session(id = admin.id) {
  useAuthStore.getState().setSession('old-access', { ...admin, id }, true)
}
function start(options: Parameters<typeof createOrderEventsService>[0] = {}) {
  const service = createOrderEventsService({
    enabled: () => true,
    random: () => 1,
    ...options,
  })
  disposers.push(service.mount())
  return service
}
function stream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    cancel,
  })
  return {
    controller,
    cancel,
    response: new Response(body, {
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  }
}
const control = (type: string, payload: unknown) =>
  encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`)
const ready = () =>
  control('stream.ready', {
    v: 1,
    headCursor: '12',
    floorCursor: '0',
    recovery: 'rest',
  })
const reply = (config: InternalAxiosRequestConfig, data: unknown) => ({
  status: 200,
  statusText: 'OK',
  config,
  headers: {},
  data: { success: true, data },
})
const fail = (config: InternalAxiosRequestConfig) =>
  Promise.reject(
    new AxiosError('inert error', 'ERR_BAD_REQUEST', config, null, {
      status: 401,
      statusText: 'Error',
      config,
      headers: {},
      data: {},
    }),
  )

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', { onLine: true, locks: {} })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('no real network')),
  )
  vi.mocked(stopPushNotifications).mockResolvedValue(undefined)
  api.defaults.baseURL = 'http://localhost:3000/api'
  session()
  setRefreshToken('inert-refresh')
})
afterEach(async () => {
  disposers.splice(0).forEach((dispose) => dispose())
  await flush()
  useAuthStore.getState().clearSession()
  api.defaults.adapter = originalAdapter
  api.defaults.baseURL = originalBase
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('session-bound SSE service', () => {
  it('refreshes once after 401 and opens successfully with the renewed token', async () => {
    const wire = stream()
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(wire.response)
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) =>
      reply(config, {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        user: admin,
      }),
    )
    api.defaults.adapter = adapter
    const service = start()
    await flush()
    expect(adapter).toHaveBeenCalledOnce()
    expect(adapter.mock.calls[0][0].url).toBe('/auth/refresh')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer new-access',
        }),
      }),
    )
    expect(service.getSnapshot().status).toBe('connected')
  })

  it('latches revocation synchronously across immediate remounts in the same session', async () => {
    const wire = stream()
    vi.mocked(fetch).mockResolvedValue(wire.response)
    const service = start({
      onEvent: (event) => {
        if (event.type !== 'access.revoked') return
        disposers.pop()!()
        disposers.push(service.mount())
      },
    })
    await flush()
    wire.controller.enqueue(
      control('access.revoked', { v: 1, reason: 'role_changed' }),
    )
    await flush()
    expect(service.getSnapshot()).toMatchObject({
      status: 'stopped',
      error: 'authorization',
    })
    await vi.advanceTimersByTimeAsync(300_000)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('does not multiply requests when mounted twice; only the final cleanup aborts', async () => {
    const wire = stream()
    vi.mocked(fetch).mockResolvedValue(wire.response)
    const service = start()
    const unmountSecond = service.mount()
    await flush()
    expect(fetch).toHaveBeenCalledOnce()
    unmountSecond()
    unmountSecond()
    expect(wire.cancel).not.toHaveBeenCalled()
    disposers.pop()!()
    expect(wire.cancel).toHaveBeenCalledOnce()
  })

  it('drops a pending response when the same identity starts a new session generation', async () => {
    let resolve!: (response: Response) => void
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done
        }),
    )
    const next = stream()
    vi.mocked(fetch).mockResolvedValue(next.response)
    const onEvent = vi.fn()
    start({ onEvent })
    await flush()
    const oldSignal = vi.mocked(fetch).mock.calls[0][1]?.signal
    session()
    await flush()
    expect(oldSignal?.aborted).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
    const old = stream()
    old.controller.enqueue(ready())
    resolve(old.response)
    await flush()
    expect(onEvent).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not renew again if Axios changed the rejected token before a late SSE 401', async () => {
    let resolve!: (response: Response) => void
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done
        }),
    )
    const next = stream()
    vi.mocked(fetch).mockResolvedValue(next.response)
    const adapter = vi.fn()
    api.defaults.adapter = adapter
    start()
    await flush()
    useAuthStore.setState({ accessToken: 'already-renewed' })
    resolve(new Response(null, { status: 401 }))
    await flush()
    expect(adapter).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer already-renewed',
        }),
      }),
    )
  })

  it('keeps session and spaces retries when refresh fails temporarily', async () => {
    api.defaults.adapter = async (config) => {
      throw new AxiosError('inert network error', 'ERR_NETWORK', config)
    }
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }))
    const service = start()
    await flush()
    expect(service.getSnapshot()).toMatchObject({
      status: 'retrying',
      error: 'network',
      retryAt: Date.now() + 5000,
    })
    expect(useAuthStore.getState().accessToken).toBe('old-access')
    await vi.advanceTimersByTimeAsync(4999)
    expect(fetch).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('never reopens with a late refresh after logout starts', async () => {
    let release!: () => void
    const gate = new Promise<void>((done) => {
      release = done
    })
    api.defaults.adapter = async (config) => {
      await gate
      return reply(config, {
        accessToken: 'late-access',
        refreshToken: 'late-refresh',
        user: admin,
      })
    }
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }))
    const service = start()
    await flush()
    useAuthStore.setState({ sessionEnding: true })
    release()
    await flush()
    expect(useAuthStore.getState().accessToken).toBe('old-access')
    expect(service.getSnapshot().status).toBe('stopped')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('defaults to disabled and preserves local-only development opt-in', () => {
    vi.stubEnv('VITE_ORDER_EVENTS_PRODUCTION_ENABLED', '')
    vi.stubEnv('VITE_ORDER_EVENTS_ENABLED', '')
    const service = start({ enabled: orderEventsEnabled })
    expect(service.getSnapshot().status).toBe('disabled')
    expect(fetch).not.toHaveBeenCalled()
    vi.stubEnv('VITE_ORDER_EVENTS_ENABLED', 'true')
    vi.stubEnv('DEV', false)
    expect(orderEventsEnabled()).toBe(false)
    vi.stubEnv('DEV', true)
    api.defaults.baseURL = 'https://remote.invalid'
    expect(orderEventsEnabled()).toBe(false)
    api.defaults.baseURL = 'http://localhost:3000/api'
    expect(orderEventsEnabled()).toBe(true)
  })

  it('opens the real transport with production opt-in and aborts it on session loss', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_ORDER_EVENTS_PRODUCTION_ENABLED', 'true')
    api.defaults.baseURL = 'https://api.example.invalid/api'
    const wire = stream()
    vi.mocked(fetch).mockResolvedValue(wire.response)
    const service = start({ enabled: orderEventsEnabled })
    await flush()
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.invalid/api/admin/orders/events',
      expect.objectContaining({ method: 'GET' }),
    )
    wire.controller.enqueue(ready())
    await flush()
    expect(service.getSnapshot().status).toBe('connected')
    useAuthStore.getState().clearSession()
    await flush()
    expect(wire.cancel).toHaveBeenCalledOnce()
    expect(service.getSnapshot().status).toBe('stopped')
  })

  it('connects with Axios base prefix, current token and exact cursor; exposes fragmented typed events', async () => {
    const wire = stream()
    vi.mocked(fetch).mockResolvedValue(wire.response)
    const onEvent = vi.fn()
    const service = start({ lastEventId: '9223372036854775807', onEvent })
    await flush()
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/orders/events',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer old-access',
          Accept: 'text/event-stream',
          'Last-Event-ID': '9223372036854775807',
        },
      }),
    )
    for (const byte of ready()) wire.controller.enqueue(new Uint8Array([byte]))
    await flush()
    await flush()
    await flush()
    expect(service.getSnapshot().status).toBe('connected')
    expect(onEvent).toHaveBeenCalledWith({
      type: 'stream.ready',
      payload: { v: 1, headCursor: '12', floorCursor: '0', recovery: 'rest' },
    })
  })

  it('aborts synchronously at logout start before FCM cleanup resolves', async () => {
    const wire = stream()
    vi.mocked(fetch).mockResolvedValue(wire.response)
    const service = start()
    await flush()
    let resolve!: () => void
    vi.mocked(stopPushNotifications).mockReturnValue(
      new Promise<void>((done) => {
        resolve = done
      }),
    )
    const pendingLogout = logout()
    expect(wire.cancel).toHaveBeenCalledOnce()
    expect(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).signal?.aborted,
    ).toBe(true)
    expect(service.getSnapshot().status).toBe('stopped')
    expect(useAuthStore.getState().accessToken).toBe('old-access')
    // Prevent jsdom navigation; simulate a newer login during cleanup.
    session('new-admin')
    resolve()
    await pendingLogout
    await flush()
  })

  it('detaches aborted fetch on remount and drops old identity responses', async () => {
    let resolve!: (response: Response) => void
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done
        }),
    )
    const next = stream()
    vi.mocked(fetch).mockResolvedValue(next.response)
    const onEvent = vi.fn()
    const service = start({ onEvent })
    await flush()
    const dispose = disposers.pop()!
    dispose()
    disposers.push(service.mount())
    session('other-admin')
    await flush()
    expect(fetch).toHaveBeenCalledTimes(2)
    const old = stream()
    old.controller.enqueue(ready())
    resolve(old.response)
    await flush()
    expect(old.cancel).toHaveBeenCalledOnce()
    expect(onEvent).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(service.getSnapshot().status).toBe('connected')
  })

  it('mounts through actual AdminLayout StrictMode, cancels on unmount and starts no parallel streams', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_ORDER_EVENTS_ENABLED', 'true')
    const browser = createCoordinationBrowser()
    vi.stubGlobal('navigator', { onLine: true, locks: browser.locks })
    vi.stubGlobal('BroadcastChannel', browser.BroadcastChannel)
    vi.mocked(fetch).mockImplementation(
      (_url, config) =>
        new Promise<Response>((_resolve, reject) => {
          config?.signal?.addEventListener('abort', () =>
            reject(new Error('abort')),
          )
        }),
    )
    const view = render(
      <StrictMode>
        <MemoryRouter>
          <AdminLayout />
        </MemoryRouter>
      </StrictMode>,
    )
    await flush()
    expect(fetch).toHaveBeenCalledOnce()
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal
    expect(signal?.aborted).toBe(false)
    expect(orderEventsService.getSnapshot().status).toBe('connecting')
    view.unmount()
    expect(signal?.aborted).toBe(true)
    await flush()
    await vi.advanceTimersByTimeAsync(300_000)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each([403, 404, 400])('stops automatically on HTTP %i', async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status }))
    const service = start()
    await flush()
    expect(service.getSnapshot()).toMatchObject({
      status: 'stopped',
      httpStatus: status,
    })
    await vi.advanceTimersByTimeAsync(600_000)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each([
    ['45', 45_000],
    [undefined, 30_000],
  ])('respects HTTP 429 Retry-After %s', async (retry, delay) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, {
        status: 429,
        headers: retry ? { 'Retry-After': retry } : {},
      }),
    )
    const service = start()
    await flush()
    expect(service.getSnapshot()).toMatchObject({
      status: 'retrying',
      httpStatus: 429,
      retryAt: Date.now() + delay,
    })
    await vi.advanceTimersByTimeAsync(delay - 1)
    expect(fetch).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('spaces 503 retries to 60s, 120s, 240s then 300s', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }))
    const service = start()
    await flush()
    for (const delay of [60_000, 120_000, 240_000, 300_000]) {
      expect(service.getSnapshot()).toMatchObject({
        status: 'degraded',
        retryAt: Date.now() + delay,
      })
      await vi.advanceTimersByTimeAsync(delay)
    }
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  it('backs off after EOF without resetting on HTTP 200, with bounded jitter', async () => {
    vi.mocked(fetch).mockImplementation(
      async () =>
        new Response('', { headers: { 'Content-Type': 'text/event-stream' } }),
    )
    const service = start({ random: () => 0 })
    await flush()
    for (const delay of [4000, 8000, 16_000, 32_000, 48_000, 48_000]) {
      expect(service.getSnapshot()).toMatchObject({
        error: 'disconnected',
        retryAt: Date.now() + delay,
      })
      await vi.advanceTimersByTimeAsync(delay)
    }
    expect(fetch).toHaveBeenCalledTimes(7)
  })

  it('resets backoff only after a ready stream survives 60 seconds', async () => {
    const wire = stream()
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(wire.response)
    const service = start()
    await flush()
    await vi.advanceTimersByTimeAsync(5000)
    wire.controller.enqueue(ready())
    await flush()
    await vi.advanceTimersByTimeAsync(40_000)
    wire.controller.enqueue(encode(': heartbeat\n\n'))
    await flush()
    await vi.advanceTimersByTimeAsync(20_000)
    wire.controller.close()
    await flush()
    expect(service.getSnapshot().retryAt).toBe(Date.now() + 5000)
  })

  it('pauses and aborts offline; online resumes using the current token', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const service = start()
    await flush()
    expect(fetch).not.toHaveBeenCalled()
    expect(service.getSnapshot().status).toBe('offline')
    vi.stubGlobal('navigator', { onLine: true })
    window.dispatchEvent(new Event('online'))
    await flush()
    expect(fetch).toHaveBeenCalledOnce()
    vi.stubGlobal('navigator', { onLine: false })
    window.dispatchEvent(new Event('offline'))
    await vi.advanceTimersByTimeAsync(600_000)
    expect(fetch).toHaveBeenCalledOnce()
    useAuthStore.setState({ accessToken: 'renewed-access' })
    vi.stubGlobal('navigator', { onLine: true })
    window.dispatchEvent(new Event('online'))
    await flush()
    expect(fetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer renewed-access',
        }),
      }),
    )
  })

  it.each(['access.revoked', 'stream.reset'])(
    'does not reconnect after %s',
    async (type) => {
      const wire = stream()
      vi.mocked(fetch).mockResolvedValue(wire.response)
      const service = start()
      await flush()
      wire.controller.enqueue(
        control(type, {
          v: 1,
          reason:
            type === 'access.revoked' ? 'role_changed' : 'cursor_unavailable',
        }),
      )
      await flush()
      expect(wire.cancel).toHaveBeenCalledOnce()
      expect(service.getSnapshot().status).toBe('stopped')
      window.dispatchEvent(new Event('online'))
      useAuthStore.setState({ accessToken: 'renewed-access' })
      await vi.advanceTimersByTimeAsync(600_000)
      expect(fetch).toHaveBeenCalledOnce()
    },
  )

  it('reconnects auth.expiring with the latest token and does not force refresh', async () => {
    const wire = stream()
    const next = stream()
    vi.mocked(fetch)
      .mockResolvedValueOnce(wire.response)
      .mockResolvedValueOnce(next.response)
    const adapter = vi.fn()
    api.defaults.adapter = adapter
    const service = start()
    await flush()
    useAuthStore.setState({ accessToken: 'renewed-access' })
    wire.controller.enqueue(
      control('auth.expiring', { v: 1, reason: 'reconnect_required' }),
    )
    await flush()
    expect(service.getSnapshot().status).toBe('retrying')
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(adapter).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer renewed-access',
        }),
      }),
    )
  })

  it('shares an in-flight Axios refresh and permits only one retry after 401', async () => {
    let release!: () => void
    const gate = new Promise<void>((done) => {
      release = done
    })
    const refresh = vi.fn()
    api.defaults.adapter = async (config) => {
      if (config.url === '/auth/refresh') {
        refresh()
        await gate
        return reply(config, {
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          user: admin,
        })
      }
      return config.headers.Authorization === 'Bearer new-access'
        ? reply(config, [])
        : fail(config)
    }
    const axiosRequest = api.get('/settings')
    await flush()
    expect(refresh).toHaveBeenCalledOnce()
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }))
    const service = start()
    await flush()
    expect(fetch).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
    release()
    await axiosRequest
    await flush()
    expect(refresh).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(service.getSnapshot()).toMatchObject({
      status: 'stopped',
      httpStatus: 401,
    })
    await vi.advanceTimersByTimeAsync(600_000)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('aborts and never retries when administrative authorization or session is lost', async () => {
    const wire = stream()
    vi.mocked(fetch).mockResolvedValue(wire.response)
    const service = start()
    await flush()
    useAuthStore.setState({ user: { ...admin, role: 'cliente' } })
    expect(wire.cancel).toHaveBeenCalledOnce()
    expect(service.getSnapshot().status).toBe('stopped')
    useAuthStore.getState().clearSession()
    await flush()
    await vi.advanceTimersByTimeAsync(600_000)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('rejects invalid cursor and invalid event protocol without retry loops', async () => {
    const invalid = start({ lastEventId: '01' })
    expect(invalid.getSnapshot()).toMatchObject({
      status: 'stopped',
      error: 'protocol',
    })
    expect(fetch).not.toHaveBeenCalled()
    const wire = stream()
    vi.mocked(fetch).mockResolvedValue(wire.response)
    const service = start()
    await flush()
    wire.controller.enqueue(control('unknown.event', { v: 1 }))
    await flush()
    expect(service.getSnapshot()).toMatchObject({
      status: 'stopped',
      error: 'protocol',
    })
    await vi.advanceTimersByTimeAsync(600_000)
    expect(fetch).toHaveBeenCalledOnce()
  })
})
