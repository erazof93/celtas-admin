import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import OrdersPage from './OrdersPage'
import type { Order } from './types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/features/auth/store'

/**
 * Regresión del bloqueante de "pedido manual del admin": un pedido anónimo
 * (POST /orders/admin sin customerId) llega con `userId` y `user` en null.
 * Antes la columna "Cliente" hacía `order.userId.slice(...)` y un solo pedido
 * anónimo tiraba TypeError y dejaba toda la lista de Pedidos en blanco.
 * También fija que la columna de un pedido con cliente registrado NO cambió
 * (8 chars del userId en mayúsculas, mono).
 */

const { useOrdersMock, useOrderMock } = vi.hoisted(() => ({
  useOrdersMock: vi.fn(),
  useOrderMock: vi.fn(),
}))
const activation = vi.hoisted(() => ({ enabled: false }))
vi.mock('./events/service', () => ({
  orderEventsEnabled: () => activation.enabled,
}))
afterEach(() => {
  activation.enabled = false
})

vi.mock('./hooks', () => ({ useOrders: useOrdersMock, useOrder: useOrderMock }))
vi.mock('./PendingOrdersTray', () => ({
  PendingOrdersTray: () => <section>Pedidos por aceptar</section>,
}))
vi.mock('./OrderDetailDialog', () => ({
  OrderDetailDialog: ({
    order,
    open,
  }: {
    order: Order | null
    open: boolean
  }) =>
    open && order ? (
      <div data-testid="order-detail">
        {order.id}
        <span data-testid="detail-status">{order.status}</span>
      </div>
    ) : null,
}))
vi.mock('./components/DeliveryCalculator', () => ({
  DeliveryCalculator: ({ allowManualPin }: { allowManualPin?: boolean }) => (
    <div data-testid="calculator-manual-pin">{String(allowManualPin)}</div>
  ),
}))

function renderPage(url = '/orders', client = new QueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <OrdersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

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
    whatsappSentAt: null,
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
  useOrderMock.mockReturnValue({ data: undefined, isError: false, error: null })
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

it('cotizador permite ubicación manual sin depender del geocoding', async () => {
  mockOrders([])
  const user = userEvent.setup()
  renderPage()
  await user.click(screen.getByRole('button', { name: 'Cotizar delivery' }))
  expect(await screen.findByTestId('calculator-manual-pin')).toHaveTextContent(
    'true',
  )
})

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

    renderPage()

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

    renderPage()

    const row = rowOf('aaaaaaaa')
    expect(row.getByText('—')).toBeInTheDocument()
    expect(row.getByText('Sin cuenta')).toBeInTheDocument()
  })
})

describe('OrdersPage — pedido manual', () => {
  it('muestra el botón "Crear pedido manual" que lleva a /orders/create-manual', () => {
    mockOrders([])
    renderPage()
    expect(
      screen.getByRole('link', { name: /Crear pedido manual/ }),
    ).toHaveAttribute('href', '/orders/create-manual')
  })

  it('/orders?order=<id> pide ese pedido con useOrder y abre su detalle', () => {
    mockOrders([])
    const created = makeOrder({ id: 'cccccccc-0000-4000-8000-000000000003' })
    useOrderMock.mockReturnValue({ data: created, isError: false, error: null })

    renderPage(`/orders?order=${created.id}`)

    expect(useOrderMock).toHaveBeenCalledWith(created.id)
    expect(screen.getByTestId('order-detail')).toHaveTextContent(created.id)
  })

  it('sin ?order no abre ningún detalle', () => {
    mockOrders([])
    renderPage()
    expect(useOrderMock).toHaveBeenLastCalledWith(null)
    expect(screen.queryByTestId('order-detail')).not.toBeInTheDocument()
  })

  it('?order=<id> que falla muestra "No se pudo abrir el pedido"', () => {
    mockOrders([])
    useOrderMock.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error('x'),
    })
    renderPage('/orders?order=no-existe')
    expect(screen.getByText('No se pudo abrir el pedido')).toBeInTheDocument()
  })
})

describe('OrdersPage — detalle reconciliado', () => {
  it('keeps selection while replacing the detail with REST data and hides it on session change', async () => {
    activation.enabled = true
    const original = makeOrder()
    const recovered = makeOrder({
      status: 'confirmado',
      updatedAt: '2026-10-08T12:00:00Z',
    })
    mockOrders([original])
    useOrderMock.mockImplementation((id) => ({
      data: id ? recovered : undefined,
    }))
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))
    expect(screen.getByTestId('order-detail')).toHaveTextContent(original.id)
    expect(screen.getByTestId('detail-status')).toHaveTextContent('confirmado')
    act(() =>
      useAuthStore.setState({
        sessionId: useAuthStore.getState().sessionId + 1,
      }),
    )
    expect(screen.queryByTestId('order-detail')).not.toBeInTheDocument()
  })

  it('does not replace the selected order during a pending mutation', async () => {
    activation.enabled = true
    const original = makeOrder()
    mockOrders([original])
    useOrderMock.mockImplementation((id) => ({
      data: id
        ? makeOrder({ status: 'confirmado', updatedAt: '2026-10-08T12:00:00Z' })
        : undefined,
    }))
    const client = new QueryClient()
    let finish!: () => void
    const mutation = client.getMutationCache().build(client, {
      mutationKey: ['orders', 'status'],
      mutationFn: () =>
        new Promise<void>((done) => {
          finish = done
        }),
    })
    const pending = mutation.execute(undefined)
    renderPage('/orders', client)
    await userEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))
    expect(screen.getByTestId('detail-status')).toHaveTextContent('pendiente')
    await act(async () => {
      finish()
      await pending
    })
    expect(await screen.findByTestId('detail-status')).toHaveTextContent(
      'confirmado',
    )
  })
})
