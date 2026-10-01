import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatCalendarDate,
  formatPercent,
  formatTrendDay,
  revenueShare,
} from './dashboard-utils'
import type { TopProduct } from './types'

describe('formatTrendDay', () => {
  // Zona del navegador del admin (UTC-5) fijada en el test: en una máquina en
  // UTC un parse en hora local daría el día correcto y el test no lo detectaría.
  beforeEach(() => {
    vi.stubEnv('TZ', 'America/Lima')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('formatea el día calendario del backend sin correrlo por zona horaria', () => {
    // 2026-09-28 es lunes. Si se parseara como medianoche local en UTC-5
    // (new Date('2026-09-28')), daría "dom 27".
    expect(formatTrendDay('2026-09-28')).toBe('lun 28')
    expect(formatTrendDay('2026-10-04')).toBe('dom 4')
  })
})

describe('formatCalendarDate', () => {
  it('YYYY-MM-DD → DD/MM/YYYY', () => {
    expect(formatCalendarDate('2026-09-28')).toBe('28/09/2026')
  })
})

function product(name: string, revenue: number): TopProduct {
  return { menuItemId: name, name, quantity: 1, revenue }
}

describe('revenueShare', () => {
  it('participación sobre los ingresos de la lista', () => {
    expect(revenueShare([product('a', 75), product('b', 25)])).toEqual([0.75, 0.25])
  })

  it('lista sin ingresos → 0 (sin dividir por cero)', () => {
    expect(revenueShare([product('a', 0)])).toEqual([0])
    expect(revenueShare([])).toEqual([])
  })
})

describe('formatPercent', () => {
  it('un decimal', () => {
    expect(formatPercent(0.4567)).toBe('45.7%')
    expect(formatPercent(0)).toBe('0.0%')
  })
})
