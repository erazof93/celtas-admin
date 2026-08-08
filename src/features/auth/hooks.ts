import { useMutation, useQuery } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import api from '@/lib/api-client'
import {
  useAuthStore,
  getRefreshToken,
  setRefreshToken,
  clearRefreshToken,
} from './store'
import type { AuthTokens } from './types'

export interface LoginInput {
  email: string
  password: string
}

/**
 * Login tradicional (email + password) contra POST /auth/login.
 * Al tener éxito: accessToken + user al store (memoria) y refreshToken a
 * localStorage — nunca el accessToken a localStorage.
 */
export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession)

  return useMutation({
    mutationFn: (input: LoginInput) =>
      api.post<AuthTokens>('/auth/login', input).then((r) => r.data),
    onSuccess: (tokens) => {
      setRefreshToken(tokens.refreshToken)
      setSession(tokens.accessToken, tokens.user)
    },
  })
}

/**
 * Logout: limpia el store (accessToken + user en memoria) y el refreshToken de
 * localStorage, y redirige a /login. Lo usa el interceptor cuando el refresh
 * falla y lo usará el botón de logout del AdminLayout (módulo 2).
 */
export function logout(): void {
  useAuthStore.getState().clearSession()
  window.location.assign('/login')
}

/**
 * Persistencia de sesión al recargar la página.
 *
 * El accessToken vive solo en memoria, así que al recargar el store arranca
 * vacío. Si hay refreshToken en localStorage, pedimos un accessToken nuevo
 * ANTES de decidir si mostrar login o el panel. Si no hay refreshToken (o el
 * refresh falla), la sesión se limpia y se muestra el login.
 */
export function useBootstrap() {
  const setSession = useAuthStore((s) => s.setSession)

  return useQuery({
    queryKey: ['auth', 'bootstrap'],
    queryFn: async () => {
      const refreshToken = getRefreshToken()
      if (!refreshToken) return null

      try {
        const { data } = await api.post<AuthTokens>('/auth/refresh', {
          refreshToken,
        })
        // Rotación: el backend emite un refreshToken nuevo en cada refresh.
        setRefreshToken(data.refreshToken)
        setSession(data.accessToken, data.user)
        return data.user
      } catch (error) {
        // Solo un 401 definitivo significa token inválido/expirado → limpiar.
        // Errores transitorios (red, 5xx, cold start de Render) conservan el
        // refreshToken para no destruir una sesión válida por un fallo de red.
        if (error instanceof AxiosError && error.response?.status === 401) {
          clearRefreshToken()
          useAuthStore.getState().clearSession()
        }
        return null
      }
    },
    retry: false,
    staleTime: Infinity,
  })
}
