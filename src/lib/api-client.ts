import axios, {
  AxiosError,
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
interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
  _sessionId?: number
}

let isRefreshing = false
let pendingQueue: Array<(token: string | null) => void> = []
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
function flushQueue(token: string | null) {
  pendingQueue.forEach((resolve) => resolve(token))
  pendingQueue = []
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
      await reconcileRole(original)
      return Promise.reject(error)
    }

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

    if (isRefreshing) {
      original._retry = true
      // Otra request ya está refrescando: encolar esta y esperar el token nuevo.
      return new Promise((resolve, reject) => {
        pendingQueue.push((token) => {
          if (token && useAuthStore.getState().sessionId === refreshSessionId) {
            original.headers.Authorization = `Bearer ${token}`
            resolve(api(original))
          } else {
            reject(error)
          }
        })
      })
    }

    original._retry = true
    isRefreshing = true

    try {
      const { data } = await api.post<AuthTokens>('/auth/refresh', {
        refreshToken,
      })
      // Rotación: el backend emite un refreshToken nuevo en cada refresh.
      if (useAuthStore.getState().sessionId !== refreshSessionId) {
        flushQueue(null)
        return Promise.reject(error)
      }
      setRefreshToken(data.refreshToken)
      useAuthStore.setState({ accessToken: data.accessToken, user: data.user })
      flushQueue(data.accessToken)
      original.headers.Authorization = `Bearer ${data.accessToken}`
      return api(original)
    } catch (refreshError) {
      flushQueue(null)
      // Solo un 401 definitivo del refresh significa token inválido → limpiar
      // sesión y redirigir. Errores transitorios (red, 5xx, cold start de
      // Render) conservan la sesión: la próxima request reintentará el refresh.
      if (
        useAuthStore.getState().sessionId === refreshSessionId &&
        refreshError instanceof AxiosError &&
        refreshError.response?.status === 401
      ) {
        useAuthStore.getState().clearSession()
        window.location.assign('/login')
      }
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)

export default api

/** Helper tipado para GET que devuelve el payload desenvuelto. */
export async function get<T>(
  url: string,
  config?: AxiosRequestConfig,
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
