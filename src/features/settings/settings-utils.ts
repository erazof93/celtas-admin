/**
 * Utilidades del módulo settings — espejo del contrato real del backend.
 * La clave del número de WhatsApp es `whatsapp_business_number` (constante
 * exportada por settings.service.ts del backend) y el valor se guarda en
 * formato internacional SIN el signo + (ej. 51999999999).
 */

import type { WeeklySchedule } from './types'

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

/**
 * Claves de `business_hours_schedule` (JSON de `WeeklySchedule`, claves "0" a
 * "6") y de los dos settings del interruptor manual — constantes exactas de
 * `settings.service.ts` del backend (`BUSINESS_HOURS_SCHEDULE_KEY`,
 * `BUSINESS_MANUAL_CLOSED_KEY`, `BUSINESS_MANUAL_CLOSED_REASON_KEY`).
 */
export const BUSINESS_HOURS_SCHEDULE_KEY = 'business_hours_schedule'
export const BUSINESS_MANUAL_CLOSED_KEY = 'business_manual_closed'
export const BUSINESS_MANUAL_CLOSED_REASON_KEY = 'business_manual_closed_reason'

export const BUSINESS_HOURS_SCHEDULE_DESCRIPTION =
  'Horario de atención por día de la semana (JSON), 0=domingo...6=sábado, hora local de Lima'
export const BUSINESS_MANUAL_CLOSED_DESCRIPTION =
  'Interruptor manual: "true" cierra el local ahora mismo sin importar el horario programado'
export const BUSINESS_MANUAL_CLOSED_REASON_DESCRIPTION =
  'Motivo opcional mostrado al cliente cuando business_manual_closed es "true"'

/**
 * Default de UX si la key todavía no existe en una base recién sembrada, el
 * value viene vacío, o el JSON es inválido — 7 días abiertos 11:00-23:00.
 * (El seed real del backend tiene horas distintas por día viernes/sábado;
 * este default es solo un fallback defensivo del formulario, nunca lanza.)
 */
const DEFAULT_SCHEDULE: WeeklySchedule = {
  '0': { closed: false, open: '11:00', close: '23:00' },
  '1': { closed: false, open: '11:00', close: '23:00' },
  '2': { closed: false, open: '11:00', close: '23:00' },
  '3': { closed: false, open: '11:00', close: '23:00' },
  '4': { closed: false, open: '11:00', close: '23:00' },
  '5': { closed: false, open: '11:00', close: '23:00' },
  '6': { closed: false, open: '11:00', close: '23:00' },
}

/**
 * Parsea `business_hours_schedule`. Nunca lanza: value ausente/vacío o JSON
 * inválido caen al default de 7 días abiertos 11:00-23:00.
 */
export function parseSchedule(value: string | undefined): WeeklySchedule {
  if (!value) return DEFAULT_SCHEDULE
  try {
    const parsed = JSON.parse(value) as WeeklySchedule
    if (!parsed || typeof parsed !== 'object') return DEFAULT_SCHEDULE
    return parsed
  } catch {
    return DEFAULT_SCHEDULE
  }
}

export function serializeSchedule(schedule: WeeklySchedule): string {
  return JSON.stringify(schedule)
}

/**
 * `UpdateSettingDto.value` tiene `@IsNotEmpty()` en el backend (gap conocido
 * y documentado por el propio audit: un PATCH con `value: ""` devuelve 400,
 * para CUALQUIER key, no solo el motivo de cierre). No vale la pena
 * flexibilizar el DTO solo por este caso — se resuelve del lado del form.
 * Este default se usa siempre que el motivo quede vacío al guardar, sin
 * importar si el switch de cierre manual está activo o no: el seed inicial
 * del backend siembra `business_manual_closed_reason` como `""`, así que un
 * primer guardado del formulario sin tocar el motivo mandaría un string
 * vacío y el backend lo rechazaría con 400 si no aplicáramos este default.
 */
export const DEFAULT_MANUAL_CLOSED_REASON = 'Cerrado temporalmente'

/** Motivo listo para enviar al backend: nunca vacío (ver `DEFAULT_MANUAL_CLOSED_REASON`). */
export function resolveManualClosedReason(reason: string): string {
  const trimmed = reason.trim()
  return trimmed || DEFAULT_MANUAL_CLOSED_REASON
}