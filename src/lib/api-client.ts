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
  const { accessToken } = useAuthStore.getState()
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
}

let isRefreshing = false
let pendingQueue: Array<(token: string | null) => void> = []
let roleCheck: { token: string; promise: Promise<void> } | null = null

/** /users/me reads the current DB role, without requiring Admin permissions. */
async function reconcileRole(original: RetriableRequestConfig) {
  const session = useAuthStore.getState()
  const token = session.accessToken
  const userId = session.user?.id
  if (
    !token ||
    session.user?.role !== 'admin' ||
    original.headers.Authorization !== `Bearer ${token}`
  )
    return
  if (roleCheck?.token === token) return roleCheck.promise
  const check = {
    token,
    promise: (async () => {
      try {
        const { data: user } = await api.get<AuthUser>('/users/me')
        const current = useAuthStore.getState()
        // A late response must not resurrect logout or overwrite another session.
        if (
          current.accessToken === token &&
          current.user?.id === userId &&
          user.id === userId &&
          (user.role === 'admin' || user.role === 'cliente')
        ) {
          current.setSession(token, user)
        }
      } catch {
        // A failed profile check is not evidence of a lost role. 401 uses normal refresh.
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
          if (token) {
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
      setRefreshToken(data.refreshToken)
      useAuthStore.getState().setSession(data.accessToken, data.user)
      flushQueue(data.accessToken)
      original.headers.Authorization = `Bearer ${data.accessToken}`
      return api(original)
    } catch (refreshError) {
      flushQueue(null)
      // Solo un 401 definitivo del refresh significa token inválido → limpiar
      // sesión y redirigir. Errores transitorios (red, 5xx, cold start de
      // Render) conservan la sesión: la próxima request reintentará el refresh.
      if (
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
