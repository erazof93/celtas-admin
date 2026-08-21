import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OrderDetailDialog } from './OrderDetailDialog'
import type { Order, OrderItem, OrderUser } from './types'

/**
 * Cobertura del tri-state de `selectedSauces` en el detalle de pedido:
 * `null` (no aplica) no debe mostrar nada, `[]` (elegido a propósito) debe
 * mostrar "Sin salsas", y un array con nombres debe listarlos. Antes de este
 * fix, `[]` se colapsaba al mismo caso que `null` y no se mostraba nada —
 * este test falla si ese bug se repite.
 *
 * También cubre lo agregado para delivery por distancia: línea de "Envío" en
 * el desglose (entre subtotal y total), badge de "fuera de zona habitual"
 * (recalculado del lado del cliente, ver orders-utils.ts, porque el backend
 * no expone `distanceMeters` en la respuesta del pedido), mapa de solo
 * lectura de la dirección (mismo patrón que `UserAddressesSection`) y el
 * botón nuevo "Contactar al cliente por WhatsApp" (wa.me al teléfono del
 * cliente, DISTINTO del botón "Abrir en WhatsApp" que ya existía, que usa
 * `order.whatsappUrl` — el mensaje del pedido hacia la tienda).
 */

const { settingsData } = vi.hoisted(() => ({
  settingsData: { current: [] as { key: string; value: string }[] },
}))

