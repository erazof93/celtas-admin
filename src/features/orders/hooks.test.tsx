import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * Contrato de `useUpdateOrderStatus`:
 * - El `id` viaja SOLO en el path de PATCH /orders/:id/status, nunca en el body
 *   (regla de clase del proyecto; el ValidationPipe del backend rechaza campos
 *   extra con 400).
 * - `cancelReason` es opcional: se incluye en el body solo si viene con texto
 *   (el backend lo exige únicamente en la transición en_camino → cancelado).
 */

const { patchMock } = vi.hoisted(() => ({ patchMock: vi.fn() }))

vi.mock('@/lib/api-client', () => ({
  patch: patchMock,
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
}))

import { useUpdateOrderStatus } from './hooks'

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

describe('useUpdateOrderStatus', () => {
  beforeEach(() => {
    patchMock.mockReset()
  })

  it('envía el id SOLO en el path y solo `status` en el body cuando no hay motivo', async () => {
    patchMock.mockResolvedValue({ id: 'order-1' })
    const { result } = renderHook(() => useUpdateOrderStatus(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({ id: 'order-1', status: 'confirmado' })

    expect(patchMock).toHaveBeenCalledTimes(1)
    const [url, body] = patchMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(url).toBe('/orders/order-1/status')
    expect(body).toEqual({ status: 'confirmado' })
    expect(body).not.toHaveProperty('id')
    expect(body).not.toHaveProperty('cancelReason')
  })

  it('incluye `cancelReason` en el body cuando viene con texto (en_camino → cancelado)', async () => {
    patchMock.mockResolvedValue({ id: 'order-2' })
    const { result } = renderHook(() => useUpdateOrderStatus(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({
      id: 'order-2',
      status: 'cancelado',
      cancelReason: 'El cliente ya no se encuentra en la dirección',
    })

    const [url, body] = patchMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(url).toBe('/orders/order-2/status')
    expect(body).toEqual({
      status: 'cancelado',
      cancelReason: 'El cliente ya no se encuentra en la dirección',
    })
    expect(body).not.toHaveProperty('id')
  })

  it('omite `cancelReason` del body si llega vacío o undefined', async () => {
    patchMock.mockResolvedValue({ id: 'order-3' })
    const { result } = renderHook(() => useUpdateOrderStatus(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({
      id: 'order-3',
      status: 'cancelado',
      cancelReason: '',
    })

    const [, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(body).toEqual({ status: 'cancelado' })
    expect(body).not.toHaveProperty('cancelReason')
  })
})
