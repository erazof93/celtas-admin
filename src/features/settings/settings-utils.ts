/**
 * Utilidades del módulo settings — espejo del contrato real del backend.
 * La clave del número de WhatsApp es `whatsapp_business_number` (constante
 * exportada por settings.service.ts del backend) y el valor se guarda en
 * formato internacional SIN el signo + (ej. 51999999999).
 */

export const WHATSAPP_NUMBER_KEY = 'whatsapp_business_number'

export const WHATSAPP_NUMBER_DESCRIPTION =
  'Número de WhatsApp del negocio (formato internacional sin +)'

/**
 * Normaliza a solo dígitos (quita espacios, guiones, +, paréntesis).
 * El backend guarda el número sin el signo + — esto es un guard de UX, el
 * backend solo valida que value sea un string no vacío.
 */
export function normalizeWhatsappNumber(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * Valida que el número sea razonable (10-15 dígitos, formato internacional).
 * Guard de UX del panel: el backend solo exige IsString + IsNotEmpty.
 */
export function isValidWhatsappNumber(raw: string): boolean {
  const digits = normalizeWhatsappNumber(raw)
  return digits.length >= 10 && digits.length <= 15
}