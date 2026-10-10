import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { useAuthStore } from '@/features/auth/store'
import type { AuthUser } from '@/features/auth/types'
import type { Order } from './types'

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api-client', () => api)
vi.mock('./OrderDetailDialog', () => ({ OrderDetailDialog: () => null }))
import { PendingOrdersTray } from './PendingOrdersTray'
import OrdersPage from './OrdersPage'
import userEvent from '@testing-library/user-event'
let orders: Order[]
let client: QueryClient
function order(id: string, createdAt: string): Order {
  return {
    id,
    createdAt,
    updatedAt: createdAt,
    status: 'pendiente',
    userId: null,
    user: null,
    customerName: null,
    customerPhone: null,
    addressSnapshot: '{}',
    total: 15,
    deliveryFee: 0,
    whatsappUrl: '',
    whatsappSentAt: null,
    deliveredAt: null,
    cancelReason: null,
    items: [],
  }
}
const a = 'aaaaaaaa-0000-4000-8000-000000000001',
  b = 'bbbbbbbb-0000-4000-8000-000000000002'
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  useAuthStore
    .getState()
    .setSession('test-only', { id: 'admin', role: 'admin' } as AuthUser, true)
  focusManager.setFocused(true)
  onlineManager.setOnline(true)
  orders = [order(a, '2026-10-09T12:00:00Z'), order(b, '2026-10-01T12:00:00Z')]
  api.get.mockReset().mockImplementation(async (_url, config) => {
    const items = config?.params?.status
      ? orders.filter((item) => item.status === config.params.status)
      : orders
    return {
      items,
      meta: {
        page: config?.params?.page ?? 1,
        limit: config?.params?.limit ?? 10,
        total: items.length,
        totalPages: items.length ? 1 : 0,
      },
    }
  })
  api.patch.mockReset().mockImplementation(async (url) => {
    const id = url.split('/')[2]
    orders = orders.map((item) =>
      item.id === id ? { ...item, status: 'confirmado' } : item,
    )
    return orders.find((item) => item.id === id)
  })
})
afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.getState().clearSession()
  focusManager.setFocused(undefined)
  vi.restoreAllMocks()
})
function mount(page = false, onDetail = vi.fn()) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {page ? <OrdersPage /> : <PendingOrdersTray onDetail={onDetail} />}
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
it('shows count and oldest pending first; opens the supplied detail', async () => {
  const detail = vi.fn()
  mount(false, detail)
  await screen.findByText('#BBBBBBBB')
  expect(
    screen.getByLabelText('Cantidad de pedidos por aceptar'),
  ).toHaveTextContent('2')
  const cards = screen.getAllByRole('article')
  expect(cards[0]).toHaveAccessibleName('Pedido #BBBBBBBB')
  fireEvent.click(within(cards[0]).getByRole('button', { name: 'Ver detalle' }))
  expect(detail).toHaveBeenCalledWith(orders[1])
  expect(api.get).toHaveBeenCalledWith(
    '/orders',
    expect.objectContaining({
      params: { page: 1, limit: 100, status: 'pendiente' },
    }),
  )
})
it('renders empty state', async () => {
  orders = []
  mount()
  expect(await screen.findByText('No hay pedidos por aceptar.')).toBeVisible()
  expect(
    screen.getByLabelText('Cantidad de pedidos por aceptar'),
  ).toHaveTextContent('0')
})
it('keeps pending orders visible when the general table is filtered', async () => {
  mount(true)
  await screen.findByRole('article', { name: 'Pedido #BBBBBBBB' })
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
  await user.click(screen.getByRole('option', { name: 'Entregado' }))
  await screen.findByText('No hay pedidos')
  expect(screen.getAllByRole('article')).toHaveLength(2)
  expect(
    screen.getByLabelText('Cantidad de pedidos por aceptar'),
  ).toHaveTextContent('2')
})
it('keeps the complete tray when the general table changes page', async () => {
  const initialRead = api.get.getMockImplementation()!
  api.get.mockImplementation(async (url, config) => {
    if (config?.params?.status === 'pendiente') return initialRead(url, config)
    const page = config?.params?.page ?? 1
    return {
      items: [orders[page === 1 ? 0 : 1]],
      meta: { page, limit: 10, total: 11, totalPages: 2 },
    }
  })
  mount(true)
  await screen.findByRole('article', { name: 'Pedido #BBBBBBBB' })
  fireEvent.click(await screen.findByRole('button', { name: 'Siguiente' }))
  await screen.findByText('Página 2 de 2')
  expect(screen.getAllByRole('article')).toHaveLength(2)
  expect(screen.getByRole('table')).toHaveTextContent('#BBBBBBBB')
})
it('reconciles a competing acceptance after HTTP 400', async () => {
  api.patch.mockImplementation(async () => {
    orders = orders.map((item) => ({ ...item, status: 'confirmado' }))
    throw new AxiosError(
      'Invalid transition',
      undefined,
      undefined,
      undefined,
      { status: 400, data: {} } as never,
    )
  })
  mount()
  const card = await screen.findByRole('article', { name: 'Pedido #BBBBBBBB' })
  fireEvent.click(within(card).getByRole('button', { name: 'Aceptar pedido' }))
  await screen.findByText(/No se pudo aceptar el pedido/)
  expect(await screen.findByText('No hay pedidos por aceptar.')).toBeVisible()
})
it('accepts officially, removes from tray and retains confirmed order in general table', async () => {
  mount(true)
  const card = await screen.findByRole('article', { name: 'Pedido #BBBBBBBB' })
  fireEvent.click(within(card).getByRole('button', { name: 'Aceptar pedido' }))
  await waitFor(() =>
    expect(
      screen.queryByRole('article', { name: 'Pedido #BBBBBBBB' }),
    ).not.toBeInTheDocument(),
  )
  expect(api.patch).toHaveBeenCalledWith(`/orders/${b}/status`, {
    status: 'confirmado',
  })
  expect(screen.getByRole('table')).toHaveTextContent('#BBBBBBBB')
  await waitFor(() =>
    expect(screen.getByRole('table')).toHaveTextContent('Confirmado'),
  )
  expect(
    screen.getByLabelText('Cantidad de pedidos por aceptar'),
  ).toHaveTextContent('1')
  expect(await screen.findByText('Pedido #BBBBBBBB confirmado.')).toBeVisible()
})
it('prevents double submission while acceptance is pending', async () => {
  let resolve!: (value: unknown) => void
  api.patch.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  mount()
  const card = await screen.findByRole('article', { name: 'Pedido #BBBBBBBB' })
  const button = within(card).getByRole('button', { name: 'Aceptar pedido' })
  fireEvent.click(button)
  fireEvent.click(button)
  await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
  await act(async () => resolve({ ...orders[1], status: 'confirmado' }))
})
it.each([400, 401, 403, 503])(
  'retains pending order and reports HTTP %s failure',
  async (status) => {
    api.patch.mockRejectedValue(
      new AxiosError('Request failed', undefined, undefined, undefined, {
        status,
        data: {},
      } as never),
    )
    mount()
    const card = await screen.findByRole('article', {
      name: 'Pedido #BBBBBBBB',
    })
    fireEvent.click(
      within(card).getByRole('button', { name: 'Aceptar pedido' }),
    )
    expect(
      await screen.findByText(/No se pudo aceptar el pedido/),
    ).toBeVisible()
    expect(
      screen.getByRole('article', { name: 'Pedido #BBBBBBBB' }),
    ).toBeVisible()
  },
)
it('shows load errors without claiming there are zero pending orders', async () => {
  api.get.mockRejectedValue(new Error('offline'))
  mount()
  expect(
    await screen.findByText('No se pudo actualizar la bandeja'),
  ).toBeVisible()
  expect(
    screen.queryByText('No hay pedidos por aceptar.'),
  ).not.toBeInTheDocument()
})
