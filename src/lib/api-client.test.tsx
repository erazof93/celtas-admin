import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import api from './api-client'
import {
  useAuthStore,
  setRefreshToken,
  getRefreshToken,
} from '@/features/auth/store'
import type { AuthUser } from '@/features/auth/types'
import ProtectedRoute from '@/routes/ProtectedRoute'

const admin = { id: 'qa', role: 'admin', email: 'qa@test.local' } as AuthUser
const reply = (config: InternalAxiosRequestConfig, data: unknown) => ({
  status: 200,
  statusText: 'OK',
  config,
  headers: {},
  data: { success: true, data },
})
const fail = (config: InternalAxiosRequestConfig, status: number) =>
  Promise.reject(
    new AxiosError('HTTP error', 'ERR_BAD_REQUEST', config, null, {
      status,
      statusText: 'Error',
      config,
      headers: {},
      data: { message: 'Forbidden' },
    }),
  )

beforeEach(() => {
  useAuthStore.getState().clearSession()
  useAuthStore.getState().setSession('test-access', admin)
  setRefreshToken('test-refresh')
})

describe('HTTP authorization reconciliation', () => {
  it('ordinary 403 confirms Admin without logout, refresh or replay', async () => {
    const calls: string[] = []
    api.defaults.adapter = async (config) => {
      calls.push(config.url!)
      return config.url === '/users/me'
        ? reply(config, admin)
        : fail(config, 403)
    }
    await expect(api.get('/settings')).rejects.toMatchObject({
      response: { status: 403 },
    })
    expect(calls).toEqual(['/settings', '/users/me'])
    expect(useAuthStore.getState().user?.role).toBe('admin')
    expect(getRefreshToken()).toBe('test-refresh')
  })

  it('degraded role removes privileged rendering via the existing route guard', async () => {
    api.defaults.adapter = async (config) =>
      config.url === '/users/me'
        ? reply(config, { ...admin, role: 'cliente' })
        : fail(config, 403)
    render(
      <MemoryRouter>
        <ProtectedRoute>
          <p>Privileged content</p>
        </ProtectedRoute>
      </MemoryRouter>,
    )
    expect(screen.getByText('Privileged content')).toBeInTheDocument()
    await expect(api.get('/settings')).rejects.toMatchObject({
      response: { status: 403 },
    })
    await waitFor(() =>
      expect(screen.getByText('Acceso denegado')).toBeInTheDocument(),
    )
    expect(screen.queryByText('Privileged content')).not.toBeInTheDocument()
    expect(useAuthStore.getState().user?.role).toBe('cliente')
  })

  it('concurrent 403s share one profile check', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const profile = vi.fn()
    api.defaults.adapter = async (config) => {
      if (config.url !== '/users/me') return fail(config, 403)
      profile()
      await gate
      return reply(config, { ...admin, role: 'cliente' })
    }
    const requests = Promise.allSettled([
      api.get('/settings'),
      api.get('/delivery/zones'),
    ])
    await waitFor(() => expect(profile).toHaveBeenCalledTimes(1))
    release()
    expect(
      (await requests).every((result) => result.status === 'rejected'),
    ).toBe(true)
    expect(profile).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().user?.role).toBe('cliente')
  })

  it('failed profile/403 does not recurse or falsely remove the session', async () => {
    const calls: string[] = []
    api.defaults.adapter = async (config) => {
      calls.push(config.url!)
      return fail(config, 403)
    }
    await expect(api.get('/settings')).rejects.toBeInstanceOf(AxiosError)
    expect(calls).toEqual(['/settings', '/users/me'])
    expect(useAuthStore.getState().user?.role).toBe('admin')
  })

  it('late profile cannot overwrite a new session', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const profile = vi.fn()
    api.defaults.adapter = async (config) => {
      if (config.url !== '/users/me') return fail(config, 403)
      profile()
      await gate
      return reply(config, { ...admin, role: 'cliente' })
    }
    const request = api.get('/settings').catch(() => undefined)
    await waitFor(() => expect(profile).toHaveBeenCalled())
    useAuthStore.getState().setSession('new-access', { ...admin, id: 'other' })
    release()
    await request
    expect(useAuthStore.getState().user?.id).toBe('other')
    expect(useAuthStore.getState().accessToken).toBe('new-access')
  })

  it('401 retains one refresh and retries with the new access token', async () => {
    const calls: string[] = []
    api.defaults.adapter = async (config) => {
      calls.push(config.url!)
      if (config.url === '/auth/refresh')
        return reply(config, {
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          user: admin,
        })
      return config.headers.Authorization === 'Bearer new-access'
        ? reply(config, [])
        : fail(config, 401)
    }
    await expect(api.get('/settings')).resolves.toMatchObject({ data: [] })
    expect(calls).toEqual(['/settings', '/auth/refresh', '/settings'])
    expect(getRefreshToken()).toBe('new-refresh')
  })

  it('concurrent 401s refresh once and queued retries cannot start another refresh', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
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
      return fail(config, 401)
    }
    const requests = Promise.allSettled([
      api.get('/settings'),
      api.get('/delivery/zones'),
    ])
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    release()
    const results = await requests
    expect(results.every((result) => result.status === 'rejected')).toBe(true)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
