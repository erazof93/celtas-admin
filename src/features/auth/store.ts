import { create } from 'zustand'
import type { AuthUser } from './types'

/**
 * El refreshToken vive en localStorage (trade-off de seguridad aceptado para
 * un panel interno — ver skill react-celtas). El accessToken SOLO en memoria.
 */
const REFRESH_TOKEN_KEY = 'celtas_refresh_token'

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token)
}

export function clearRefreshToken(): void {
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

interface AuthState {
  /** Access token en memoria — se pierde al recargar a propósito. */
  accessToken: string | null
  user: AuthUser | null
  setSession: (accessToken: string, user: AuthUser) => void
  clearSession: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  setSession: (accessToken, user) => set({ accessToken, user }),
  clearSession: () => {
    clearRefreshToken()
    set({ accessToken: null, user: null })
  },
}))
