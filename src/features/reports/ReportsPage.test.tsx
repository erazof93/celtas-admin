import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type {
  ConversionReport,
  ReportComparison,
  ReportSummaryData,
  TopProduct,
} from './types/reports'

/**
 * Integración: ReportsPage con hooks REALES y api-client mockeado por URL.
 * Se verifica sobre todo QUÉ parámetros llegan al backend (el contrato de
 * /admin/reports/* es estricto: fechas YYYY-MM-DD, comparison con current/
 * previous, channel solo en top-products). Recharts no dibuja en jsdom, así
 * que los datos se verifican por las tablas.
 */

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('@/lib/api-client', () => ({
  get: getMock,
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

import ReportsPage from './ReportsPage'

const summary: ReportSummaryData = {
  period: { start: '2026-09-01', end: '2026-09-30' },
  summary: {
    totalRevenue: 1500.5,
    totalOrders: 40,
    totalCustomers: 22,
    averageTicket: 37.51,
  },
  byChannel: {
    app: { revenue: 1000, orders: 25, customers: 15, averageTicket: 40 },
    phone: { revenue: 500.5, orders: 15, customers: 9, averageTicket: 33.37 },
  },
  data: [
    {
      period: '2026-09-28',
      revenue: 1500.5,
      revenueApp: 1000,
      revenuePhone: 500.5,
      orders: 40,
      ordersApp: 25,
      ordersPhone: 15,
      customers: 22,
      customersApp: 15,
      customersPhone: 9,
      averageTicket: 37.51,
      averageTicketApp: 40,
      averageTicketPhone: 33.37,
    },
  ],
}

const comparison: ReportComparison = {
  current: {
    period: '2026-09-01 al 2026-09-30',
    revenue: 1500.5,
    orders: 40,
    averageTicket: 37.51,
  },
  previous: {
    period: '2026-08-02 al 2026-08-31',
    revenue: 1344.6,
    orders: 40,
    averageTicket: 33.62,
  },
  comparison: {
    revenueChange: '+11.6%',
    ordersChange: '0.0%',
    ticketChange: null,
  },
  byChannel: {
    app: {
      current: { revenue: 1000, change: '+5.0%' },
      previous: { revenue: 952.38 },
    },
    phone: {
      current: { revenue: 500.5, change: null },
      previous: { revenue: 0 },
    },
  },
}

const topProducts: TopProduct[] = [
  {
    id: 'p1',
    name: 'Celtas Clásica',
    quantity: 12,
    revenue: 180,
    revenuePercentage: 45,
    quantityPercentage: 40,
    averagePrice: 15,
    byChannel: {
      app: { quantity: 8, revenue: 120 },
      phone: { quantity: 4, revenue: 60 },
    },
  },
  {
    id: null,
    name: 'Alitas',
    quantity: 4,
    revenue: 20,
    revenuePercentage: 5,
    quantityPercentage: 13.3,
    averagePrice: 5,
    byChannel: {
      app: { quantity: 4, revenue: 20 },
      phone: { quantity: 0, revenue: 0 },
    },
  },
]

const conversionCurrent: ConversionReport = {
  period: '2026-09-01 al 2026-09-30',
  phoneOrders: 30,
  phoneCustomers: 20,
  convertedToApp: 5,
  conversionRate: '25.0%',
  timeline: [],
}
const conversionPrevious: ConversionReport = {
  ...conversionCurrent,
  convertedToApp: 4,
  conversionRate: '20.0%',
}

type Params = Record<string, unknown> | undefined

function mockApi() {
  getMock.mockImplementation((url: string, config?: { params?: Params }) => {
    const params = config?.params
    switch (url) {
      case '/admin/reports/summary':
        return Promise.resolve(summary)
      case '/admin/reports/comparison':
        return Promise.resolve(comparison)
      case '/admin/reports/top-products':
        return Promise.resolve(topProducts)
      case '/admin/reports/conversion':
        return Promise.resolve(
          params?.startDate === '2026-09-01'
            ? conversionCurrent
            : conversionPrevious,
        )
      default:
        return Promise.reject(new Error(`URL no mockeada: ${url}`))
    }
  })
}

function paramsOf(url: string): Params[] {
  return getMock.mock.calls
    .filter(([u]) => u === url)
    .map(([, config]) => (config as { params?: Params } | undefined)?.params)
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportsPage />
    </QueryClientProvider>,
  )
}

function kpiCard(label: string): HTMLElement {
  return screen.getByText(label).closest('[data-slot="card"]') as HTMLElement
}

beforeEach(() => {
  getMock.mockReset()
  // 30 sep 2026, 22:00 en Lima (ya es 1 oct en UTC): el rango debe ser 1-30 sep.
  vi.useFakeTimers({
    now: new Date('2026-10-01T03:00:00.000Z'),
    toFake: ['Date'],
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ReportsPage — carga inicial', () => {
  it('pide los cuatro reportes con los últimos 30 días en Lima', async () => {
    mockApi()
    renderPage()

    expect(await screen.findByText('Ingresos totales')).toBeInTheDocument()
    expect(paramsOf('/admin/reports/summary')).toContainEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      groupBy: 'day',
    })
    expect(paramsOf('/admin/reports/top-products')).toContainEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      channel: 'all',
      limit: 10,
    })
    // comparison NO usa startDate/endDate: current/previous "A:B".
    expect(paramsOf('/admin/reports/comparison')).toContainEqual({
      current: '2026-09-01:2026-09-30',
      previous: '2026-08-02:2026-08-31',
    })
    // conversion del rango + del período anterior (para la tendencia).
    expect(paramsOf('/admin/reports/conversion')).toEqual(
      expect.arrayContaining([
        { startDate: '2026-09-01', endDate: '2026-09-30' },
        { startDate: '2026-08-02', endDate: '2026-08-31' },
      ]),
    )
  })

  it('muestra KPIs con desglose por canal y cambio vs período anterior', async () => {
    mockApi()
    renderPage()
    await screen.findByText('Ingresos totales')

    const revenue = kpiCard('Ingresos totales')
    expect(within(revenue).getByText(/1,500\.50/)).toBeInTheDocument()
    expect(within(revenue).getByText('App:').parentElement).toHaveTextContent(
      /1,000\.00/,
    )
    expect(
      within(revenue).getByText('Teléfono:').parentElement,
    ).toHaveTextContent(/500\.50/)
    expect(
      await within(revenue).findByText('+11.6% vs período anterior'),
    ).toBeInTheDocument()

    // ticketChange null → sin hint, no "null vs período anterior".
    expect(
      within(kpiCard('Ticket promedio')).queryByText(/vs período anterior/),
    ).toBeNull()
  })

  it('muestra la conversión con tendencia en puntos porcentuales', async () => {
    mockApi()
    renderPage()

    expect(await screen.findByText('25.0%')).toBeInTheDocument()
    const card = kpiCard('Conversión teléfono → app')
    expect(card).toHaveTextContent('5 de 20 clientes por teléfono')
    expect(await within(card).findByText(/\+5\.0 pp/)).toBeInTheDocument()
  })

  it('top productos marca los eliminados (id null)', async () => {
    mockApi()
    renderPage()

    const card = await waitFor(() => kpiCard('Productos más vendidos'))
    expect(await within(card).findByText('Celtas Clásica')).toBeInTheDocument()
    expect(within(card).getByText('(eliminado)')).toBeInTheDocument()
  })

  it('si un reporte falla, el resto se sigue mostrando', async () => {
    mockApi()
    const base = getMock.getMockImplementation()!
    getMock.mockImplementation((url: string, config?: unknown) =>
      url === '/admin/reports/top-products'
        ? Promise.reject(new Error('500'))
        : base(url, config),
    )
    renderPage()

    expect(
      await screen.findByText('No se pudieron cargar los productos'),
    ).toBeInTheDocument()
    expect(screen.getByText('Ingresos totales')).toBeInTheDocument()
  })
})

