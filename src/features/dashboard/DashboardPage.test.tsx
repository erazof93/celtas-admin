import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type {
  DashboardMetrics,
  DashboardSummary,
  RevenueTrendDay,
  TopProductsResult,
} from './types'

/**
 * Integración: DashboardPage con hooks REALES y api-client mockeado por URL.
 * Recharts no dibuja en jsdom (ResponsiveContainer mide 0px), así que los
 * datos de las gráficas se verifican por la vista de tabla.
 */

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('@/lib/api-client', () => ({
  get: getMock,
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

import DashboardPage from './DashboardPage'

const metrics: DashboardMetrics = {
  today: { orders: 15, revenue: 450.5, ordersApp: 8, ordersPhone: 7 },
  week: { orders: 60, revenue: 2100, ordersApp: 40, ordersPhone: 20 },
  month: { orders: 210, revenue: 12500, ordersApp: 150, ordersPhone: 60, newCustomers: 23 },
}

const trend: RevenueTrendDay[] = [
  { date: '2026-09-24', revenue: 0, ordersApp: 0, ordersPhone: 0 },
  { date: '2026-09-25', revenue: 35, ordersApp: 1, ordersPhone: 0 },
  { date: '2026-09-26', revenue: 0, ordersApp: 0, ordersPhone: 0 },
  { date: '2026-09-27', revenue: 0, ordersApp: 0, ordersPhone: 0 },
  { date: '2026-09-28', revenue: 50, ordersApp: 1, ordersPhone: 2 },
  { date: '2026-09-29', revenue: 0, ordersApp: 0, ordersPhone: 0 },
  { date: '2026-09-30', revenue: 450.5, ordersApp: 8, ordersPhone: 7 },
]

const summary: DashboardSummary = {
  ordersCount: 15,
  ordersByStatus: [
    { status: 'entregado', count: 10 },
    { status: 'pendiente', count: 5 },
  ],
  revenue: 450.5,
}

// Orden del backend: por CANTIDAD vendida (no por ingresos).
const topProducts: TopProductsResult = {
  limit: 10,
  items: [
    { menuItemId: 'p1', name: 'Celtas Clásica', quantity: 12, revenue: 180 },
    { menuItemId: 'p2', name: 'Celtas Doble', quantity: 8, revenue: 200 },
    { menuItemId: null, name: 'Alitas (descontinuado)', quantity: 4, revenue: 20 },
  ],
}

function mockApi(overrides: Partial<Record<string, () => Promise<unknown>>> = {}) {
  const routes: Record<string, () => Promise<unknown>> = {
    '/admin/dashboard/metrics': () => Promise.resolve(metrics),
    '/admin/dashboard/revenue-trend': () => Promise.resolve(trend),
    '/admin/dashboard/summary': () => Promise.resolve(summary),
    '/admin/dashboard/top-products': () => Promise.resolve(topProducts),
    ...overrides,
  }
  getMock.mockImplementation((url: string) => {
    const route = routes[url]
    return route ? route() : Promise.reject(new Error(`URL no mockeada: ${url}`))
  })
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>,
  )
}

function kpiCard(label: string): HTMLElement {
  // KPICard: el título está en el header; la tarjeta es el ancestro data-slot="card".
  return screen.getByText(label).closest('[data-slot="card"]') as HTMLElement
}

beforeEach(() => {
  getMock.mockReset()
})

describe('DashboardPage — métricas', () => {
  it('carga las métricas al montar y muestra los KPIs de hoy', async () => {
    mockApi()
    renderPage()

    expect(await screen.findByText('Ingresos hoy')).toBeInTheDocument()
    expect(within(kpiCard('Ingresos hoy')).getByText(/450\.50/)).toBeInTheDocument()
    expect(within(kpiCard('Pedidos hoy')).getByText('15')).toBeInTheDocument()
    expect(within(kpiCard('Clientes nuevos (mes)')).getByText('23')).toBeInTheDocument()
    expect(within(kpiCard('Ingresos del mes')).getByText(/12,500\.00/)).toBeInTheDocument()
    expect(getMock).toHaveBeenCalledWith('/admin/dashboard/metrics')
  })

  it('los pedidos se separan en app vs teléfono', async () => {
    mockApi()
    renderPage()

    await screen.findByText('Pedidos hoy')
    const card = kpiCard('Pedidos hoy')
    const app = within(card).getByText('App:').parentElement as HTMLElement
    const phone = within(card).getByText('Teléfono:').parentElement as HTMLElement
    expect(app).toHaveTextContent('App:8')
    expect(phone).toHaveTextContent('Teléfono:7')
  })

  it('el filtro de período cambia los KPIs sin volver a pedir datos', async () => {
    const user = userEvent.setup()
    mockApi()
    renderPage()
    await screen.findByText('Ingresos hoy')

    await user.click(screen.getByRole('button', { name: 'Semana' }))

    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(kpiCard('Ingresos esta semana')).getByText(/2,100\.00/)).toBeInTheDocument()
    const card = kpiCard('Pedidos esta semana')
    expect(within(card).getByText('60')).toBeInTheDocument()
    expect(within(card).getByText('App:').parentElement).toHaveTextContent('App:40')
    expect(within(card).getByText('Teléfono:').parentElement).toHaveTextContent('Teléfono:20')

    const metricsCalls = getMock.mock.calls.filter(([url]) => url === '/admin/dashboard/metrics')
    expect(metricsCalls).toHaveLength(1)
  })

  it('error en métricas: muestra el error y permite reintentar', async () => {
    const user = userEvent.setup()
    mockApi({ '/admin/dashboard/metrics': () => Promise.reject(new Error('boom')) })
    renderPage()

    expect(await screen.findByText('No se pudieron cargar las métricas')).toBeInTheDocument()

    mockApi()
    await user.click(screen.getAllByRole('button', { name: /Reintentar/i })[0])
    expect(await screen.findByText('Ingresos hoy')).toBeInTheDocument()
  })
})

describe('DashboardPage — tendencia de 7 días', () => {
  it('pide 7 días y la vista de tabla muestra ingresos y pedidos por canal', async () => {
    const user = userEvent.setup()
    mockApi()
    renderPage()

    const card = (await screen.findByText('Últimos 7 días')).closest('[data-slot="card"]') as HTMLElement
    expect(getMock).toHaveBeenCalledWith('/admin/dashboard/revenue-trend', { params: { days: 7 } })
    // La vista gráfica tiene los dos gráficos y la leyenda de canales.
    expect(await within(card).findByText('Ingresos por día')).toBeInTheDocument()
    expect(within(card).getByText('Pedidos por día')).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'Ver tabla' }))

    const rows = within(card).getAllByRole('row')
    expect(rows).toHaveLength(8) // encabezado + 7 días
    expect(rows[7]).toHaveTextContent('30/09/2026')
    expect(rows[7]).toHaveTextContent('450.50')
    expect(within(rows[7]).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '30/09/2026',
      expect.stringContaining('450.50'),
      '8',
      '7',
    ])
  })

  it('sin movimiento en los 7 días: mensaje en vez de gráficos vacíos', async () => {
    mockApi({
      '/admin/dashboard/revenue-trend': () =>
        Promise.resolve(trend.map((d) => ({ ...d, revenue: 0, ordersApp: 0, ordersPhone: 0 }))),
    })
    renderPage()

    expect(
      await screen.findByText('Sin pedidos ni ventas en los últimos 7 días.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Ingresos por día')).not.toBeInTheDocument()
    const trendCard = screen.getByText('Últimos 7 días').closest('[data-slot="card"]') as HTMLElement
    expect(within(trendCard).queryByRole('button', { name: 'Ver tabla' })).not.toBeInTheDocument()
  })

  it('error en la tendencia: ErrorState propio con reintentar, sin tumbar las métricas', async () => {
    const user = userEvent.setup()
    mockApi({ '/admin/dashboard/revenue-trend': () => Promise.reject(new Error('boom')) })
    renderPage()

    expect(await screen.findByText('No se pudo cargar la tendencia')).toBeInTheDocument()
    // Las métricas son una query independiente: siguen visibles.
    expect(await screen.findByText('Ingresos hoy')).toBeInTheDocument()
    expect(screen.queryByText('Sin pedidos ni ventas en los últimos 7 días.')).not.toBeInTheDocument()

    mockApi()
    const card = screen
      .getByText('No se pudo cargar la tendencia')
      .closest('[data-slot="card"]') as HTMLElement
    await user.click(within(card).getByRole('button', { name: /Reintentar/i }))
    expect(await within(card).findByText('Ingresos por día')).toBeInTheDocument()
  })

  it('mientras carga muestra loading (métricas y tendencia), no el estado vacío', () => {
    getMock.mockImplementation(() => new Promise(() => {}))
    renderPage()

    expect(screen.getByText('Cargando métricas…')).toBeInTheDocument()
    expect(screen.getByText('Cargando tendencia…')).toBeInTheDocument()
    expect(screen.queryByText('Sin pedidos ni ventas en los últimos 7 días.')).not.toBeInTheDocument()
  })
})

