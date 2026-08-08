import { describe, expect, it } from 'vitest'
import { mergeOrderAfterUpdate } from './merge'
import type { Order, OrderItem } from './types'

/**
 * Test de regresión del bug real del módulo 5: el PATCH /orders/:id/status
 * devuelve el pedido SIN la relación `items` (el backend guarda sin
 * relaciones). Si el detalle abierto se reemplazara con esa respuesta,
 * `order.items.map(...)` crashearía con "Cannot read properties of undefined".
 *
 * La regla del proyecto (ver skill react-celtas): la lógica de
 * transformación/merge de datos de la API que ya mordió una vez con un bug
 * real NO puede quedar sin test.
 *
 * Nota de verificación: `updated` trae `items: undefined` a propósito. El tipo
 * `Order` exige `items`, pero el backend no lo envía en el PATCH, así que en
 * runtime la clave existe con valor `undefined`. Un merge ingenuo
 * `{ ...current, ...updated }` pisaría `current.items` con `undefined` y el
 * diálogo crashearía — este test FALLA si se revierte el fix (verificado por
 * @tester).
 */

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'item-1',
    orderId: 'order-1',
    menuItemId: 'menu-item-1',
    name: 'Celtas Burger',
    unitPrice: 18.5,
    quantity: 2,
    subtotal: 37,
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-08T10:00:00.000Z',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    userId: 'user-1',
    status: 'pendiente',
    addressSnapshot:
      '{"fullAddress":"Av. Lima 123","district":"San Juan de Miraflores"}',
    total: 37,
    whatsappUrl: 'https://wa.me/51999999999?text=hola',
    deliveredAt: null,
    items: [makeItem()],
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-08T10:00:00.000Z',
    ...overrides,
  }
}

describe('mergeOrderAfterUpdate', () => {
  it('conserva los items del detalle cuando el PATCH responde sin la relación items', () => {
    const current = makeOrder()
    // Respuesta real del backend: cambia status/updatedAt, pero NO incluye
    // la relación items (se guardó sin relaciones) → en runtime items es
    // undefined aunque el tipo lo declare como requerido.
    const updated: Partial<Order> = {
      status: 'confirmado',
      updatedAt: '2026-08-08T10:05:00.000Z',
      items: undefined,
    }

    const merged = mergeOrderAfterUpdate(current, updated)

    // Los items NO desaparecen ni quedan undefined → el diálogo no crashea.
    expect(merged.items).toHaveLength(1)
    expect(merged.items[0].name).toBe('Celtas Burger')
    // El estado y la fecha sí se actualizan con la respuesta del PATCH.
    expect(merged.status).toBe('confirmado')
    expect(merged.updatedAt).toBe('2026-08-08T10:05:00.000Z')
  })

  it('propaga deliveredAt cuando el pedido pasa a entregado', () => {
    const current = makeOrder({ status: 'en_camino' })
    const updated: Partial<Order> = {
      status: 'entregado',
      deliveredAt: '2026-08-08T11:00:00.000Z',
      items: undefined,
    }

    const merged = mergeOrderAfterUpdate(current, updated)

    expect(merged.status).toBe('entregado')
    expect(merged.deliveredAt).toBe('2026-08-08T11:00:00.000Z')
    expect(merged.items).toHaveLength(1)
  })

  it('no muta el pedido original (el estado del detalle abierto no cambia por el merge)', () => {
    const current = makeOrder()
    const merged = mergeOrderAfterUpdate(current, { status: 'cancelado' })

    expect(current.status).toBe('pendiente')
    expect(merged).not.toBe(current)
  })
})