vi.mock('./hooks', () => ({
  useUpdateOrderStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('../settings/hooks', () => ({
  useSettings: () => ({
    data: settingsData.current,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
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

function makeUser(overrides: Partial<OrderUser> = {}): OrderUser {
  return {
    id: 'user-1',
    fullName: 'Juan Pérez',
    email: 'juan@test.com',
    phone: null,
    ...overrides,
  }
}

function makeOrder(items: OrderItem[], overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    userId: 'user-1',
    status: 'pendiente',
    addressSnapshot:
      '{"fullAddress":"Av. Lima 123","district":"San Juan de Miraflores"}',
    total: 37,
    deliveryFee: 0,
    whatsappUrl: 'https://wa.me/51999999999?text=hola',
    deliveredAt: null,
    items,
    user: makeUser(),
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-08T10:00:00.000Z',
    ...overrides,
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

beforeEach(() => {
  settingsData.current = []
})

afterEach(() => {
  vi.unstubAllEnvs()
})

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

describe('OrderDetailDialog — desglose con envío', () => {
  it('muestra Subtotal, Envío y Total como líneas separadas', () => {
    const order = makeOrder(
      [makeItem({ subtotal: 37 }), makeItem({ id: 'item-2', subtotal: 15.5 })],
      { deliveryFee: 4, total: 56.5 },
    )
    renderDialog(order)

    expect(screen.getByText('Subtotal')).toBeInTheDocument()
    expect(screen.getByText('S/ 52.50')).toBeInTheDocument()
    expect(screen.getByText('Envío')).toBeInTheDocument()
    expect(screen.getByText('S/ 4.00')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('S/ 56.50')).toBeInTheDocument()
  })

  it('envío en S/ 0.00 se muestra igual (dirección sin coordenadas, deliveryFee=0 real del backend)', () => {
    const order = makeOrder([makeItem()], { deliveryFee: 0 })
    renderDialog(order)

    expect(screen.getByText('Envío')).toBeInTheDocument()
    expect(screen.getByText('S/ 0.00')).toBeInTheDocument()
  })
})

describe('OrderDetailDialog — fila "Cupón" en el desglose', () => {
  it('pedido SIN cupón (total = subtotal + envío): no muestra la fila "Cupón"', () => {
    const order = makeOrder([makeItem({ subtotal: 37 })], {
      total: 41,
      deliveryFee: 4,
    })
    renderDialog(order)

    expect(screen.queryByText('Cupón')).not.toBeInTheDocument()
  })

  it('pedido CON cupón: muestra la fila "Cupón" con el monto en negativo, en el orden Subtotal → Cupón → Envío → Total', () => {
    // subtotal 52.50, envío 4, cupón 10% → descuento 5.25, total 51.25
    const order = makeOrder(
      [makeItem({ subtotal: 37 }), makeItem({ id: 'item-2', subtotal: 15.5 })],
      { total: 51.25, deliveryFee: 4 },
    )
    renderDialog(order)

    const rows = ['Subtotal', 'Cupón', 'Envío', 'Total']
    const positions = rows.map((label) => {
      const el = screen.getByText(label)
      return Array.from(el.parentElement!.parentElement!.children).indexOf(
        el.parentElement!,
      )
    })
    expect(positions).toEqual([0, 1, 2, 3])

    expect(screen.getByText('-S/ 5.25')).toBeInTheDocument()
  })
})

describe('OrderDetailDialog — badge de "fuera de zona habitual"', () => {
  function stubSettings(storeLocation: string, alertRadiusMeters: string) {
    settingsData.current = [
      { key: 'store_location', value: storeLocation },
      { key: 'delivery_alert_radius_meters', value: alertRadiusMeters },
    ]
  }

  it('distancia > radio de aviso: muestra el badge', () => {
    stubSettings('{"latitude":-12.1631,"longitude":-76.97}', '100')
    const order = makeOrder([makeItem()], {
      addressSnapshot: JSON.stringify({
        fullAddress: 'Av. Lima 123',
        latitude: -12.18,
        longitude: -76.99,
      }),
    })
    renderDialog(order)

    expect(screen.getByText('Fuera de zona habitual')).toBeInTheDocument()
  })

  it('distancia dentro del radio de aviso: NO muestra el badge', () => {
    stubSettings('{"latitude":-12.1631,"longitude":-76.97}', '2500')
    const order = makeOrder([makeItem()], {
      addressSnapshot: JSON.stringify({
        fullAddress: 'Av. Lima 123',
        latitude: -12.164,
        longitude: -76.971,
      }),
    })
    renderDialog(order)

    expect(screen.queryByText('Fuera de zona habitual')).not.toBeInTheDocument()
  })

  it('sin store_location configurado (seed sin configurar): NO muestra el badge, nunca inventa un estado lejano', () => {
    stubSettings('', '100')
    const order = makeOrder([makeItem()], {
      addressSnapshot: JSON.stringify({
        fullAddress: 'Av. Lima 123',
        latitude: -12.18,
        longitude: -76.99,
      }),
    })
    renderDialog(order)

    expect(screen.queryByText('Fuera de zona habitual')).not.toBeInTheDocument()
  })

  it('dirección sin coordenadas (dato viejo): NO muestra el badge aunque haya store_location y radio', () => {
    stubSettings('{"latitude":-12.1631,"longitude":-76.97}', '100')
    const order = makeOrder([makeItem()], {
      addressSnapshot: JSON.stringify({ fullAddress: 'Av. Lima 123' }),
    })
    renderDialog(order)

    expect(screen.queryByText('Fuera de zona habitual')).not.toBeInTheDocument()
  })
})

describe('OrderDetailDialog — mapa de la dirección de entrega', () => {
  it('con coordenadas y VITE_GEOAPIFY_API_KEY: renderiza el mapa como link a Google Maps', () => {
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-key')
    const order = makeOrder([makeItem()], {
      addressSnapshot: JSON.stringify({
        fullAddress: 'Av. Lima 123',
        latitude: -12.164,
        longitude: -76.971,
      }),
    })
    renderDialog(order)

    const link = screen.getByRole('link', { name: 'Abrir en Google Maps' })
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=-12.164,-76.971',
    )
    expect(
      screen.getByRole('img', { name: 'Mapa de la dirección de entrega' }),
    ).toBeInTheDocument()
  })

  it('sin coordenadas en la dirección: no renderiza ningún mapa', () => {
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-key')
    const order = makeOrder([makeItem()], {
      addressSnapshot: JSON.stringify({ fullAddress: 'Av. Lima 123' }),
    })
    renderDialog(order)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('sin VITE_GEOAPIFY_API_KEY: no renderiza el mapa aunque haya coordenadas', () => {
    // Stub explícito a vacío: el .env real de desarrollo SÍ tiene la key
    // configurada (Vite la carga también en modo test) — sin este stub, este
    // caso jamás se ejercita de verdad.
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', '')
    const order = makeOrder([makeItem()], {
      addressSnapshot: JSON.stringify({
        fullAddress: 'Av. Lima 123',
        latitude: -12.164,
        longitude: -76.971,
      }),
    })
    renderDialog(order)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('OrderDetailDialog — botón "Contactar al cliente por WhatsApp"', () => {
  it('cliente CON teléfono: muestra el botón con el link wa.me correcto (dígitos limpios)', () => {
    const order = makeOrder([makeItem()], {
      user: makeUser({ phone: '+51 999-999-999' }),
    })
    renderDialog(order)

    const link = screen.getByRole('link', {
      name: 'Contactar al cliente por WhatsApp',
    })
    expect(link).toHaveAttribute('href', 'https://wa.me/51999999999')
  })

  it('cliente SIN teléfono (campo opcional): oculta el botón, no rompe el resto del detalle', () => {
    const order = makeOrder([makeItem()], { user: makeUser({ phone: null }) })
    renderDialog(order)

    expect(
      screen.queryByRole('link', { name: 'Contactar al cliente por WhatsApp' }),
    ).not.toBeInTheDocument()
    // El botón existente (mensaje del PEDIDO) sigue ahí, sin confundirse con el nuevo.
    expect(screen.getByRole('link', { name: 'Abrir en WhatsApp' })).toBeInTheDocument()
  })
})
