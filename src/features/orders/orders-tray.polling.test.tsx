import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { MemoryRouter, Link, Routes, Route } from 'react-router-dom'
import api from '@/lib/api-client'
import { useAuthStore } from '@/features/auth/store'
import type { AuthUser } from '@/features/auth/types'
import type { Order } from './types'
import OrdersPage from './OrdersPage'
import { useCreateAdminOrder } from './hooks'

// Counts are per query contract, not per shared endpoint. Both views remain mounted.
vi.mock('./OrderDetailDialog', () => ({ OrderDetailDialog: () => null }))
const originalAdapter = api.defaults.adapter
let client: QueryClient
let calls: InternalAxiosRequestConfig[]
let currentId: string
let forbidden: boolean
const admin = { id: 'qa', role: 'admin' } as AuthUser
function fixture(): Order {
  return {
    id: currentId,
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
    createdAt: '2026-10-09T12:00:00Z',
    updatedAt: '2026-10-09T12:00:00Z',
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  calls = []
  currentId = 'aaaaaaaa-0000-4000-8000-000000000001'
  forbidden = false
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  focusManager.setFocused(true)
  onlineManager.setOnline(true)
  useAuthStore.getState().setSession('local-test-only', admin, true)
  api.defaults.adapter = async (config) => {
    calls.push(config)
    if (config.url === '/orders' && forbidden)
      throw new AxiosError('Forbidden', undefined, config, undefined, {
        status: 403,
        data: {},
        config,
        headers: {},
        statusText: 'Forbidden',
      })
    const data =
      config.url === '/users/me'
        ? admin
        : config.url === '/orders/admin'
          ? fixture()
          : {
              items: [fixture()],
              meta: {
                page: config.params.page,
                limit: config.params.limit,
                total: 1,
                totalPages: 1,
              },
            }
    return {
      data: { success: true, data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  }
})
afterEach(() => {
  cleanup()
  client.clear()
  api.defaults.adapter = originalAdapter
  useAuthStore.getState().clearSession()
  focusManager.setFocused(undefined)
  vi.useRealTimers()
})
const tableReads = () =>
  calls.filter(
    (request) => request.url === '/orders' && request.params.limit === 10,
  )
const trayReads = () =>
  calls.filter(
    (request) =>
      request.url === '/orders' &&
      request.params.limit === 100 &&
      request.params.status === 'pendiente',
  )
async function tick(ms = 10) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
function Manual() {
  const create = useCreateAdminOrder()
  return (
    <>
      <button onClick={() => create.mutate({} as never)}>
        Guardar fixture
      </button>
      <Link to="/orders">Volver</Link>
    </>
  )
}
function mount() {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/orders']}>
        <Routes>
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/create-manual" element={<Manual />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
it('polls each independent view once per interval and updates both without reloading', async () => {
  mount()
  await tick()
  expect(tableReads()).toHaveLength(1)
  expect(trayReads()).toHaveLength(1)
  expect(within(screen.getByRole('table')).getByText('#AAAAAAAA')).toBeVisible()
  currentId = 'bbbbbbbb-0000-4000-8000-000000000002'
  await tick(30_000)
  expect(tableReads()).toHaveLength(2)
  expect(trayReads()).toHaveLength(2)
  expect(within(screen.getByRole('table')).getByText('#BBBBBBBB')).toBeVisible()
  expect(
    screen.getByRole('article', { name: 'Pedido #BBBBBBBB' }),
  ).toBeVisible()
})
it('unmount stops both pollers; returning after manual creation reads each view exactly once', async () => {
  mount()
  await tick()
  fireEvent.click(screen.getByRole('link', { name: 'Crear pedido manual' }))
  await tick(120_000)
  expect(tableReads()).toHaveLength(1)
  expect(trayReads()).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Guardar fixture' }))
  await tick()
  expect(tableReads()).toHaveLength(1)
  expect(trayReads()).toHaveLength(1)
  currentId = 'bbbbbbbb-0000-4000-8000-000000000002'
  fireEvent.click(screen.getByRole('link', { name: 'Volver' }))
  await tick()
  expect(tableReads()).toHaveLength(2)
  expect(trayReads()).toHaveLength(2)
  expect(within(screen.getByRole('table')).getByText('#BBBBBBBB')).toBeVisible()
})
it('persistent 403 shares role reconciliation and stops both pollers', async () => {
  forbidden = true
  mount()
  await tick()
  expect(tableReads()).toHaveLength(1)
  expect(trayReads()).toHaveLength(1)
  expect(calls.filter((request) => request.url === '/users/me')).toHaveLength(1)
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  await tick(300_000)
  expect(tableReads()).toHaveLength(1)
  expect(trayReads()).toHaveLength(1)
})
