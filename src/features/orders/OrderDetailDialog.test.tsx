import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OrderDetailDialog } from './OrderDetailDialog'
import type { Order, OrderItem } from './types'

/**
 * Cobertura del tri-state de `selectedSauces` en el detalle de pedido:
 * `null` (no aplica) no debe mostrar nada, `[]` (elegido a propósito) debe
 * mostrar "Sin salsas", y un array con nombres debe listarlos. Antes de este
 * fix, `[]` se colapsaba al mismo caso que `null` y no se mostraba nada —
 * este test falla si ese bug se repite.
 */

vi.mock('./hooks', () => ({
  useUpdateOrderStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'item-1',
    orderId: 'order-1',
    menuItemId: 'menu-item-1',
    name: 'Celtas Burger',
    unitPrice: 18.5,
    quantity: 2,
    selectedSauces: null,
    comment: null,
    subtotal: 37,
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-08T10:00:00.000Z',
    ...overrides,
  }
}

function makeOrder(items: OrderItem[]): Order {
  return {
    id: 'order-1',
    userId: 'user-1',
    status: 'pendiente',
    addressSnapshot:
      '{"fullAddress":"Av. Lima 123","district":"San Juan de Miraflores"}',
    total: 37,
    whatsappUrl: 'https://wa.me/51999999999?text=hola',
    deliveredAt: null,
    items,
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-08T10:00:00.000Z',
  }
}

function renderDialog(order: Order) {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <OrderDetailDialog
        order={order}
        open
        onOpenChange={() => {}}
        onOrderUpdated={() => {}}
      />
    </QueryClientProvider>,
  )
}

describe('OrderDetailDialog — tri-state de selectedSauces', () => {
  it('selectedSauces null: no muestra ninguna línea de salsas', () => {
    const order = makeOrder([makeItem({ selectedSauces: null })])
    renderDialog(order)

    expect(screen.queryByText(/salsas/i)).not.toBeInTheDocument()
  })

  it('selectedSauces []: muestra "Sin salsas" (elegido a propósito, no es lo mismo que null)', () => {
    const order = makeOrder([makeItem({ selectedSauces: [] })])
    renderDialog(order)

    expect(screen.getByText('Sin salsas')).toBeInTheDocument()
  })

  it('selectedSauces con nombres: muestra "Salsas: X, Y"', () => {
    const order = makeOrder([
      makeItem({ selectedSauces: ['Mayonesa', 'Ketchup'] }),
    ])
    renderDialog(order)

    expect(screen.getByText('Salsas: Mayonesa, Ketchup')).toBeInTheDocument()
  })
})

describe('OrderDetailDialog — item.comment', () => {
  it('comment null: no muestra ninguna línea de comentario', () => {
    const order = makeOrder([makeItem({ comment: null })])
    renderDialog(order)

    expect(screen.queryByText(/comentario/i)).not.toBeInTheDocument()
  })

  it('comment con texto: muestra "Comentario: <texto>"', () => {
    const order = makeOrder([makeItem({ comment: 'Sin cebolla' })])
    renderDialog(order)

    expect(screen.getByText('Comentario: Sin cebolla')).toBeInTheDocument()
  })
})
