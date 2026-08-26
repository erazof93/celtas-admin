import type { StarPromotion } from './types'

const MONTH_LABELS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

/**
 * Formatea una fecha YYYY-MM-DD (calendario, sin hora) como "20 dic 2026".
 * No usa formatLima/date-fns-tz a propósito: esas fechas son strings de
 * calendario planos (columna `date` de Postgres), no timestamps — pasarlas
 * por conversión de zona horaria (Lima = UTC-5) correría el día hacia atrás,
 * a diferencia de Banners, que sí guarda timestamps.
 */
export function formatStarPromotionDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return `${day} ${MONTH_LABELS[month - 1]} ${year}`
}

/** Rango de vigencia legible, ej. "20 dic 2026 – 31 dic 2026". */
export function formatStarPromotionDateRange(
  promotion: Pick<StarPromotion, 'startDate' | 'endDate'>,
): string {
  return `${formatStarPromotionDate(promotion.startDate)} – ${formatStarPromotionDate(promotion.endDate)}`
}

/**
 * Valida que startDate sea anterior o igual a endDate. Espejo de
 * IsStarPromotionDateRangeValid del backend: comparación lexicográfica
 * directa, ambas son strings 'YYYY-MM-DD' que ordenan igual que las fechas
 * que representan. Ambas fechas son obligatorias (a diferencia de Banners).
 */
export function isValidStarPromotionDateRange(
  startDate: string,
  endDate: string,
): boolean {
  return startDate <= endDate
}