describe('ReportsPage — errores parciales', () => {
  it('si falla comparison se avisa (no desaparece el "vs período anterior" en silencio)', async () => {
    mockApi()
    const base = getMock.getMockImplementation()!
    getMock.mockImplementation((url: string, config?: unknown) =>
      url === '/admin/reports/comparison'
        ? Promise.reject(new Error('500'))
        : base(url, config),
    )
    renderPage()

    expect(
      await screen.findByText(
        /No se pudo cargar la comparación con el período anterior/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Ingresos totales')).toBeInTheDocument()
  })

  it('si falla la conversión del período anterior no dice "sin datos"', async () => {
    mockApi()
    const base = getMock.getMockImplementation()!
    getMock.mockImplementation((url: string, config?: { params?: Params }) =>
      url === '/admin/reports/conversion' &&
      config?.params?.startDate !== '2026-09-01'
        ? Promise.reject(new Error('500'))
        : base(url, config),
    )
    renderPage()

    expect(
      await screen.findByText(
        'No se pudo cargar el período anterior para comparar.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Sin datos del período anterior/)).toBeNull()
  })
})

describe('ReportsPage — filtros', () => {
  it('cambiar la fecha inicial vuelve a pedir con el nuevo rango', async () => {
    mockApi()
    renderPage()
    await screen.findByText('Ingresos totales')

    fireEvent.change(screen.getByLabelText('Desde'), {
      target: { value: '2026-08-01' },
    })

    await waitFor(() =>
      expect(paramsOf('/admin/reports/summary')).toContainEqual({
        startDate: '2026-08-01',
        endDate: '2026-09-30',
        groupBy: 'day',
      }),
    )
  })

  it('cambiar la fecha final actualiza endDate (no startDate)', async () => {
    mockApi()
    renderPage()
    await screen.findByText('Ingresos totales')

    fireEvent.change(screen.getByLabelText('Hasta'), {
      target: { value: '2026-09-15' },
    })

    await waitFor(() =>
      expect(paramsOf('/admin/reports/summary')).toContainEqual({
        startDate: '2026-09-01',
        endDate: '2026-09-15',
        groupBy: 'day',
      }),
    )
  })

  it('un rango invertido muestra error y no llega al backend', async () => {
    mockApi()
    renderPage()
    await screen.findByText('Ingresos totales')
    const callsBefore = getMock.mock.calls.length

    fireEvent.change(screen.getByLabelText('Desde'), {
      target: { value: '2026-10-15' },
    })

    expect(screen.getByRole('alert')).toHaveTextContent(/posterior/)
    expect(getMock.mock.calls.length).toBe(callsBefore)
  })

  it('canal "app" solo se envía a top-products (summary trae ambos canales)', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockApi()
    renderPage()
    await screen.findByText('Ingresos totales')

    await user.click(screen.getByLabelText('Canal (productos y gráfico)'))
    await user.click(await screen.findByRole('option', { name: 'App' }))

    await waitFor(() =>
      expect(
        paramsOf('/admin/reports/top-products').some(
          (p) => p?.channel === 'app',
        ),
      ).toBe(true),
    )
    expect(
      paramsOf('/admin/reports/summary').every(
        (p) => !('channel' in (p ?? {})),
      ),
    ).toBe(true)
  })

  it('agrupar por semana pide summary con groupBy=week', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockApi()
    renderPage()
    await screen.findByText('Ingresos totales')

    await user.click(screen.getByLabelText('Agrupar por'))
    await user.click(await screen.findByRole('option', { name: 'Semana' }))

    await waitFor(() =>
      expect(
        paramsOf('/admin/reports/summary').some((p) => p?.groupBy === 'week'),
      ).toBe(true),
    )
    expect(await screen.findByText('sem 28/09')).toBeInTheDocument()
  })
})
