import { describe, expect, it } from 'vitest'
import { digitsOnly, isFarOrder, orderDistanceMeters, orderSubtotal } from './orders-utils'
import type { Order, OrderItem } from './types'

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

function makeOrder(items: OrderItem[], overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    userId: 'user-1',
    status: 'pendiente',
    addressSnapshot: '{}',
    total: 37,
    deliveryFee: 0,
    whatsappUrl: 'https://wa.me/51999999999?text=hola',
    deliveredAt: null,
    items,
    user: { id: 'user-1', fullName: 'Test User', email: 'test@test.com', phone: null },
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-08T10:00:00.000Z',
    ...overrides,
  }
}

describe('orderSubtotal', () => {
  it('suma los subtotales de todos los items', () => {
    const order = makeOrder([
      makeItem({ subtotal: 37 }),
      makeItem({ id: 'item-2', subtotal: 15.5 }),
    ])
    expect(orderSubtotal(order)).toBe(52.5)
  })

  it('devuelve 0 sin items', () => {
    expect(orderSubtotal(makeOrder([]))).toBe(0)
  })
})

describe('digitsOnly', () => {
  it('quita todo lo que no sea dígito', () => {
    expect(digitsOnly('+51 999-999-999')).toBe('51999999999')
  })
})

describe('orderDistanceMeters', () => {
  const store = { latitude: -12.1631, longitude: -76.97 }

  it('calcula la distancia real cuando ambas coordenadas están presentes', () => {
    const meters = orderDistanceMeters(
      { latitude: -12.164, longitude: -76.971 },
      store,
    )
    expect(meters).toBeCloseTo(147.75, 1)
  })

  it('null si la dirección no tiene coordenadas (dato viejo o texto libre)', () => {
    expect(orderDistanceMeters({ latitude: null, longitude: null }, store)).toBeNull()
    expect(orderDistanceMeters({}, store)).toBeNull()
  })

  it('null si la dirección es null (snapshot no parseable)', () => {
    expect(orderDistanceMeters(null, store)).toBeNull()
  })

  it('null si el local todavía no tiene store_location configurado', () => {
    expect(
      orderDistanceMeters({ latitude: -12.164, longitude: -76.971 }, null),
    ).toBeNull()
  })
})

describe('isFarOrder', () => {
  it('true si la distancia supera el radio de aviso', () => {
    expect(isFarOrder(3000, 2500)).toBe(true)
  })

  it('false si la distancia está dentro del radio (igual no cuenta como lejano)', () => {
    expect(isFarOrder(2500, 2500)).toBe(false)
    expect(isFarOrder(2000, 2500)).toBe(false)
  })

  it('false (nunca lejano) si falta la distancia o el radio', () => {
    expect(isFarOrder(null, 2500)).toBe(false)
    expect(isFarOrder(3000, null)).toBe(false)
  })
})
