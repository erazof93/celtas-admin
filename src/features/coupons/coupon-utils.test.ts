import { describe, expect, it } from 'vitest'
import {
  formatCouponDiscount,
  getDaysUntilExpiry,
  getEffectiveStatus,
  isExpired,
} from './coupon-utils'

/**
 * Lógica de transformación de datos del módulo Cupones (regla de la skill
 * react-celtas: la lógica de datos no trivial se extrae a función pura y se
 * testea desde el primer día, no cuando ya apareció un bug).
 */

describe('formatCouponDiscount', () => {
  it('formatea porcentajes sin decimales', () => {
    expect(formatCouponDiscount('percentage', 10)).toBe('10%')
    expect(formatCouponDiscount('percentage', 100)).toBe('100%')
  })

  it('formatea montos fijos en soles con 2 decimales', () => {
    expect(formatCouponDiscount('fixed_amount', 15)).toBe('S/ 15.00')
    expect(formatCouponDiscount('fixed_amount', 150.5)).toBe('S/ 150.50')
  })
})

describe('getDaysUntilExpiry', () => {
  const now = new Date('2026-08-08T12:00:00.000Z')

  it('devuelve los días completos restantes (redondeo hacia arriba)', () => {
    const in3Days = new Date('2026-08-11T12:00:00.000Z')
    expect(getDaysUntilExpiry(in3Days, now)).toBe(3)
  })

  it('redondea hacia arriba fracciones de día (12h → 1 día)', () => {
    const in12h = new Date('2026-08-09T00:00:00.000Z')
    expect(getDaysUntilExpiry(in12h, now)).toBe(1)
  })

  it('devuelve 0 si ya expiró (nunca negativo)', () => {
    const expired1hAgo = new Date('2026-08-08T11:00:00.000Z')
    expect(getDaysUntilExpiry(expired1hAgo, now)).toBe(0)
    const expired5DaysAgo = new Date('2026-08-03T12:00:00.000Z')
    expect(getDaysUntilExpiry(expired5DaysAgo, now)).toBe(0)
  })

  it('acepta strings ISO igual que Date', () => {
    expect(getDaysUntilExpiry('2026-08-11T12:00:00.000Z', now)).toBe(3)
  })
})

describe('isExpired', () => {
  const now = new Date('2026-08-08T12:00:00.000Z')

  it('true si la expiración ya pasó', () => {
    expect(isExpired('2026-08-08T11:59:00.000Z', now)).toBe(true)
  })

  it('false si la expiración es en el futuro', () => {
    expect(isExpired('2026-08-08T12:00:01.000Z', now)).toBe(false)
  })
})

describe('getEffectiveStatus', () => {
  const now = new Date('2026-08-08T12:00:00.000Z')
  const past = '2026-08-01T12:00:00.000Z'
  const future = '2026-08-20T12:00:00.000Z'

  it('mantiene active si la expiración es futura', () => {
    expect(getEffectiveStatus('active', future, now)).toBe('active')
  })

  it('marca como expirado un cupón active cuya expiración ya pasó (ventana antes del cron)', () => {
    expect(getEffectiveStatus('active', past, now)).toBe('expired')
  })

  it('no toca los estados used/expired del backend', () => {
    expect(getEffectiveStatus('used', past, now)).toBe('used')
    expect(getEffectiveStatus('expired', future, now)).toBe('expired')
  })
})