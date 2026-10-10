import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AxiosError,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from 'axios'
import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AuthUser } from '@/features/auth/types'

const sdk = vi.hoisted(() => ({
  initialize: vi.fn(() => ({})),
  supported: vi.fn(),
  messaging: vi.fn(),
  token: vi.fn(),
  remove: vi.fn(),
  message: vi.fn(),
  stopMessage: vi.fn(),
}))
vi.mock('firebase/messaging', () => ({
  isSupported: sdk.supported,
  getMessaging: sdk.messaging,
  getToken: sdk.token,
  deleteToken: sdk.remove,
  onMessage: sdk.message,
}))
vi.mock('firebase/app', () => ({ initializeApp: sdk.initialize }))
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const admin = { id: 'a', role: 'admin', email: 'a@test.invalid' } as AuthUser
let api: typeof import('./api-client').default
let store: typeof import('@/features/auth/store').useAuthStore
let push: typeof import('./firebase')
let permission: ReturnType<typeof vi.fn>
let transport: ReturnType<typeof vi.fn<AxiosAdapter>>
let listeners: Array<[string, EventListenerOrEventListenerObject]>
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}
const patches = () =>
  transport.mock.calls.filter(([config]) => config.method === 'patch')
const deletes = () =>
  transport.mock.calls.filter(([config]) => config.method === 'delete')

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  localStorage.clear()
  listeners = []
  const original = window.addEventListener.bind(window)
  vi.spyOn(window, 'addEventListener').mockImplementation(
    (type, listener, options) => {
      if (listener) listeners.push([type, listener])
      original(type, listener, options)
    },
  )
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'public-test')
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test')
  vi.stubEnv('VITE_FIREBASE_APP_ID', 'test')
  vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'public-vapid')
  vi.stubEnv('DEV', true)
  vi.stubEnv('MODE', 'test')
  vi.stubEnv('VITE_E2E_DISABLE_PUSH', 'false')
  sdk.supported.mockResolvedValue(true)
  sdk.messaging.mockReturnValue({})
  sdk.token.mockResolvedValue('fcm-a')
  sdk.remove.mockResolvedValue(true)
  sdk.message.mockReturnValue(sdk.stopMessage)
  permission = vi.fn().mockResolvedValue('granted')
  vi.stubGlobal('Notification', { requestPermission: permission })
  let queue = Promise.resolve()
  vi.stubGlobal('navigator', {
    serviceWorker: { register: vi.fn().mockResolvedValue({}) },
    locks: {
      request: vi.fn((_name, optionsOrCallback, callback) => {
        const action = callback ?? optionsOrCallback
        const next = queue.then(() => {
          if (callback && optionsOrCallback.signal?.aborted)
            throw new DOMException('Aborted', 'AbortError')
          return action()
        })
        queue = next.catch(() => undefined)
        return next
      }),
    },
  })
  store = (await import('@/features/auth/store')).useAuthStore
  api = (await import('./api-client')).default
  push = await import('./firebase')
  store.getState().setSession('access-a', admin, true)
  push.activatePushSession('a')
  transport = vi.fn<AxiosAdapter>(
    async (config: InternalAxiosRequestConfig) => ({
      status: 200,
      statusText: 'OK',
      config,
      headers: {},
      data: { success: true, data: {} },
    }),
  )
  api.defaults.adapter = transport
})
afterEach(() => {
  for (const [type, listener] of listeners)
    window.removeEventListener(type, listener)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('FCM session lifecycle with actual Axios transport', () => {
  it.each(['false', 'true'])(
    'production foreground handler follows the real build opt-in %s, retaining normal push',
    async (enabled) => {
      vi.stubEnv('DEV', false)
      vi.stubEnv('MODE', 'production')
      vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.invalid')
      vi.stubEnv('VITE_ORDER_EVENTS_PRODUCTION_ENABLED', enabled)
      await push.registerPushNotifications()
      expect(sdk.initialize).toHaveBeenCalledOnce()
      expect(sdk.token).toHaveBeenCalledOnce()
      expect(sdk.message).toHaveBeenCalledTimes(enabled === 'true' ? 1 : 0)
      await push.stopPushNotifications()
      expect(sdk.stopMessage).toHaveBeenCalledTimes(enabled === 'true' ? 1 : 0)
    },
  )
  it('validates foreground payloads and removes the SDK listener immediately on logout', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000')
    const { subscribeForegroundOrders } =
      await import('@/features/orders/alerts/foreground')
    const received = vi.fn()
    const stop = subscribeForegroundOrders(received)
    await push.registerPushNotifications()
    expect(sdk.message).toHaveBeenCalledOnce()
    const callback = sdk.message.mock.calls[0][1]
    callback({ data: { orderId: '../private', status: 'pendiente' } })
    callback({
      data: {
        orderId: '10000000-0000-4000-8000-000000000001',
        status: 'entregado',
      },
    })
    expect(received).not.toHaveBeenCalled()
    callback({
      data: {
        orderId: '10000000-0000-4000-8000-000000000001',
        status: 'pendiente',
        customerName: 'Never forwarded',
      },
    })
    expect(received).toHaveBeenCalledWith({
      orderId: '10000000-0000-4000-8000-000000000001',
      identity: 'a',
      generation: expect.any(String),
    })
    await push.stopPushNotifications()
    expect(sdk.stopMessage).toHaveBeenCalledOnce()
    callback({
      data: {
        orderId: '10000000-0000-4000-8000-000000000001',
        status: 'pendiente',
      },
    })
    expect(received).toHaveBeenCalledTimes(1)
    stop()
  })
  it('isolates E2E registration and logout while preserving SSE session metadata', async () => {
    vi.stubEnv('MODE', 'e2e')
    vi.stubEnv('VITE_E2E_DISABLE_PUSH', 'true')
    localStorage.removeItem('celtas_push_session') // Legacy bootstrap without metadata.
    await push.registerPushNotifications()
    const session = push.capturePushSession()
    expect(session).toMatchObject({ identity: 'a', revoked: false })
    expect(session?.generation).toBeTruthy()
    await push.stopPushNotifications()
    expect(push.capturePushSession()).toMatchObject({
      generation: session?.generation,
      identity: 'a',
      revoked: true,
    })
    expect(sdk.supported).not.toHaveBeenCalled()
    expect(sdk.initialize).not.toHaveBeenCalled()
    expect(sdk.messaging).not.toHaveBeenCalled()
    expect(sdk.token).not.toHaveBeenCalled()
    expect(sdk.remove).not.toHaveBeenCalled()
    expect(sdk.message).not.toHaveBeenCalled()
    expect(permission).not.toHaveBeenCalled()
    expect(navigator.serviceWorker.register).not.toHaveBeenCalled()
    expect(navigator.locks.request).not.toHaveBeenCalled()
    expect(transport).not.toHaveBeenCalled()
  })

  it('does not remotely clean a prior registration when E2E push is disabled', async () => {
    await push.registerPushNotifications()
    expect(patches()).toHaveLength(1)
    vi.clearAllMocks()
    vi.stubEnv('MODE', 'e2e')
    vi.stubEnv('VITE_E2E_DISABLE_PUSH', 'true')
    await push.stopPushNotifications()
    expect(sdk.remove).not.toHaveBeenCalled()
    expect(sdk.initialize).not.toHaveBeenCalled()
    expect(navigator.locks.request).not.toHaveBeenCalled()
    expect(transport).not.toHaveBeenCalled()
  })

  it.each([
    { dev: false, mode: 'e2e', disabled: 'true' },
    { dev: true, mode: 'development', disabled: 'true' },
    { dev: true, mode: 'e2e', disabled: 'false' },
  ])(
    'preserves normal push outside explicit development E2E: %j',
    async ({ dev, mode, disabled }) => {
      vi.stubEnv('DEV', dev)
      vi.stubEnv('MODE', mode)
      vi.stubEnv('VITE_E2E_DISABLE_PUSH', disabled)
      await push.registerPushNotifications()
      expect(sdk.initialize).toHaveBeenCalledOnce()
      expect(sdk.token).toHaveBeenCalledOnce()
      expect(permission).toHaveBeenCalledOnce()
      expect(patches()).toHaveLength(1)
    },
  )

  it('DELETE reaches the simulated server before an aborted PATCH finishes there', async () => {
    const gate = deferred<void>()
    const reply = transport.getMockImplementation()!
    const revoked = new Set<string>()
    let persisted: string | null = null
    transport.mockImplementation(async (config) => {
      const body = JSON.parse(config.data)
      if (config.method === 'delete') {
        revoked.add(body.generation)
        persisted = null
      }
      if (config.method === 'patch') {
        await gate.promise
        if (revoked.has(body.generation)) {
          throw new AxiosError('revoked', undefined, config, undefined, {
            status: 409,
            statusText: '',
            config,
            headers: {},
            data: {},
          })
        }
        persisted = body.fcmToken
      }
      return reply(config)
    })
    const registering = push.registerPushNotifications()
    await flush()
    expect(patches()).toHaveLength(1)
    const stopping = push.stopPushNotifications()
    await flush()
    expect(revoked.has(push.capturePushGeneration()!)).toBe(true)
    gate.resolve()
    await Promise.all([registering, stopping])
    expect(persisted).toBeNull()
  })
  it('revokes the generation immediately while getToken still holds the installation lock', async () => {
    const gate = deferred<string>()
    sdk.token.mockReturnValue(gate.promise)
    const generation = push.capturePushGeneration()
    const registering = push.registerPushNotifications()
    await flush()
    const stopping = push.stopPushNotifications()
    await flush()
    expect(deletes()).toHaveLength(1)
    expect(JSON.parse(deletes()[0][0].data)).toEqual({ generation })
    expect(patches()).toHaveLength(0)
    gate.resolve('late')
    await Promise.all([registering, stopping])
    expect(patches()).toHaveLength(0)
  })
  it('new login of the same identity uses a different generation after logout', async () => {
    await push.registerPushNotifications()
    const oldGeneration = push.capturePushGeneration()
    await push.stopPushNotifications()
    push.activatePushSession('a')
    store.getState().setSession('new-access-a', admin, true)
    await push.registerPushNotifications()
    expect(push.capturePushGeneration()).not.toBe(oldGeneration)
    expect(JSON.parse(deletes()[0][0].data).generation).toBe(oldGeneration)
    expect(JSON.parse(patches()[1][0].data).generation).toBe(
      push.capturePushGeneration(),
    )
  })
  it('PATCH failure retries within the same generation', async () => {
    const generation = push.capturePushGeneration()
    const reply = transport.getMockImplementation()!
    transport.mockRejectedValueOnce(new AxiosError('offline'))
    await push.registerPushNotifications()
    transport.mockImplementation(reply)
    await push.registerPushNotifications()
    expect(patches()).toHaveLength(2)
    expect(
      patches().map(([config]) => JSON.parse(config.data).generation),
    ).toEqual([generation, generation])
  })
  it('communicates missing Web Locks without requesting permission or PATCH', async () => {
    vi.stubGlobal('navigator', { locks: undefined })
    const warning = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)
    await push.registerPushNotifications()
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('Web Locks'))
    expect(permission).not.toHaveBeenCalled()
    expect(patches()).toHaveLength(0)
  })
  it('registers once for two simultaneous calls with the captured session', async () => {
    const first = push.registerPushNotifications()
    expect(push.registerPushNotifications()).toBe(first)
    await first
    expect(sdk.token).toHaveBeenCalledTimes(1)
    expect(patches()).toHaveLength(1)
    expect(patches()[0][0].headers.Authorization).toBe('Bearer access-a')
    expect(JSON.parse(patches()[0][0].data)).toEqual({
      fcmToken: 'fcm-a',
      generation: push.capturePushGeneration(),
    })
    await push.registerPushNotifications()
    expect(patches()).toHaveLength(1)
    expect(listeners.filter(([type]) => type === 'storage')).toHaveLength(1)
  })
  it.each(['unsupported', 'denied', 'empty', 'no-locks'])(
    'does not register: %s',
    async (reason) => {
      if (reason === 'unsupported') sdk.supported.mockResolvedValue(false)
      if (reason === 'denied') permission.mockResolvedValue('denied')
      if (reason === 'empty') sdk.token.mockResolvedValue('')
      if (reason === 'no-locks')
        vi.stubGlobal('navigator', { locks: undefined })
      await push.registerPushNotifications()
      expect(patches()).toHaveLength(0)
    },
  )
  it('PATCH failure is nonblocking and does not log its token/error', async () => {
    transport.mockRejectedValue(new Error('secret-fcm-token'))
    const warning = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)
    await expect(push.registerPushNotifications()).resolves.toBeUndefined()
    expect(JSON.stringify(warning.mock.calls)).not.toContain('secret-fcm-token')
  })
  it('logout while permission is pending prevents getToken and PATCH', async () => {
    const gate = deferred<NotificationPermission>()
    permission.mockReturnValue(gate.promise)
    const registering = push.registerPushNotifications()
    await flush()
    await push.stopPushNotifications()
    gate.resolve('granted')
    await registering
    expect(sdk.token).not.toHaveBeenCalled()
    expect(patches()).toHaveLength(0)
  })
  it('logout during getToken cleans the late token, never registers it', async () => {
    const gate = deferred<string>()
    sdk.token.mockReturnValue(gate.promise)
    const registering = push.registerPushNotifications()
    await flush()
    const stopping = push.stopPushNotifications()
    gate.resolve('late-fcm')
    await Promise.all([registering, stopping])
    expect(patches()).toHaveLength(0)
    expect(JSON.parse(deletes()[0][0].data)).toEqual({
      generation: push.capturePushGeneration(),
    })
    expect(deletes()[0][0].headers.Authorization).toBe('Bearer access-a')
  })
  it('logout during PATCH follows it with conditional DELETE and ignores the late response', async () => {
    const gate = deferred<void>()
    const reply = transport.getMockImplementation()!
    transport.mockImplementation(async (config) => {
      if (config.method === 'patch') await gate.promise
      return reply(config)
    })
    const registering = push.registerPushNotifications()
    await flush()
    expect(patches()).toHaveLength(1)
    const stopping = push.stopPushNotifications()
    gate.resolve()
    await Promise.all([registering, stopping])
    expect(deletes()).toHaveLength(1)
    expect(
      JSON.parse(localStorage.getItem('celtas_push_session')!).revoked,
    ).toBe(true)
  })
  it('A to B during getToken cannot borrow B credentials or erase B registration', async () => {
    const gate = deferred<string>()
    sdk.token.mockReturnValueOnce(gate.promise).mockResolvedValue('fcm-b')
    const first = push.registerPushNotifications()
    await flush()
    push.activatePushSession('b')
    store.getState().setSession('access-b', { ...admin, id: 'b' }, true)
    const second = push.registerPushNotifications()
    gate.resolve('late-a')
    await Promise.all([first, second])
    expect(patches()).toHaveLength(1)
    expect(patches()[0][0].headers.Authorization).toBe('Bearer access-b')
    expect(JSON.parse(patches()[0][0].data).fcmToken).toBe('fcm-b')
    expect(deletes()).toHaveLength(0)
  })
  it.each(['delete', 'sdk', 'offline'])(
    'logout finishes if %s cleanup fails',
    async (reason) => {
      await push.registerPushNotifications()
      if (reason !== 'sdk')
        transport.mockRejectedValue(new AxiosError('offline'))
      if (reason !== 'delete')
        sdk.remove.mockRejectedValue(new Error('sdk failed'))
      await expect(push.stopPushNotifications()).resolves.toBeUndefined()
      expect(deletes()).toHaveLength(1)
      expect(deletes()[0][0]).toMatchObject({ _skipSessionAuth: true })
    },
  )
  it('bounds cleanup but holds the installation lock until the SDK finishes', async () => {
    await push.registerPushNotifications()
    const gate = deferred<boolean>()
    sdk.remove.mockReturnValue(gate.promise)
    vi.useFakeTimers()
    const stopping = push.stopPushNotifications()
    await flush()
    await vi.advanceTimersByTimeAsync(push.PUSH_CLEANUP_TIMEOUT)
    await stopping
    push.activatePushSession('b')
    store.getState().setSession('access-b', { ...admin, id: 'b' }, true)
    const registering = push.registerPushNotifications()
    await flush()
    expect(patches()).toHaveLength(1)
    gate.resolve(true)
    await registering
    expect(patches()).toHaveLength(2)
  })
  it('another tab logout stops this session without removing a newer shared refresh token', async () => {
    await push.registerPushNotifications()
    const owner = JSON.parse(localStorage.getItem('celtas_push_session')!)
    localStorage.setItem(
      'celtas_push_session',
      JSON.stringify({ ...owner, revoked: true }),
    )
    localStorage.setItem('celtas_refresh_token', 'newer-refresh')
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'celtas_push_session' }),
    )
    await push.registerPushNotifications()
    expect(store.getState().accessToken).toBeNull()
    expect(localStorage.getItem('celtas_refresh_token')).toBe('newer-refresh')
    expect(patches()).toHaveLength(1)
    expect(deletes()).toHaveLength(0)
  })
  it('an already registered installation does not PATCH again in a restored tab session', async () => {
    await push.registerPushNotifications()
    store.getState().setSession('restored-access', admin, true)
    await push.registerPushNotifications()
    expect(patches()).toHaveLength(1)
  })
  it('a refreshed access token preserves FCM; definitive loss deletes SDK without authenticated DELETE', async () => {
    await push.registerPushNotifications()
    const initialDeletes = sdk.remove.mock.calls.length
    store.setState({ accessToken: 'refreshed-access' })
    await flush()
    expect(sdk.remove).toHaveBeenCalledTimes(initialDeletes)
    store.getState().clearSession()
    await flush()
    expect(sdk.remove).toHaveBeenCalledTimes(initialDeletes + 1)
    expect(deletes()).toHaveLength(0)
  })
  it.each(['valid', 'invalid', 'temporary'])(
    'real Axios refresh path: %s',
    async (outcome) => {
      await push.registerPushNotifications()
      localStorage.setItem('celtas_refresh_token', 'refresh-a')
      const before = sdk.remove.mock.calls.length
      const reply = transport.getMockImplementation()!
      transport.mockImplementation(async (config) => {
        if (config.url === '/auth/refresh') {
          if (outcome !== 'valid')
            throw new AxiosError(
              'refresh failed',
              undefined,
              config,
              undefined,
              {
                status: outcome === 'invalid' ? 401 : 503,
                statusText: '',
                config,
                headers: {},
                data: {},
              },
            )
          return {
            status: 200,
            statusText: 'OK',
            config,
            headers: {},
            data: {
              success: true,
              data: {
                accessToken: 'refreshed',
                refreshToken: 'rotated',
                user: admin,
              },
            },
          }
        }
        if (
          config.url === '/probe' &&
          config.headers.Authorization !== 'Bearer refreshed'
        ) {
          throw new AxiosError('expired', undefined, config, undefined, {
            status: 401,
            statusText: '',
            config,
            headers: {},
            data: {},
          })
        }
        return reply(config)
      })
      if (outcome === 'valid') await api.get('/probe')
      else await expect(api.get('/probe')).rejects.toBeDefined()
      expect(store.getState().accessToken).toBe(
        outcome === 'invalid'
          ? null
          : outcome === 'valid'
            ? 'refreshed'
            : 'access-a',
      )
      expect(sdk.remove).toHaveBeenCalledTimes(
        before + (outcome === 'invalid' ? 1 : 0),
      )
      expect(deletes()).toHaveLength(0)
    },
  )
  it('two tab runtimes serialize and deduplicate installation registration', async () => {
    const tabOne = push
    const storeOne = store
    vi.resetModules()
    const storeTwo = (await import('@/features/auth/store')).useAuthStore
    const apiTwo = (await import('./api-client')).default
    const tabTwo = await import('./firebase')
    storeTwo.getState().setSession('access-a-tab2', admin, true)
    apiTwo.defaults.adapter = transport
    const first = tabOne.registerPushNotifications()
    const secondTabListeners = listeners.length
    await Promise.all([first, tabTwo.registerPushNotifications()])
    expect(patches()).toHaveLength(1)
    const stopped = tabOne.stopPushNotifications()
    const event = new StorageEvent('storage', { key: 'celtas_push_session' })
    for (const [type, listener] of listeners.slice(secondTabListeners)) {
      if (type === 'storage' && typeof listener === 'function') listener(event)
    }
    await stopped
    expect(storeTwo.getState().accessToken).toBeNull()
    await tabTwo.registerPushNotifications()
    expect(patches()).toHaveLength(1)
    expect(storeOne.getState().user?.id).toBe('a')
    expect(deletes()).toHaveLength(1)
  })
  it('explicit logout clears local session after failed remote and SDK cleanup', async () => {
    await push.registerPushNotifications()
    transport.mockRejectedValue(new AxiosError('offline'))
    sdk.remove.mockRejectedValue(new Error('failed'))
    const { logout } = await import('@/features/auth/hooks')
    await logout()
    expect(store.getState().accessToken).toBeNull()
    expect(deletes()).toHaveLength(1)
  })
  it('SDK failure while rotating a login token prevents reusing the old token', async () => {
    sdk.remove.mockRejectedValue(new Error('cannot rotate'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await push.registerPushNotifications()
    expect(sdk.token).not.toHaveBeenCalled()
    expect(patches()).toHaveLength(0)
  })
  it('missing Notification API or Firebase configuration does not register', async () => {
    vi.stubEnv('VITE_FIREBASE_VAPID_KEY', '')
    await push.registerPushNotifications()
    expect(patches()).toHaveLength(0)
  })
  it('an old cleanup cannot delete the installation owned by a new login', async () => {
    await push.registerPushNotifications()
    const before = sdk.remove.mock.calls.length
    push.activatePushSession('b')
    const stopping = push.stopPushNotifications()
    await stopping
    expect(sdk.remove).toHaveBeenCalledTimes(before)
    expect(deletes()).toHaveLength(1)
    expect(JSON.parse(deletes()[0][0].data).generation).not.toBe(
      push.capturePushGeneration(),
    )
    store.getState().setSession('access-b', { ...admin, id: 'b' }, true)
    sdk.token.mockResolvedValue('fresh-b')
    await push.registerPushNotifications()
    expect(JSON.parse(patches()[1][0].data)).toEqual({
      fcmToken: 'fresh-b',
      generation: push.capturePushGeneration(),
    })
  })
  it('a late DELETE keeps captured A credentials and generation while B registers independently', async () => {
    await push.registerPushNotifications()
    const gate = deferred<void>()
    const reply = transport.getMockImplementation()!
    transport.mockImplementation(async (config) => {
      if (config.method === 'delete') await gate.promise
      return reply(config)
    })
    vi.useFakeTimers()
    const stopped = push.stopPushNotifications()
    await flush()
    await vi.advanceTimersByTimeAsync(push.PUSH_CLEANUP_TIMEOUT)
    await stopped
    push.activatePushSession('b')
    store.getState().setSession('access-b', { ...admin, id: 'b' }, true)
    sdk.token.mockResolvedValue('fresh-b')
    const registered = push.registerPushNotifications()
    await flush()
    expect(patches()).toHaveLength(2)
    expect(JSON.parse(deletes()[0][0].data).generation).not.toBe(
      JSON.parse(patches()[1][0].data).generation,
    )
    gate.resolve()
    await registered
    expect(deletes()[0][0].headers.Authorization).toBe('Bearer access-a')
    expect(patches()[1][0].headers.Authorization).toBe('Bearer access-b')
  })
  it('an unauthenticated bootstrap failure cleans only its captured generation', async () => {
    store.getState().clearSession(false)
    localStorage.setItem('celtas_refresh_token', 'refresh-a')
    transport.mockImplementation(async (config) => {
      throw new AxiosError('invalid refresh', undefined, config, undefined, {
        status: 401,
        statusText: '',
        config,
        headers: {},
        data: {},
      })
    })
    const { useBootstrap } = await import('@/features/auth/hooks')
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children)
    const { result } = renderHook(() => useBootstrap(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(sdk.remove).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('celtas_refresh_token')).toBeNull()
    expect(deletes()).toHaveLength(0)
  })
  it('a late bootstrap 401 cannot revoke another tab new login or remove its refresh token', async () => {
    store.getState().clearSession(false)
    localStorage.setItem('celtas_refresh_token', 'refresh-a')
    const gate = deferred<void>()
    transport.mockImplementation(async (config) => {
      await gate.promise
      throw new AxiosError('invalid refresh', undefined, config, undefined, {
        status: 401,
        statusText: '',
        config,
        headers: {},
        data: {},
      })
    })
    const { useBootstrap } = await import('@/features/auth/hooks')
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children)
    const { result } = renderHook(() => useBootstrap(), { wrapper })
    await flush()
    push.activatePushSession('b')
    localStorage.setItem('celtas_refresh_token', 'refresh-b')
    gate.resolve()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(sdk.remove).not.toHaveBeenCalled()
    expect(localStorage.getItem('celtas_refresh_token')).toBe('refresh-b')
    expect(
      JSON.parse(localStorage.getItem('celtas_push_session')!).revoked,
    ).toBe(false)
  })
  it('the Axios interceptor rejects a queued PATCH after another tab changes generation', async () => {
    const { pushTokenRequest } = await import('./api-client')
    const generation = push.capturePushGeneration()!
    const pending = pushTokenRequest('patch', 'old-token', {
      sessionId: store.getState().sessionId,
      identity: 'a',
      owner: { generation },
    })
    push.activatePushSession('b')
    await expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    expect(patches()).toHaveLength(0)
  })
  it('getToken failure remains nonblocking and sanitized', async () => {
    sdk.token.mockRejectedValue(new Error('private-token'))
    const warning = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)
    await push.registerPushNotifications()
    expect(patches()).toHaveLength(0)
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private-token')
  })
  it('without Web Locks registration is skipped but logout still attempts SDK cleanup', async () => {
    vi.stubGlobal('navigator', { locks: undefined })
    await push.registerPushNotifications()
    await push.stopPushNotifications()
    expect(patches()).toHaveLength(0)
    expect(sdk.remove).toHaveBeenCalledTimes(1)
  })
})
