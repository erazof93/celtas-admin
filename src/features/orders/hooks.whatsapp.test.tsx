import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * Contrato de los endpoints de WhatsApp (backend-celtas @ 6a47dce):
 * GET /orders/admin/:orderId/whatsapp-links y POST .../whatsapp-sent (sin body).
 */

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock('@/lib/api-client', () => ({
  get: getMock,
  post: postMock,
  patch: vi.fn(),
  del: vi.fn(),
}))

import { useMarkWhatsappSent, useOrderWhatsappLinks } from './hooks'

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
})

describe('useOrderWhatsappLinks', () => {
  it('GET /orders/admin/:orderId/whatsapp-links', async () => {
    getMock.mockResolvedValue({ orderId: 'o-1', customer: null, store: { phone: '51', url: 'u' }, whatsappSentAt: null })
    const { wrapper } = setup()
    const { result } = renderHook(() => useOrderWhatsappLinks('o-1', true), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getMock).toHaveBeenCalledWith('/orders/admin/o-1/whatsapp-links')
  })

  it('deshabilitado (ej. pedido cancelado) no consulta', () => {
    const { wrapper } = setup()
    renderHook(() => useOrderWhatsappLinks('o-1', false), { wrapper })
    expect(getMock).not.toHaveBeenCalled()
  })

  it('no reintenta un error (404/409 son deterministas)', async () => {
    getMock.mockRejectedValue(new Error('409'))
    // QueryClient con el default (retry: 3): el hook debe forzar retry: false.
    const queryClient = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useOrderWhatsappLinks('o-1', true), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(getMock).toHaveBeenCalledTimes(1)
  })
})

describe('useMarkWhatsappSent', () => {
  it('POST .../whatsapp-sent sin body, actualiza los links en caché con la fecha del backend e invalida la lista', async () => {
    postMock.mockResolvedValue({ orderId: 'o-1', whatsappSentAt: '2026-09-30T22:15:00.000Z' })
    const { queryClient, wrapper } = setup()
    queryClient.setQueryData(['orders', 'whatsapp-links', 'o-1'], {
      orderId: 'o-1',
      customer: null,
      store: { phone: '51', url: 'u' },
      whatsappSentAt: null,
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useMarkWhatsappSent(), { wrapper })
    await result.current.mutateAsync('o-1')

    expect(postMock).toHaveBeenCalledWith('/orders/admin/o-1/whatsapp-sent')
    expect(queryClient.getQueryData(['orders', 'whatsapp-links', 'o-1'])).toMatchObject({
      whatsappSentAt: '2026-09-30T22:15:00.000Z',
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['orders', 'list'] })
  })
})
