import { describe, expect, it } from 'vitest'
import { getBannerVigencia, isValidBannerDateRange } from './banner-utils'
import type { Banner } from './types'

/**
 * Lógica de negocio real del módulo Banners (regla de la skill react-celtas:
 * se extrae a función pura y se testea desde el primer día). La vigencia cruza
 * active + fechas y el formulario valida startDate < endDate en el cliente.
 */

const NOW = new Date('2026-08-08T12:00:00.000Z')

function makeBanner(
  overrides: Partial<Pick<Banner, 'active' | 'startDate' | 'endDate'>> = {},
) {
  return {
    active: true,
    startDate: null,
    endDate: null,
    ...overrides,
  }
}

describe('getBannerVigencia', () => {
  it('vigente: activo sin fechas', () => {
    expect(getBannerVigencia(makeBanner(), NOW)).toBe('vigente')
  })

  it('vigente: activo dentro del rango (start pasado, end futuro)', () => {
    expect(
      getBannerVigencia(
        makeBanner({
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T23:59:59.000Z',
        }),
        NOW,
      ),
    ).toBe('vigente')
  })

  it('programado: activo con startDate en el futuro', () => {
    expect(
      getBannerVigencia(
        makeBanner({ startDate: '2026-08-10T00:00:00.000Z' }),
        NOW,
      ),
    ).toBe('programado')
  })

  it('vencido: activo con endDate en el pasado', () => {
    expect(
      getBannerVigencia(
        makeBanner({ endDate: '2026-08-01T23:59:59.000Z' }),
        NOW,
      ),
    ).toBe('vencido')
  })

  it('inactivo: active=false gana sobre cualquier fecha', () => {
    expect(
      getBannerVigencia(
        makeBanner({ active: false, startDate: '2026-08-01T00:00:00.000Z' }),
        NOW,
      ),
    ).toBe('inactivo')
  })

  it('borde exacto: startDate == ahora es vigente (backend usa <=)', () => {
    expect(
      getBannerVigencia(
        makeBanner({ startDate: NOW.toISOString() }),
        NOW,
      ),
    ).toBe('vigente')
  })

  it('borde exacto: endDate == ahora es vigente (backend usa >=)', () => {
    expect(
      getBannerVigencia(makeBanner({ endDate: NOW.toISOString() }), NOW),
    ).toBe('vigente')
  })
})

describe('isValidBannerDateRange', () => {
  it('válido si falta alguna de las dos fechas (opcionales)', () => {
    expect(isValidBannerDateRange(undefined, undefined)).toBe(true)
    expect(isValidBannerDateRange('2026-08-01T00:00:00.000Z', undefined)).toBe(
      true,
    )
    expect(isValidBannerDateRange(undefined, '2026-08-31T00:00:00.000Z')).toBe(
      true,
    )
  })

  it('válido si startDate es anterior a endDate', () => {
    expect(
      isValidBannerDateRange(
        '2026-08-01T00:00:00.000Z',
        '2026-08-31T00:00:00.000Z',
      ),
    ).toBe(true)
  })

  it('inválido si startDate es posterior a endDate', () => {
    expect(
      isValidBannerDateRange(
        '2026-09-01T00:00:00.000Z',
        '2026-08-31T00:00:00.000Z',
      ),
    ).toBe(false)
  })

  it('inválido si startDate es igual a endDate (backend usa < estricto)', () => {
    expect(
      isValidBannerDateRange(
        '2026-08-31T00:00:00.000Z',
        '2026-08-31T00:00:00.000Z',
      ),
    ).toBe(false)
  })
})