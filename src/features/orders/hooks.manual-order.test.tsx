import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { CreateOrderAdminInput } from './manual-order'

/**
 * Contrato de los hooks del pedido manual:
 * - useCreateAdminOrder: POST /orders/admin con el body tal cual (sin campos
 *   agregados) e invalida la lista de pedidos al crear.
 * - useOrder: GET /orders/:id; sin id no dispara ninguna request.
 */

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock('@/lib/api-client', () => ({
  get: getMock,
  post: postMock,
  patch: vi.fn(),
  del: vi.fn(),
}))

import { useCreateAdminOrder, useOrder } from './hooks'

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { Wrapper, invalidateSpy }
}

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
})

describe('useCreateAdminOrder', () => {
  it('POST /orders/admin con el body sin modificar e invalida ["orders","list"]', async () => {
    postMock.mockResolvedValue({ id: 'order-new' })
    const { Wrapper, invalidateSpy } = setup()
    const { result } = renderHook(() => useCreateAdminOrder(), { wrapper: Wrapper })
    const input: CreateOrderAdminInput = {
      customerId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      addressSnapshot: '{"fullAddress":"Av. X 1"}',
      items: [{ menuItemId: '3fa85f64-5717-4562-b3fc-2c963f66afa7', quantity: 1 }],
    }

    const created = await result.current.mutateAsync(input)

    expect(created).toEqual({ id: 'order-new' })
    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body] = postMock.mock.calls[0] as [string, unknown]
    expect(url).toBe('/orders/admin')
    expect(body).toEqual(input)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['orders', 'list'] })
  })
})

describe('useOrder', () => {
  it('GET /orders/:id cuando hay id', async () => {
    getMock.mockResolvedValue({ id: 'order-1' })
    const { Wrapper } = setup()
    const { result } = renderHook(() => useOrder('order-1'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ id: 'order-1' }))
    expect(getMock).toHaveBeenCalledWith('/orders/order-1')
  })

  it('sin id (null) no dispara ninguna request', () => {
    const { Wrapper } = setup()
    const { result } = renderHook(() => useOrder(null), { wrapper: Wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(getMock).not.toHaveBeenCalled()
  })
})
