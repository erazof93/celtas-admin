import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import api, { confirmCurrentUser } from '@/lib/api-client'
import ProtectedRoute from '@/routes/ProtectedRoute'
import { useBootstrap, useLogin } from './hooks'
import { getRefreshToken, setRefreshToken, useAuthStore } from './store'
import type { AuthUser } from './types'

const admin = { id: 'qa', role: 'admin', email: 'qa@test.local' } as AuthUser
const reply = (config: InternalAxiosRequestConfig, data: unknown) => ({
  status: 200,
  statusText: 'OK',
  config,
  headers: {},
  data: { success: true, data },
})
const tokens = (user = admin) => ({
  accessToken: 'qa-access',
  refreshToken: 'qa-refresh',
  user,
})
const mounted = vi.fn()
function AdminLayoutProbe() {
  mounted()
  return <p>AdminLayout</p>
}
function Gate() {
  return (
    <ProtectedRoute>
      <AdminLayoutProbe />
    </ProtectedRoute>
  )
}
function LoginFlow() {
  const login = useLogin()
  const user = useAuthStore((s) => s.user)
  return user ? (
    <Gate />
  ) : (
    <button
      onClick={() =>
        login.mutate({ email: 'qa@test.local', password: 'fixture' })
      }
    >
      Login
    </button>
  )
}
function BootstrapFlow() {
  const bootstrap = useBootstrap()
  return bootstrap.isLoading ? <p>Restaurando sesión</p> : <Gate />
}
function setup(view = <Gate />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{view}</MemoryRouter>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  useAuthStore.getState().clearSession()
  mounted.mockClear()
})

