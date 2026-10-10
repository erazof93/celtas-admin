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
  ordersAccessBlocked: { sessionId: number; identity: string } | null
  sessionId: number
  /** Signals logout before asynchronous push cleanup; does not change tokens. */
  sessionEnding: boolean
  roleStatus: 'unverified' | 'checking' | 'confirmed' | 'error'
  setSession: (accessToken: string, user: AuthUser, confirmed?: boolean) => void
  clearSession: (clearSharedToken?: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  ordersAccessBlocked: null,
  sessionId: 0,
  sessionEnding: false,
  roleStatus: 'unverified',
  setSession: (accessToken, user, confirmed = false) =>
    set((state) => ({
      accessToken,
      user,
      ordersAccessBlocked: null,
      sessionId: state.sessionId + 1,
      sessionEnding: false,
      roleStatus: confirmed ? 'confirmed' : 'unverified',
    })),
  clearSession: (clearSharedToken = true) => {
    if (clearSharedToken) clearRefreshToken()
    set((state) => ({
      accessToken: null,
      user: null,
      ordersAccessBlocked: null,
      sessionId: state.sessionId + 1,
      sessionEnding: false,
      roleStatus: 'unverified',
    }))
  },
}))
