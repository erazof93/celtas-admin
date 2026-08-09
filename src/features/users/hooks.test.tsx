import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * Regresión del bug de clase "id en el body de un PATCH": useUpdateUserRole
 * debe enviar el `id` SOLO en el path de PATCH /users/:id/role — el body es
 * exactamente UpdateUserRoleDto ({ role }) y el ValidationPipe del backend
 * (whitelist + forbidNonWhitelisted) rechaza cualquier campo extra con 400.
 * El test FALLA si se revierte el fix (body = input completo con id).
 */

const { patchMock } = vi.hoisted(() => ({ patchMock: vi.fn() }))

vi.mock('@/lib/api-client', () => ({
  patch: patchMock,
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
}))

import { useUpdateUserRole } from './hooks'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('useUpdateUserRole', () => {
  beforeEach(() => {
    patchMock.mockReset()
  })

  it('envía el id SOLO en el path, nunca en el body del PATCH', async () => {
    patchMock.mockResolvedValue({ id: 'user-1', role: 'admin' })
    const { result } = renderHook(() => useUpdateUserRole(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({ id: 'user-1', role: 'admin' })

    expect(patchMock).toHaveBeenCalledTimes(1)
    const [url, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(url).toBe('/users/user-1/role')
    expect(body).not.toHaveProperty('id')
    expect(body).toEqual({ role: 'admin' })
  })

  it('el body conserva el rol aunque el id esté en el input', async () => {
    patchMock.mockResolvedValue({ id: 'user-2', role: 'cliente' })
    const { result } = renderHook(() => useUpdateUserRole(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({ id: 'user-2', role: 'cliente' })

    const [, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(body).toEqual({ role: 'cliente' })
    expect(Object.keys(body)).not.toContain('id')
  })
})