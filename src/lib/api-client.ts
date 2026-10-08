import axios, {
  AxiosError,
  CanceledError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'
import {
  useAuthStore,
  getRefreshToken,
  setRefreshToken,
} from '@/features/auth/store'
import type { AuthTokens, AuthUser } from '@/features/auth/types'

/**
 * Instancia única de cliente para todo el panel.
 * baseURL siempre desde VITE_API_BASE_URL — nunca hardcodeada en componentes.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

/**
 * Interceptor de request: adjunta el accessToken (en memoria, desde el store
 * de Zustand) a cada request.
 */
api.interceptors.request.use((config) => {
  const { accessToken, sessionId } = useAuthStore.getState()
  const request = config as RetriableRequestConfig
  request._sessionId ??= sessionId
  if (config.url === '/auth/refresh' && !config.timeout) config.timeout = 90_000
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

/**
 * Interceptor de response:
 *  1. Desenvuelve el envelope estándar { success, data } → los hooks reciben
 *     el payload directo (response.data = payload).
 *  2. En 401: intenta POST /auth/refresh UNA sola vez con el refreshToken de
 *     localStorage; si funciona, guarda los tokens nuevos (rotación) y
 *     reintenta la request original. Si el refresh falla, limpia la sesión y
 *     redirige a /login. Nunca reintenta en loop infinito.
 */
interface RequestConfig extends AxiosRequestConfig {
  /** Called before role reconciliation can unmount the requesting screen. */
  onAuthorizationError?: () => void
}
interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  onAuthorizationError?: () => void
  _retry?: boolean
  _sessionId?: number
}

let activeRefresh: {
  sessionId: number
  identity: string | undefined
  controller: AbortController
  promise: Promise<string>
} | null = null
let roleCheck: { sessionId: number; promise: Promise<void> } | null = null

/** Shared by initial admission and 403 reconciliation; never replays a forbidden request. */
export async function confirmCurrentUser() {
  const session = useAuthStore.getState()
  const { sessionId, user } = session
  if (!session.accessToken || !user) return
  if (roleCheck?.sessionId === sessionId) return roleCheck.promise
  useAuthStore.setState({ roleStatus: 'checking' })
  const check = {
    sessionId,
    promise: (async () => {
      try {
        const { data: currentUser } = await api.get<AuthUser>('/users/me', {
          timeout: 15000,
        })
        const current = useAuthStore.getState()
        if (current.sessionId !== sessionId) return
        if (
          currentUser.id !== user.id ||
          (currentUser.role !== 'admin' && currentUser.role !== 'cliente')
        )
          throw new Error('Unexpected session profile')
        useAuthStore.setState({ user: currentUser, roleStatus: 'confirmed' })
      } catch (error) {
        if (useAuthStore.getState().sessionId === sessionId)
          useAuthStore.setState({ roleStatus: 'error' })
        throw error
      }
    })(),
  }
  roleCheck = check
  try {
    await check.promise
  } finally {
    if (roleCheck === check) roleCheck = null
  }
}

async function reconcileRole(original: RetriableRequestConfig) {
  const session = useAuthStore.getState()
  if (
    !session.accessToken ||
    session.user?.role !== 'admin' ||
    original._sessionId !== session.sessionId ||
    original.headers.Authorization !== `Bearer ${session.accessToken}`
  )
    return
  try {
    await confirmCurrentUser()
  } catch {
    /* Failure does not prove a role change; keep the session for retry. */
  }
}
/** A refresh belongs to a session, not to an individual GET. */
function refreshAccessToken(refreshToken: string) {
  const { sessionId, user } = useAuthStore.getState()
  const identity = user?.id
  if (activeRefresh?.sessionId === sessionId && activeRefresh.identity === identity)
    return activeRefresh.promise
  const controller = new AbortController()
  const currentSession = () => {
    const s = useAuthStore.getState()
    return s.sessionId === sessionId && s.user?.id === identity
  }
  const unsubscribe = useAuthStore.subscribe(() => {
    if (!currentSession()) controller.abort()
  })
  const promise = (async () => {
    try {
      const { data } = await api.post<AuthTokens>('/auth/refresh', { refreshToken }, {
        timeout: 90_000, signal: controller.signal,
      })
      if (controller.signal.aborted || !currentSession()) throw new CanceledError()
      if (data.user.id !== identity) throw new Error('Unexpected refresh identity')
      setRefreshToken(data.refreshToken)
      useAuthStore.setState({ accessToken: data.accessToken, user: data.user })
      return data.accessToken
    } catch (error) {
      // Temporary errors keep the session; an invalid refresh token does not.
      if (currentSession() && error instanceof AxiosError && error.response?.status === 401) {
        useAuthStore.getState().clearSession()
        window.location.assign('/login')
      }
      throw error
    } finally {
      unsubscribe()
      if (activeRefresh?.controller === controller) activeRefresh = null
    }
  })()
  activeRefresh = { sessionId, identity, controller, promise }
  return promise
}

function isAuthEndpoint(url?: string): boolean {
  return url === '/auth/login' || url === '/auth/refresh'
}

api.interceptors.response.use(
  (response) => {
    const body = response.data as { success?: boolean; data?: unknown } | null
    if (
      body &&
      typeof body === 'object' &&
      body.success === true &&
      'data' in body
    ) {
      response.data = body.data
    }
    return response
  },
  async (error: AxiosError) => {
    const original = error.config as RetriableRequestConfig | undefined

    if (
      error.response?.status === 403 &&
      original &&
      !isAuthEndpoint(original.url) &&
      original.url?.split('?')[0] !== '/users/me'
    ) {
      if (original._sessionId === useAuthStore.getState().sessionId)
        original.onAuthorizationError?.()
      await reconcileRole(original)
      return Promise.reject(error)
    }

    if (error.response?.status === 401 && original?._retry &&
      original._sessionId === useAuthStore.getState().sessionId)
      original.onAuthorizationError?.()

    // No es 401, ya fue reintentada, o es el propio login/refresh: no refrescar.
    if (
      error.response?.status !== 401 ||
      !original ||
      original._retry ||
      isAuthEndpoint(original.url)
    ) {
      return Promise.reject(error)
    }

    const refreshSessionId = original._sessionId
    if (refreshSessionId !== useAuthStore.getState().sessionId)
      return Promise.reject(error)
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      useAuthStore.getState().clearSession()
      window.location.assign('/login')
      return Promise.reject(error)
    }

    original._retry = true
    try {
      const token = await refreshAccessToken(refreshToken)
      if (original.signal?.aborted || refreshSessionId !== useAuthStore.getState().sessionId)
        throw new CanceledError()
      original.headers.Authorization = 'Bearer ' + token
      return api(original)
    } catch (refreshError) {
      return Promise.reject(refreshError)
    }
  },
)

export default api

/** Helper tipado para GET que devuelve el payload desenvuelto. */
export async function get<T>(
  url: string,
  config?: RequestConfig,
): Promise<T> {
  const { data } = await api.get<T>(url, config)
  return data
}

/** Helper tipado para POST que devuelve el payload desenvuelto. */
export async function post<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await api.post<T>(url, body, config)
  return data
}

/** Helper tipado para PATCH que devuelve el payload desenvuelto. */
export async function patch<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await api.patch<T>(url, body, config)
  return data
}

/** Helper tipado para PUT que devuelve el payload desenvuelto. */
export async function put<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await api.put<T>(url, body, config)
  return data
}

/** Helper tipado para DELETE que devuelve el payload desenvuelto. */
export async function del<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await api.delete<T>(url, config)
  return data
}