describe('DashboardPage — productos más vendidos (vacío)', () => {
  it('sin productos entregados: mensaje vacío y sin botón "Ver tabla"', async () => {
    mockApi({
      '/admin/dashboard/top-products': () => Promise.resolve({ limit: 10, items: [] }),
    })
    renderPage()

    const card = (await screen.findByText('Productos más vendidos')).closest(
      '[data-slot="card"]',
    ) as HTMLElement
    expect(
      await within(card).findByText('Aún no hay ventas en este rango (pedidos entregados).'),
    ).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Ver tabla' })).not.toBeInTheDocument()
  })
})

describe('DashboardPage — productos más vendidos', () => {
  it('la tabla respeta el orden del backend (por cantidad) y muestra ingresos y % del top', async () => {
    const user = userEvent.setup()
    mockApi()
    renderPage()

    const card = (await screen.findByText('Productos más vendidos')).closest(
      '[data-slot="card"]',
    ) as HTMLElement
    await user.click(await within(card).findByRole('button', { name: 'Ver tabla' }))

    const rows = within(card).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      'Celtas Clásica',
      'Celtas Doble',
      'Alitas (descontinuado)',
    ])
    // 180 + 200 + 20 = 400 → 45.0% / 50.0% / 5.0%
    expect(rows[0]).toHaveTextContent('45.0%')
    expect(rows[1]).toHaveTextContent('200.00')
    expect(rows[1]).toHaveTextContent('50.0%')
    expect(rows[2]).toHaveTextContent('5.0%')
  })
})
