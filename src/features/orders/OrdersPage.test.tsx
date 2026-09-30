import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import OrdersPage from './OrdersPage'
import type { Order } from './types'

/**
 * Regresión del bloqueante de "pedido manual del admin": un pedido anónimo
 * (POST /orders/admin sin customerId) llega con `userId` y `user` en null.
 * Antes la columna "Cliente" hacía `order.userId.slice(...)` y un solo pedido
 * anónimo tiraba TypeError y dejaba toda la lista de Pedidos en blanco.
 * También fija que la columna de un pedido con cliente registrado NO cambió
 * (8 chars del userId en mayúsculas, mono).
 */

const { useOrdersMock } = vi.hoisted(() => ({ useOrdersMock: vi.fn() }))

vi.mock('./hooks', () => ({ useOrders: useOrdersMock }))
vi.mock('./OrderDetailDialog', () => ({ OrderDetailDialog: () => null }))

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    userId: 'abcdef12-3456-4789-8abc-def012345678',
    customerName: null,
    customerPhone: null,
    status: 'pendiente',
    addressSnapshot: '{"fullAddress":"Av. Lima 123"}',
    total: 37,
    deliveryFee: 0,
    whatsappUrl: 'https://wa.me/51999999999?text=hola',
    deliveredAt: null,
    cancelReason: null,
    items: [],
    user: {
      id: 'abcdef12-3456-4789-8abc-def012345678',
      fullName: 'Ana Torres',
      email: 'ana@test.com',
      phone: null,
    },
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-08T10:00:00.000Z',
    ...overrides,
  }
}

function mockOrders(items: Order[]) {
  useOrdersMock.mockReturnValue({
    data: {
      items,
      meta: { page: 1, limit: 10, total: items.length, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })
}

function rowOf(orderId: string) {
  const row = screen
    .getByText(`#${orderId.slice(0, 8).toUpperCase()}`)
    .closest('tr')
  if (!row) throw new Error('fila no encontrada')
  return within(row)
}

describe('OrdersPage — columna Cliente', () => {
  it('lista mixta: el pedido anónimo muestra nombre + "Sin cuenta" y el registrado su ID corto, sin crashear', () => {
    const registered = makeOrder()
    const anon = makeOrder({
      id: 'bbbbbbbb-0000-4000-8000-000000000002',
      userId: null,
      user: null,
      customerName: 'Rosa Quispe',
      customerPhone: '51987654321',
    })
    mockOrders([registered, anon])

    render(<OrdersPage />)

    const regRow = rowOf(registered.id)
    const regCell = regRow.getByText('ABCDEF12')
    expect(regCell.tagName).toBe('TD')
    expect(regCell).toHaveClass('font-mono', 'text-xs')
    expect(regRow.queryByText('Sin cuenta')).not.toBeInTheDocument()

    const anonRow = rowOf(anon.id)
    expect(anonRow.getByText('Rosa Quispe')).toBeInTheDocument()
    expect(anonRow.getByText('Sin cuenta')).toBeInTheDocument()
  })

  it('anónimo sin customerName: muestra "—" en vez de crashear', () => {
    mockOrders([makeOrder({ userId: null, user: null, customerName: null })])

    render(<OrdersPage />)

    const row = rowOf('aaaaaaaa')
    expect(row.getByText('—')).toBeInTheDocument()
    expect(row.getByText('Sin cuenta')).toBeInTheDocument()
  })
})
