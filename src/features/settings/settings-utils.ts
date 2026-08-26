/**
 * Utilidades del módulo settings — espejo del contrato real del backend.
 * La clave del número de WhatsApp es `whatsapp_business_number` (constante
 * exportada por settings.service.ts del backend) y el valor se guarda en
 * formato internacional SIN el signo + (ej. 51999999999).
 */

import type { DeliveryFeeTier, StoreLocation, WeeklySchedule } from './types'

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

/**
 * Claves de delivery por distancia — constantes exactas de
 * `settings.service.ts` del backend (`STORE_LOCATION_KEY`,
 * `DELIVERY_FEE_TIERS_KEY`, `DELIVERY_ALERT_RADIUS_METERS_KEY`).
 */
export const STORE_LOCATION_KEY = 'store_location'
export const DELIVERY_FEE_TIERS_KEY = 'delivery_fee_tiers'
export const DELIVERY_ALERT_RADIUS_METERS_KEY = 'delivery_alert_radius_meters'

export const STORE_LOCATION_DESCRIPTION =
  'Ubicación del local (JSON {"latitude":number,"longitude":number}) — sin configurar por defecto, necesaria para calcular el delivery por distancia'
export const DELIVERY_FEE_TIERS_DESCRIPTION =
  'Tramos de tarifa de delivery por distancia (JSON, array ascendente por maxMeters; el último tramo con maxMeters=null es la tarifa plana sin techo, nunca se rechaza un pedido por distancia)'
export const DELIVERY_ALERT_RADIUS_METERS_DESCRIPTION =
  'Radio (metros) a partir del cual un pedido dispara el aviso interno de "fuera de la zona habitual" al admin — nunca bloquea el pedido'

/**
 * Tabla de tarifas por defecto — espejo de `DEFAULT_DELIVERY_FEE_TIERS` del
 * backend. Solo se usa como default de UX cuando `value` viene vacío o el
 * JSON es inválido; el backend tiene su propio default independiente.
 */
export const DEFAULT_DELIVERY_FEE_TIERS: DeliveryFeeTier[] = [
  { maxMeters: 100, fee: 2 },
  { maxMeters: 400, fee: 4 },
  { maxMeters: 1000, fee: 6 },
  { maxMeters: null, fee: 8 },
]

/** Espejo de `DEFAULT_DELIVERY_ALERT_RADIUS_METERS` del backend. */
export const DEFAULT_DELIVERY_ALERT_RADIUS_METERS = 2500

/**
 * Ubicación del local. `undefined`/`''` (sembrado sin configurar) o JSON
 * inválido/incompleto → `null`, NUNCA se inventan coordenadas.
 */
export function parseStoreLocation(value: string | undefined): StoreLocation | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<StoreLocation>
    if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
      return { latitude: parsed.latitude, longitude: parsed.longitude }
    }
    return null
  } catch {
    return null
  }
}

export function serializeStoreLocation(location: StoreLocation): string {
  return JSON.stringify(location)
}

/** Tramos de tarifa; value ausente/vacío o JSON inválido/vacío caen al default. */
export function parseDeliveryFeeTiers(value: string | undefined): DeliveryFeeTier[] {
  if (!value) return DEFAULT_DELIVERY_FEE_TIERS
  try {
    const parsed = JSON.parse(value) as DeliveryFeeTier[]
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_DELIVERY_FEE_TIERS
    return parsed
  } catch {
    return DEFAULT_DELIVERY_FEE_TIERS
  }
}

export function serializeDeliveryFeeTiers(tiers: DeliveryFeeTier[]): string {
  return JSON.stringify(tiers)
}

/** Radio de aviso; value ausente/no numérico/<=0 cae al default. */
export function parseDeliveryAlertRadiusMeters(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_DELIVERY_ALERT_RADIUS_METERS
}

/**
 * Umbral de acumulación del programa de estrellas — clave sembrada por el
 * backend con default `"10"` (mismo patrón genérico GET/PATCH /settings que
 * `DELIVERY_ALERT_RADIUS_METERS_KEY`, confirmado contra settings.service.ts).
 * El reemplazo conceptual de `estrellas_por_premio` (eliminada del backend)
 * son los hitos configurables de `RewardMilestone` (Estrellas → Hitos).
 */
export const SOLES_POR_ESTRELLA_KEY = 'soles_por_estrella'
export const SOLES_POR_ESTRELLA_DESCRIPTION =
  'Soles gastados (subtotal sin envío) necesarios para ganar 1 estrella'

/** value ausente/no numérico/<=0 cae al default (10, mismo que el seed real). */
export function parseSolesPorEstrella(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10
}

/**
 * Valida que los tramos de tarifa queden en orden ascendente estricto, sin
 * huecos ni superposiciones, y que SOLO el último tramo tenga `maxMeters:
 * null` (tarifa plana sin techo). El backend recorre el array en orden y
 * devuelve el primer tramo con `distancia <= maxMeters` (o el de `null`) —
 * con estas dos reglas (ascendente estricto + null solo al final) queda
 * garantizado que cada distancia posible cae en exactamente un tramo.
 * Devuelve el índice y mensaje del primer tramo inválido, o `null` si todos
 * son válidos.
 */
export function validateDeliveryFeeTiers(
  tiers: DeliveryFeeTier[],
): { index: number; message: string } | null {
  if (tiers.length === 0) {
    return { index: -1, message: 'Agrega al menos un tramo' }
  }
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]
    const isLast = i === tiers.length - 1

    if (tier.fee < 0) {
      return { index: i, message: 'La tarifa no puede ser negativa' }
    }

    if (isLast) {
      if (tier.maxMeters !== null) {
        return {
          index: i,
          message: 'El último tramo debe quedar sin límite (tarifa plana)',
        }
      }
      continue
    }

    if (tier.maxMeters === null) {
      return {
        index: i,
        message: 'Solo el último tramo puede quedar sin límite',
      }
    }
    if (tier.maxMeters <= 0) {
      return { index: i, message: 'Debe ser un número mayor a 0' }
    }
    const prev = i > 0 ? tiers[i - 1].maxMeters : 0
    if (prev !== null && tier.maxMeters <= prev) {
      return {
        index: i,
        message: 'Debe ser mayor que el tramo anterior (orden ascendente, sin superposiciones)',
      }
    }
  }
  return null
}