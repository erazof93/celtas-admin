import { describe, expect, it } from 'vitest'
import {
  addDays,
  averageDaysToConvert,
  conversionDeltaPoints,
  defaultReportFilters,
  formatPeriod,
  previousPeriod,
  rangeError,
  spanInDays,
  todayInLima,
} from './report-utils'
import type { ConversionReport } from './types/reports'

function conversion(
  overrides: Partial<ConversionReport> = {},
): ConversionReport {
  return {
    period: '2026-09-01 al 2026-09-30',
    phoneOrders: 30,
    phoneCustomers: 20,
    convertedToApp: 5,
    conversionRate: '25.0%',
    timeline: [],
    ...overrides,
  }
}

describe('fechas en Lima', () => {
  it('todayInLima no se corre al día siguiente de noche en Lima (UTC ya es mañana)', () => {
    // 30 sep 22:00 en Lima = 1 oct 03:00 UTC. toISOString() daría 2026-10-01.
    const now = new Date('2026-10-01T03:00:00.000Z')
    expect(todayInLima(now)).toBe('2026-09-30')
  })

  it('defaultReportFilters: últimos 30 días incluyendo hoy, en Lima', () => {
    const filters = defaultReportFilters(new Date('2026-10-01T03:00:00.000Z'))
    expect(filters).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      channel: 'all',
      groupBy: 'day',
    })
    expect(spanInDays(filters.startDate, filters.endDate)).toBe(30)
  })

  it('addDays cruza meses y años', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('rangeError (mismas reglas que el DTO del backend)', () => {
  it('acepta un rango válido, incluido un solo día', () => {
    expect(rangeError('2026-09-01', '2026-09-30')).toBeNull()
    expect(rangeError('2026-09-01', '2026-09-01')).toBeNull()
  })

  it('rechaza rango invertido', () => {
    expect(rangeError('2026-09-30', '2026-09-01')).toMatch(/posterior/)
  })

  it('acepta 366 días y rechaza 367', () => {
    expect(rangeError('2025-10-01', '2026-10-01')).toBeNull() // 366 días
    expect(rangeError('2025-09-30', '2026-10-01')).toMatch(/366/)
  })

  it('rechaza fechas vacías (input de fecha borrado)', () => {
    expect(rangeError('', '2026-09-30')).not.toBeNull()
  })
})

describe('previousPeriod', () => {
  it('devuelve el período de igual duración justo antes', () => {
    expect(previousPeriod('2026-09-01', '2026-09-30')).toEqual({
      startDate: '2026-08-02',
      endDate: '2026-08-31',
    })
    expect(previousPeriod('2026-09-15', '2026-09-15')).toEqual({
      startDate: '2026-09-14',
      endDate: '2026-09-14',
    })
  })
})

describe('formatPeriod', () => {
  it('formatea según groupBy sin pasar por la zona horaria', () => {
    expect(formatPeriod('2026-09-28', 'day')).toBe('28/09')
    expect(formatPeriod('2026-09-28', 'week')).toBe('sem 28/09')
    expect(formatPeriod('2026-09-01', 'month')).toBe('sep 2026')
  })
})

describe('conversión', () => {
  it('la tendencia es en puntos porcentuales, no % relativo', () => {
    const previous = conversion({ conversionRate: '20.0%' })
    expect(conversionDeltaPoints(conversion(), previous)).toBe(5)
  })

  it('sin clientes por teléfono en el período anterior no hay tendencia', () => {
    const previous = conversion({ phoneCustomers: 0, conversionRate: '0.0%' })
    expect(conversionDeltaPoints(conversion(), previous)).toBeNull()
    expect(conversionDeltaPoints(conversion(), undefined)).toBeNull()
  })

  it('promedio de días hasta convertir', () => {
    const report = conversion({
      timeline: [
        {
          phoneOrderDate: '2026-09-01',
          appOrderDate: '2026-09-04',
          daysDiff: 3,
        },
        {
          phoneOrderDate: '2026-09-02',
          appOrderDate: '2026-09-10',
          daysDiff: 8,
        },
      ],
    })
    expect(averageDaysToConvert(report)).toBe(5.5)
    expect(averageDaysToConvert(conversion())).toBeNull()
  })
})
