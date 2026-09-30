import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Order, WhatsappLinks } from '../types'

/**
 * Integración (QA): hooks REALES + api-client mockeado. Verifica que al pulsar
 * "Ya lo envié" la sección pase a "Enviado el <Lima>" y oculte el botón SIN
 * cerrar/abrir el diálogo (setQueryData de los links con la fecha del backend),
 * y que el POST viaje sin body.
 */

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock('@/lib/api-client', () => ({
  get: getMock,
  post: postMock,
  patch: vi.fn(),
  del: vi.fn(),
}))

import { OrderWhatsappSection } from './OrderWhatsappSection'

const links: WhatsappLinks = {
  orderId: 'order-1',
  customer: { phone: '51987654321', url: 'https://wa.me/51987654321?text=CONFIRMA' },
  store: { phone: '51999888777', url: 'https://wa.me/51999888777?text=NUEVO' },
  whatsappSentAt: null,
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    userId: 'user-1',
    customerName: null,
    customerPhone: null,
    status: 'pendiente',
    addressSnapshot: '{"fullAddress":"Av. Lima 123"}',
    total: 37,
    deliveryFee: 0,
    whatsappUrl: 'https://wa.me/51999999999?text=hola',
    whatsappSentAt: null,
    deliveredAt: null,
    cancelReason: null,
    items: [],
    user: null,
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-08T10:00:00.000Z',
    ...overrides,
  }
}

function renderSection(order: Order) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <OrderWhatsappSection order={order} open />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
})

describe('OrderWhatsappSection (integración con hooks reales)', () => {
  it('"Ya lo envié" → POST sin body y la sección muestra "Enviado el <Lima>" sin recargar', async () => {
    const user = userEvent.setup()
    getMock.mockResolvedValue(links)
    postMock.mockResolvedValue({ orderId: 'order-1', whatsappSentAt: '2026-09-30T22:15:00.000Z' })
    renderSection(makeOrder())

    await user.click(await screen.findByRole('button', { name: 'Ya lo envié' }))

    expect(postMock).toHaveBeenCalledWith('/orders/admin/order-1/whatsapp-sent')
    // 22:15 UTC = 17:15 en Lima.
    expect(await screen.findByText(/Enviado el 30\/09\/2026 17:15/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ya lo envié' })).not.toBeInTheDocument()
    expect(screen.queryByText('Aún no enviado')).not.toBeInTheDocument()
    // Solo un GET: la fecha viene de la respuesta del POST, no de un refetch.
    expect(getMock).toHaveBeenCalledTimes(1)
  })

  it('usa la fecha que devuelve el backend (idempotente: la primera), no la hora local', async () => {
    const user = userEvent.setup()
    getMock.mockResolvedValue(links)
    postMock.mockResolvedValue({ orderId: 'order-1', whatsappSentAt: '2026-01-02T05:00:00.000Z' })
    renderSection(makeOrder())

    await user.click(await screen.findByRole('button', { name: 'Ya lo envié' }))
    // 05:00 UTC del 2 de enero = 00:00 del 2 de enero en Lima.
    expect(await screen.findByText(/Enviado el 02\/01\/2026 00:00/)).toBeInTheDocument()
  })

  it('GET con error → fallback al link original del pedido', async () => {
    getMock.mockRejectedValue(new Error('500'))
    const order = makeOrder()
    renderSection(order)

    expect(await screen.findByRole('link', { name: 'Abrir en WhatsApp' })).toHaveAttribute(
      'href',
      order.whatsappUrl,
    )
  })

  it('pedido cancelado → no hace el GET y no renderiza nada', () => {
    const { container } = renderSection(makeOrder({ status: 'cancelado' }))
    expect(getMock).not.toHaveBeenCalled()
    expect(container).toBeEmptyDOMElement()
  })
})
