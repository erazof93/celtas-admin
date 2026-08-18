import { describe, expect, it } from 'vitest'
import {
  BUSINESS_HOURS_SCHEDULE_KEY,
  BUSINESS_MANUAL_CLOSED_KEY,
  BUSINESS_MANUAL_CLOSED_REASON_KEY,
  DEFAULT_MANUAL_CLOSED_REASON,
  isValidWhatsappNumber,
  normalizeWhatsappNumber,
  parseSchedule,
  resolveManualClosedReason,
  serializeSchedule,
  WHATSAPP_NUMBER_KEY,
} from './settings-utils'
import type { WeeklySchedule } from './types'

/**
 * Lógica pura del módulo Settings (regla de la skill react-celtas: se extrae
 * a función pura y se testea). El número de WhatsApp se guarda en formato
 * internacional sin + — la normalización y validación viven acá.
 */

describe('normalizeWhatsappNumber', () => {
  it('quita el signo +', () => {
    expect(normalizeWhatsappNumber('+51999999999')).toBe('51999999999')
  })

  it('quita espacios, guiones y paréntesis', () => {
    expect(normalizeWhatsappNumber('+51 999 999 999')).toBe('51999999999')
    expect(normalizeWhatsappNumber('(51) 999-999-999')).toBe('51999999999')
  })

  it('devuelve string vacío si no hay dígitos', () => {
    expect(normalizeWhatsappNumber('abc')).toBe('')
  })
})

describe('isValidWhatsappNumber', () => {
  it('acepta un número peruano típico (11 dígitos)', () => {
    expect(isValidWhatsappNumber('51999999999')).toBe(true)
  })

  it('acepta con +, espacios y guiones (se normaliza)', () => {
    expect(isValidWhatsappNumber('+51 999-999-999')).toBe(true)
  })

  it('rechaza menos de 10 dígitos', () => {
    expect(isValidWhatsappNumber('999')).toBe(false)
  })

  it('rechaza más de 15 dígitos', () => {
    expect(isValidWhatsappNumber('1234567890123456')).toBe(false)
  })

  it('rechaza texto sin dígitos', () => {
    expect(isValidWhatsappNumber('no es un número')).toBe(false)
  })
})

describe('WHATSAPP_NUMBER_KEY', () => {
  it('es la clave exacta que usa el backend (settings.service.ts)', () => {
    expect(WHATSAPP_NUMBER_KEY).toBe('whatsapp_business_number')
  })
})

describe('business hours keys', () => {
  it('son las claves exactas que usa el backend (settings.service.ts)', () => {
    expect(BUSINESS_HOURS_SCHEDULE_KEY).toBe('business_hours_schedule')
    expect(BUSINESS_MANUAL_CLOSED_KEY).toBe('business_manual_closed')
    expect(BUSINESS_MANUAL_CLOSED_REASON_KEY).toBe(
      'business_manual_closed_reason',
    )
  })
})

describe('parseSchedule / serializeSchedule', () => {
  const schedule: WeeklySchedule = {
    '0': { closed: true, open: '', close: '' },
    '1': { closed: false, open: '11:00', close: '23:00' },
    '2': { closed: false, open: '11:00', close: '23:00' },
    '3': { closed: false, open: '11:00', close: '23:00' },
    '4': { closed: false, open: '11:00', close: '23:00' },
    '5': { closed: false, open: '11:00', close: '01:00' },
    '6': { closed: false, open: '11:00', close: '01:00' },
  }

  it('round-trip: serializar y volver a parsear da el mismo horario', () => {
    expect(parseSchedule(serializeSchedule(schedule))).toEqual(schedule)
  })

  it('conserva un cruce de medianoche válido (close < open) sin alterarlo', () => {
    const result = parseSchedule(serializeSchedule(schedule))
    expect(result['5']).toEqual({ closed: false, open: '11:00', close: '01:00' })
  })

  it('JSON malformado cae al default de 7 días', () => {
    const result = parseSchedule('{not valid json')
    expect(Object.keys(result)).toHaveLength(7)
    expect(result['0']).toEqual({ closed: false, open: '11:00', close: '23:00' })
  })

  it('value undefined cae al default', () => {
    const result = parseSchedule(undefined)
    expect(Object.keys(result)).toHaveLength(7)
  })

  it('value vacío cae al default', () => {
    const result = parseSchedule('')
    expect(Object.keys(result)).toHaveLength(7)
  })
})

describe('resolveManualClosedReason', () => {
  it('devuelve el motivo tal cual si no está vacío', () => {
    expect(resolveManualClosedReason('Mantenimiento de cocina')).toBe(
      'Mantenimiento de cocina',
    )
  })

  it('devuelve el default no vacío si el motivo está vacío (evita el 400 de @IsNotEmpty)', () => {
    expect(resolveManualClosedReason('')).toBe(DEFAULT_MANUAL_CLOSED_REASON)
  })

  it('devuelve el default no vacío si el motivo es solo espacios', () => {
    expect(resolveManualClosedReason('   ')).toBe(DEFAULT_MANUAL_CLOSED_REASON)
  })
})