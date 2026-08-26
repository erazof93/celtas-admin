import { describe, expect, it } from 'vitest'
import {
  BUSINESS_HOURS_SCHEDULE_KEY,
  BUSINESS_MANUAL_CLOSED_KEY,
  BUSINESS_MANUAL_CLOSED_REASON_KEY,
  DEFAULT_DELIVERY_ALERT_RADIUS_METERS,
  DEFAULT_DELIVERY_FEE_TIERS,
  DEFAULT_MANUAL_CLOSED_REASON,
  DELIVERY_ALERT_RADIUS_METERS_KEY,
  DELIVERY_FEE_TIERS_KEY,
  isValidWhatsappNumber,
  normalizeWhatsappNumber,
  parseDeliveryAlertRadiusMeters,
  parseDeliveryFeeTiers,
  parseSchedule,
  parseSolesPorEstrella,
  parseStoreLocation,
  resolveManualClosedReason,
  serializeDeliveryFeeTiers,
  serializeSchedule,
  serializeStoreLocation,
  STORE_LOCATION_KEY,
  validateDeliveryFeeTiers,
  WHATSAPP_NUMBER_KEY,
} from './settings-utils'
import type { DeliveryFeeTier, WeeklySchedule } from './types'

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

describe('delivery por distancia — claves', () => {
  it('son las claves exactas que usa el backend (settings.service.ts)', () => {
    expect(STORE_LOCATION_KEY).toBe('store_location')
    expect(DELIVERY_FEE_TIERS_KEY).toBe('delivery_fee_tiers')
    expect(DELIVERY_ALERT_RADIUS_METERS_KEY).toBe('delivery_alert_radius_meters')
  })
})

describe('parseStoreLocation / serializeStoreLocation', () => {
  it('round-trip: serializar y volver a parsear da la misma ubicación', () => {
    const location = { latitude: -12.1631, longitude: -76.97 }
    expect(parseStoreLocation(serializeStoreLocation(location))).toEqual(location)
  })

  it('value undefined (nunca configurado) → null, NUNCA inventa coordenadas', () => {
    expect(parseStoreLocation(undefined)).toBeNull()
  })

  it('value vacío (sembrado del backend, sin configurar) → null', () => {
    expect(parseStoreLocation('')).toBeNull()
  })

  it('JSON malformado → null', () => {
    expect(parseStoreLocation('{not valid json')).toBeNull()
  })

  it('JSON válido pero incompleto (falta longitude) → null', () => {
    expect(parseStoreLocation('{"latitude":-12.1631}')).toBeNull()
  })
})

describe('parseDeliveryFeeTiers / serializeDeliveryFeeTiers', () => {
  it('round-trip: serializar y volver a parsear da los mismos tramos', () => {
    const tiers: DeliveryFeeTier[] = [
      { maxMeters: 100, fee: 2 },
      { maxMeters: null, fee: 8 },
    ]
    expect(parseDeliveryFeeTiers(serializeDeliveryFeeTiers(tiers))).toEqual(tiers)
  })

  it('value undefined/vacío cae al default', () => {
    expect(parseDeliveryFeeTiers(undefined)).toEqual(DEFAULT_DELIVERY_FEE_TIERS)
    expect(parseDeliveryFeeTiers('')).toEqual(DEFAULT_DELIVERY_FEE_TIERS)
  })

  it('JSON malformado cae al default', () => {
    expect(parseDeliveryFeeTiers('{not valid json')).toEqual(DEFAULT_DELIVERY_FEE_TIERS)
  })

  it('array vacío cae al default (nunca deja al pedido sin tarifa)', () => {
    expect(parseDeliveryFeeTiers('[]')).toEqual(DEFAULT_DELIVERY_FEE_TIERS)
  })
})

describe('parseDeliveryAlertRadiusMeters', () => {
  it('parsea un valor numérico válido', () => {
    expect(parseDeliveryAlertRadiusMeters('3000')).toBe(3000)
  })

  it('value undefined/no numérico/<=0 cae al default', () => {
    expect(parseDeliveryAlertRadiusMeters(undefined)).toBe(
      DEFAULT_DELIVERY_ALERT_RADIUS_METERS,
    )
    expect(parseDeliveryAlertRadiusMeters('abc')).toBe(
      DEFAULT_DELIVERY_ALERT_RADIUS_METERS,
    )
    expect(parseDeliveryAlertRadiusMeters('0')).toBe(
      DEFAULT_DELIVERY_ALERT_RADIUS_METERS,
    )
    expect(parseDeliveryAlertRadiusMeters('-100')).toBe(
      DEFAULT_DELIVERY_ALERT_RADIUS_METERS,
    )
  })
})

describe('parseSolesPorEstrella', () => {
  it('parsea un valor numérico válido', () => {
    expect(parseSolesPorEstrella('15')).toBe(15)
  })

  it('value undefined/no numérico/<=0 cae al default (10, mismo que el seed real)', () => {
    expect(parseSolesPorEstrella(undefined)).toBe(10)
    expect(parseSolesPorEstrella('abc')).toBe(10)
    expect(parseSolesPorEstrella('0')).toBe(10)
    expect(parseSolesPorEstrella('-5')).toBe(10)
  })
})

describe('validateDeliveryFeeTiers', () => {
  it('acepta la tabla default (ascendente, último sin límite)', () => {
    expect(validateDeliveryFeeTiers(DEFAULT_DELIVERY_FEE_TIERS)).toBeNull()
  })

  it('rechaza un array vacío', () => {
    expect(validateDeliveryFeeTiers([])).toEqual({
      index: -1,
      message: 'Agrega al menos un tramo',
    })
  })

  it('rechaza si el último tramo NO es null (falta la tarifa plana)', () => {
    const result = validateDeliveryFeeTiers([{ maxMeters: 100, fee: 2 }])
    expect(result?.index).toBe(0)
    expect(result?.message).toMatch(/sin límite/)
  })

  it('rechaza si un tramo que no es el último tiene maxMeters null', () => {
    const result = validateDeliveryFeeTiers([
      { maxMeters: null, fee: 2 },
      { maxMeters: null, fee: 8 },
    ])
    expect(result?.index).toBe(0)
    expect(result?.message).toMatch(/Solo el último/)
  })

  it('rechaza tramos NO ascendentes (superposición)', () => {
    const result = validateDeliveryFeeTiers([
      { maxMeters: 400, fee: 4 },
      { maxMeters: 100, fee: 2 },
      { maxMeters: null, fee: 8 },
    ])
    expect(result?.index).toBe(1)
    expect(result?.message).toMatch(/ascendente/)
  })

  it('rechaza tramos con el mismo maxMeters (huecos/superposición, no estrictamente ascendente)', () => {
    const result = validateDeliveryFeeTiers([
      { maxMeters: 100, fee: 2 },
      { maxMeters: 100, fee: 4 },
      { maxMeters: null, fee: 8 },
    ])
    expect(result?.index).toBe(1)
  })

  it('rechaza un maxMeters <= 0 en un tramo intermedio', () => {
    const result = validateDeliveryFeeTiers([
      { maxMeters: 0, fee: 2 },
      { maxMeters: null, fee: 8 },
    ])
    expect(result?.index).toBe(0)
    expect(result?.message).toMatch(/mayor a 0/)
  })

  it('rechaza una tarifa negativa', () => {
    const result = validateDeliveryFeeTiers([{ maxMeters: null, fee: -1 }])
    expect(result?.index).toBe(0)
    expect(result?.message).toMatch(/negativa/)
  })
})