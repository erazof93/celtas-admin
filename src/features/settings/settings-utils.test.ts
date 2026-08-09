import { describe, expect, it } from 'vitest'
import {
  isValidWhatsappNumber,
  normalizeWhatsappNumber,
  WHATSAPP_NUMBER_KEY,
} from './settings-utils'

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