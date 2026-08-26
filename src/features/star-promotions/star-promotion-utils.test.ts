import { describe, expect, it } from 'vitest'
import {
  formatStarPromotionDate,
  formatStarPromotionDateRange,
  isValidStarPromotionDateRange,
} from './star-promotion-utils'

describe('formatStarPromotionDate', () => {
  it('formatea YYYY-MM-DD como "20 dic 2026"', () => {
    expect(formatStarPromotionDate('2026-12-20')).toBe('20 dic 2026')
  })

  it('no corre el día hacia atrás por conversión de zona horaria', () => {
    // Lima es UTC-5: si se pasara por `new Date(iso)` + formatInTimeZone, el
    // 1 de enero se leería como 31 de diciembre del año anterior. Esta
    // función parsea los componentes directamente, sin ese riesgo.
    expect(formatStarPromotionDate('2026-01-01')).toBe('1 ene 2026')
  })
})

describe('formatStarPromotionDateRange', () => {
  it('formatea el rango completo', () => {
    expect(
      formatStarPromotionDateRange({
        startDate: '2026-12-20',
        endDate: '2026-12-31',
      }),
    ).toBe('20 dic 2026 – 31 dic 2026')
  })
})

describe('isValidStarPromotionDateRange', () => {
  it('acepta startDate anterior a endDate', () => {
    expect(isValidStarPromotionDateRange('2026-12-20', '2026-12-31')).toBe(true)
  })

  it('acepta un solo día de vigencia (startDate === endDate)', () => {
    expect(isValidStarPromotionDateRange('2026-12-20', '2026-12-20')).toBe(true)
  })

  it('rechaza startDate posterior a endDate', () => {
    expect(isValidStarPromotionDateRange('2026-12-31', '2026-12-20')).toBe(false)
  })
})
