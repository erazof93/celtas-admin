import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `registerPushNotifications` es best-effort por diseño: nunca debe lanzar
 * ni bloquear el panel, sin importar qué falle (navegador sin soporte,
 * permiso denegado, falta configuración de Firebase, o un error inesperado
 * del SDK). Estos tests cubren las salidas tempranas reales sin depender de
 * Firebase real ni de APIs de navegador que jsdom no implementa
 * (`Notification` no existe en jsdom por defecto — confirmado, ver
 * comentario en cada test).
 */

const { patchMock } = vi.hoisted(() => ({ patchMock: vi.fn() }))
vi.mock('./api-client', () => ({ patch: patchMock }))

const { isSupportedMock, getMessagingMock, getTokenMock } = vi.hoisted(() => ({
  isSupportedMock: vi.fn(),
  getMessagingMock: vi.fn(),
  getTokenMock: vi.fn(),
}))
vi.mock('firebase/messaging', () => ({
  isSupported: isSupportedMock,
  getMessaging: getMessagingMock,
  getToken: getTokenMock,
}))
vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('registerPushNotifications', () => {
  it('navegador sin Notification API (caso real de jsdom, y de navegadores viejos): no lanza, no llama a patch', async () => {
    vi.resetModules()
    const { registerPushNotifications } = await import('./firebase')
    await expect(registerPushNotifications()).resolves.toBeUndefined()
    expect(patchMock).not.toHaveBeenCalled()
  })

  it('sin VITE_FIREBASE_VAPID_KEY: no lanza, no llama a patch', async () => {
    vi.stubGlobal('Notification', { requestPermission: vi.fn() })
    vi.resetModules()
    const { registerPushNotifications } = await import('./firebase')

    await expect(registerPushNotifications()).resolves.toBeUndefined()
    expect(patchMock).not.toHaveBeenCalled()
  })

  it('permiso denegado: no llama a patch aunque haya VAPID key', async () => {
    vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'test-vapid-key')
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'celtas-b0bd5')
    vi.stubEnv('VITE_FIREBASE_APP_ID', 'test-app-id')
    isSupportedMock.mockResolvedValue(true)
    getMessagingMock.mockReturnValue({})
    vi.stubGlobal('Notification', {
      requestPermission: vi.fn().mockResolvedValue('denied'),
    })
    vi.resetModules()
    const { registerPushNotifications } = await import('./firebase')

    await expect(registerPushNotifications()).resolves.toBeUndefined()
    expect(patchMock).not.toHaveBeenCalled()
  })

  it('un error inesperado del SDK (ej. getToken lanza) nunca se propaga', async () => {
    vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'test-vapid-key')
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'celtas-b0bd5')
    vi.stubEnv('VITE_FIREBASE_APP_ID', 'test-app-id')
    isSupportedMock.mockResolvedValue(true)
    getMessagingMock.mockReturnValue({})
    getTokenMock.mockRejectedValue(new Error('boom'))
    vi.stubGlobal('Notification', {
      requestPermission: vi.fn().mockResolvedValue('granted'),
    })
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      serviceWorker: { register: vi.fn().mockResolvedValue({}) },
    })
    vi.resetModules()
    const { registerPushNotifications } = await import('./firebase')

    await expect(registerPushNotifications()).resolves.toBeUndefined()
    expect(patchMock).not.toHaveBeenCalled()
  })

  it('token obtenido con éxito: registra contra PATCH /users/me/fcm-token', async () => {
    vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'test-vapid-key')
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'celtas-b0bd5')
    vi.stubEnv('VITE_FIREBASE_APP_ID', 'test-app-id')
    isSupportedMock.mockResolvedValue(true)
    getMessagingMock.mockReturnValue({})
    getTokenMock.mockResolvedValue('the-fcm-token')
    vi.stubGlobal('Notification', {
      requestPermission: vi.fn().mockResolvedValue('granted'),
    })
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      serviceWorker: { register: vi.fn().mockResolvedValue({}) },
    })
    vi.resetModules()
    const { registerPushNotifications } = await import('./firebase')

    await registerPushNotifications()

    expect(patchMock).toHaveBeenCalledWith('/users/me/fcm-token', {
      fcmToken: 'the-fcm-token',
    })
  })
})
