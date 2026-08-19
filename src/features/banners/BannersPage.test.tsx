import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import BannersPage from './BannersPage'
import type { Banner } from './types'

/**
 * Regresión de bug visual en la columna "Fechas" del listado: el rango de
 * fechas (o "Sin fechas") y los días de la semana (daysOfWeek) se
 * concatenaban sin separador ("Sin fechasMar, Jue"), como si un concepto
 * contradijera al otro. Deben quedar en líneas/elementos distintos dentro de
 * la misma celda.
 */

const { useBannersMock } = vi.hoisted(() => ({ useBannersMock: vi.fn() }))

vi.mock('./hooks', () => ({
  useBanners: useBannersMock,
  useDeleteBanner: () => ({ mutate: vi.fn() }),
  useReorderBanners: () => ({ mutate: vi.fn() }),
}))

vi.mock('./BannerForm', () => ({ BannerForm: () => null }))

function makeBanner(overrides: Partial<Banner> = {}): Banner {
  return {
    id: '1',
    title: 'Test banner',
    imageUrl: null,
    actionType: 'none',
    actionValue: null,
    startDate: null,
    endDate: null,
    active: true,
    daysOfWeek: null,
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function mockBanners(banners: Banner[]) {
  useBannersMock.mockReturnValue({
    data: banners,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })
}

describe('BannersPage — columna Fechas', () => {
  it('banner sin fechas + con días: "Sin fechas" y los días quedan en elementos separados, no concatenados', () => {
    mockBanners([
      makeBanner({ startDate: null, endDate: null, daysOfWeek: [2, 4] }),
    ])
    render(<BannersPage />)

    const dateLine = screen.getByText('Sin fechas')
    const daysLine = screen.getByText('Mar, Jue')

    // Deben ser nodos distintos (no un único texto "Sin fechasMar, Jue").
    expect(dateLine).not.toBe(daysLine)
    // Ambos hermanos dentro del mismo contenedor de la celda, apilados en
    // columna (no en línea) — el contenedor flex-col es lo que garantiza
    // que se lean en líneas separadas.
    const cellWrapper = dateLine.parentElement
    expect(cellWrapper).toBe(daysLine.parentElement)
    expect(cellWrapper?.className).toContain('flex-col')
  })

  it('banner con startDate y endDate reales: ambas fechas visibles, sin "…" de por medio', () => {
    mockBanners([
      makeBanner({
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-14T23:59:59.000Z',
      }),
    ])
    render(<BannersPage />)

    const dateLine = screen.getByText('31/07/2026 → 14/08/2026')
    expect(dateLine.textContent).not.toContain('…')
  })

  it('banner sin fechas y sin daysOfWeek: solo "Sin fechas", sin segunda línea', () => {
    mockBanners([
      makeBanner({ startDate: null, endDate: null, daysOfWeek: null }),
    ])
    render(<BannersPage />)

    const dateLine = screen.getByText('Sin fechas')
    const cellWrapper = dateLine.parentElement
    expect(cellWrapper?.children).toHaveLength(1)
  })
})
