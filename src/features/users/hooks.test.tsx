import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * Regresión del bug de clase "id en el body de un PATCH": useUpdateUserRole
 * debe enviar el `id` SOLO en el path de PATCH /users/:id/role — el body es
 * exactamente UpdateUserRoleDto ({ role }) y el ValidationPipe del backend
 * (whitelist + forbidNonWhitelisted) rechaza cualquier campo extra con 400.
 * El test FALLA si se revierte el fix (body = input completo con id).
 */

const { patchMock, getMock, postMock } = vi.hoisted(() => ({
  patchMock: vi.fn(),
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  patch: patchMock,
  get: getMock,
  post: postMock,
  del: vi.fn(),
}))

import { useLinkAnonymousOrders, useUsers, useUpdateUserRole } from './hooks'

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

/**
 * Top Usuarios (GET /users?sortBy=totalSpent&order=desc) depende de que
 * useUsers reenvíe sortBy/order como query params solo cuando se pasan —
 * la vista "Todos" (sin sortBy/order) debe seguir pidiendo exactamente lo
 * mismo que antes de este cambio, sin params extra colándose.
 */
describe('useUsers', () => {
  beforeEach(() => {
    getMock.mockReset()
    getMock.mockResolvedValue({
      items: [],
      meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
    })
  })

  it('sin sortBy/order: solo envía page y limit (comportamiento previo intacto)', async () => {
    renderHook(() => useUsers(1, 10), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1))
    expect(getMock).toHaveBeenCalledWith('/users', {
      params: { page: 1, limit: 10 },
    })
  })

  it('con sortBy=totalSpent y order=desc: los reenvía como query params', async () => {
    const { result } = renderHook(
      () => useUsers(1, 10, 'totalSpent', 'desc'),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1))
    expect(getMock).toHaveBeenCalledWith('/users', {
      params: { page: 1, limit: 10, sortBy: 'totalSpent', order: 'desc' },
    })
    expect(result.current).toBeDefined()
  })
})

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

/**
 * Vincular pedidos anónimos cambia el preview (['users', 'anonymous-orders', id]),
 * el totalSpent del cliente (['users']) y la pestaña Pedidos del cliente
 * (['orders', ...] vía useOrders). El test FALLA si se quita cualquiera de las
 * dos invalidaciones.
 */
describe('useLinkAnonymousOrders', () => {
  beforeEach(() => {
    postMock.mockReset()
  })

  it('UN POST con { orderIds } (userId solo en el path) e invalida users y orders', async () => {
    postMock.mockResolvedValue({
      userId: 'user-1',
      linkedOrderIds: ['o-1'],
      deliveredTotalAdded: 0,
      totalSpent: 0,
    })
    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useLinkAnonymousOrders(), { wrapper })

    await result.current.mutateAsync({ userId: 'user-1', orderIds: ['o-1'] })

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith('/users/user-1/link-anonymous-orders', {
      orderIds: ['o-1'],
    })
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['orders'] })
    })
  })
})