describe('admisión administrativa con rol vigente', () => {
  it('admisión y 403 concurrente comparten una sola consulta de perfil', async () => {
    useAuthStore.getState().setSession('stored-access', admin)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const profile = vi.fn()
    api.defaults.adapter = async (config) => {
      if (config.url !== '/users/me')
        throw new AxiosError('forbidden', undefined, config, undefined, {
          status: 403,
          statusText: '',
          config,
          headers: {},
          data: {},
        })
      profile()
      await gate
      return reply(config, admin)
    }
    setup()
    await screen.findByText('Comprobando acceso administrativo…')
    const request = api.get('/settings').catch(() => undefined)
    await act(async () => {
      await Promise.resolve()
    })
    expect(profile).toHaveBeenCalledTimes(1)
    await act(async () => release())
    await request
    await screen.findByText('AdminLayout')
    expect(profile).toHaveBeenCalledTimes(1)
  })
  it('refresh tardío de una comprobación anterior conserva la nueva sesión y su refresh token', async () => {
    useAuthStore.getState().setSession('expired', admin)
    setRefreshToken('old-refresh')
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const refresh = vi.fn()
    api.defaults.adapter = async (config) => {
      if (config.url === '/auth/refresh') {
        refresh()
        await gate
        return reply(config, tokens())
      }
      throw new AxiosError('expired', undefined, config, undefined, {
        status: 401,
        statusText: '',
        config,
        headers: {},
        data: {},
      })
    }
    const check = confirmCurrentUser().catch(() => undefined)
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    useAuthStore.getState().setSession('new-access', { ...admin, id: 'other' })
    setRefreshToken('new-refresh')
    release()
    await check
    expect(useAuthStore.getState().accessToken).toBe('new-access')
    expect(useAuthStore.getState().user?.id).toBe('other')
    expect(useAuthStore.getState().roleStatus).toBe('unverified')
    expect(getRefreshToken()).toBe('new-refresh')
  })
  it.each(['admin', 'cliente'] as const)(
    'login fresco %s respeta el rol sin consulta duplicada',
    async (role) => {
      const calls: string[] = []
      api.defaults.adapter = async (config) => {
        calls.push(config.url!)
        return reply(config, tokens({ ...admin, role }))
      }
      setup(<LoginFlow />)
      await userEvent.click(screen.getByRole('button', { name: 'Login' }))
      await screen.findByText(
        role === 'admin' ? 'AdminLayout' : 'Acceso denegado',
      )
      if (role === 'admin') expect(mounted).toHaveBeenCalled()
      else expect(mounted).not.toHaveBeenCalled()
      expect(calls).toEqual(['/auth/login'])
    },
  )
  it.each(['admin', 'cliente'] as const)(
    'restauración refresh admin confirma /users/me = %s',
    async (role) => {
      setRefreshToken('stored-refresh')
      let resolveProfile!: (value: AuthUser) => void
      const profile = new Promise<AuthUser>((resolve) => {
        resolveProfile = resolve
      })
      const calls: string[] = []
      api.defaults.adapter = async (config) => {
        calls.push(config.url!)
        return reply(
          config,
          config.url === '/auth/refresh' ? tokens() : await profile,
        )
      }
      setup(<BootstrapFlow />)
      await screen.findByText('Comprobando acceso administrativo…')
      expect(mounted).not.toHaveBeenCalled()
      await act(async () => resolveProfile({ ...admin, role }))
      await screen.findByText(
        role === 'admin' ? 'AdminLayout' : 'Acceso denegado',
      )
      expect(useAuthStore.getState().user?.role).toBe(role)
      if (role === 'admin') expect(mounted).toHaveBeenCalled()
      else expect(mounted).not.toHaveBeenCalled()
      expect(calls).toEqual(['/auth/refresh', '/users/me'])
    },
  )
  it('sesión en memoria stale tampoco admite contenido mientras el perfil está pendiente', async () => {
    useAuthStore.getState().setSession('stored-access', admin)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    api.defaults.adapter = async (config) => {
      await gate
      return reply(config, { ...admin, role: 'cliente' })
    }
    setup(<BootstrapFlow />)
    await screen.findByText('Comprobando acceso administrativo…')
    expect(mounted).not.toHaveBeenCalled()
    await act(async () => release())
    await screen.findByText('Acceso denegado')
    expect(mounted).not.toHaveBeenCalled()
  })
  it.each(['network', 'timeout', 'server'] as const)(
    'fallo %s conserva sesión y permite retry explícito sin conceder acceso',
    async (kind) => {
      useAuthStore.getState().setSession('stored-access', admin)
      setRefreshToken('stored-refresh')
      let calls = 0
      api.defaults.adapter = async (config) => {
        calls++
        if (calls === 1)
          throw new AxiosError(
            'temporary',
            kind === 'timeout' ? 'ECONNABORTED' : 'ERR_NETWORK',
            config,
            undefined,
            kind === 'server'
              ? { status: 503, statusText: '', headers: {}, config, data: {} }
              : undefined,
          )
        return reply(config, admin)
      }
      setup()
      await screen.findByText('No se pudo comprobar el acceso administrativo')
      expect(mounted).not.toHaveBeenCalled()
      expect(useAuthStore.getState().user?.role).toBe('admin')
      expect(getRefreshToken()).toBe('stored-refresh')
      expect(calls).toBe(1)
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      await screen.findByText('AdminLayout')
      expect(calls).toBe(2)
    },
  )
  it('perfil tardío no modifica ni autoriza una sesión nueva aunque reutilice token e identidad', async () => {
    useAuthStore.getState().setSession('same-access', admin)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    api.defaults.adapter = async (config) => {
      await gate
      return reply(config, admin)
    }
    const check = confirmCurrentUser()
    useAuthStore.getState().clearSession()
    useAuthStore.getState().setSession('same-access', admin)
    await act(async () => release())
    await check
    expect(useAuthStore.getState().roleStatus).toBe('unverified')
  })
  it('401 durante comprobación refresca una vez y confirma perfil con el token nuevo', async () => {
    useAuthStore.getState().setSession('expired', admin)
    setRefreshToken('stored-refresh')
    const calls: string[] = []
    api.defaults.adapter = async (config) => {
      calls.push(config.url!)
      if (config.url === '/auth/refresh') return reply(config, tokens())
      if (config.headers.Authorization !== 'Bearer qa-access')
        throw new AxiosError('expired', undefined, config, undefined, {
          status: 401,
          statusText: '',
          config,
          headers: {},
          data: {},
        })
      return reply(config, admin)
    }
    setup()
    await screen.findByText('AdminLayout')
    expect(calls).toEqual(['/users/me', '/auth/refresh', '/users/me'])
  })
})
