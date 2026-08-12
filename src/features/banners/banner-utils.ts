import { formatLima, getLimaDayOfWeek } from '@/lib/dates'
import type { Banner, BannerVigencia } from './types'

/** Días de la semana abreviados (0=domingo ... 6=sábado), igual que el backend. */
export const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/**
 * Vigencia EFECTIVA de un banner para el panel admin.
 *
 * Espejo de findActive del backend (banners.service.ts): un banner es vigente
 * si active=true Y (sin startDate O startDate <= ahora) Y (sin endDate O
 * endDate >= ahora). El panel muestra los 4 estados para que el admin vea
 * también los programados, vencidos e inactivos.
 *
 * Además considera `daysOfWeek`: si el banner tiene fechas vigentes pero hoy
 * no está en su lista de días, se muestra como "programado" (está programado
 * para otros días, no está activo hoy). Esto refleja el comportamiento real del
 * endpoint público GET /banners/active, que filtra por día de hoy en Lima.
 *
 * Decisión de diseño: se integra en getBannerVigencia (no se mantiene separado)
 * porque el indicador de vigencia debe reflejar la REALIDAD de visualización:
 * un banner "vigente" que no se muestra hoy es confuso para el admin. El estado
 * "programado" comunica correctamente que está activo pero no visible hoy.
 */
export function getBannerVigencia(
  banner: Pick<
    Banner,
    'active' | 'startDate' | 'endDate' | 'daysOfWeek'
  >,
  now: Date,
): BannerVigencia {
  if (!banner.active) return 'inactivo'
  if (banner.endDate && new Date(banner.endDate).getTime() < now.getTime()) {
    return 'vencido'
  }
  if (
    banner.startDate &&
    new Date(banner.startDate).getTime() > now.getTime()
  ) {
    return 'programado'
  }
  // Fechas vigentes: si tiene restricción de días y hoy no está incluido,
  // el banner no se muestra hoy → "programado" (no "vigente").
  if (
    banner.daysOfWeek &&
    banner.daysOfWeek.length > 0 &&
    !banner.daysOfWeek.includes(getLimaDayOfWeek(now))
  ) {
    return 'programado'
  }
  return 'vigente'
}

/**
 * Formatea los días de la semana de un banner de forma compacta.
 * - null/vacío → "Todos los días"
 * - [2, 4] → "Mar, Mié"
 * - [0] → "Dom"
 */
export function formatDaysOfWeek(daysOfWeek: number[] | null): string {
  if (!daysOfWeek || daysOfWeek.length === 0) return 'Todos los días'
  return [...daysOfWeek]
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d])
    .join(', ')
}

/**
 * Formatea el rango de vigencia de un banner para el listado.
 * - sin startDate ni endDate → "Sin fechas"
 * - con al menos una de las dos, cada lado se formatea si existe; el lado
 *   ausente se muestra como "…" (SOLO ese lado, nunca el que sí tiene valor —
 *   el bug reportado era que un startDate real también se truncaba).
 */
export function formatBannerDateRange(
  banner: Pick<Banner, 'startDate' | 'endDate'>,
): string {
  if (!banner.startDate && !banner.endDate) return 'Sin fechas'
  const start = banner.startDate
    ? formatLima(banner.startDate, 'dd/MM/yyyy')
    : '…'
  const end = banner.endDate ? formatLima(banner.endDate, 'dd/MM/yyyy') : '…'
  return `${start} → ${end}`
}

/**
 * Valida el rango de fechas: si vienen ambas, startDate debe ser anterior a
 * endDate. Espejo de IsBannerDateRangeValid / assertValidDates del backend.
 * Si falta alguna de las dos, se considera válido (fechas opcionales).
 */
export function isValidBannerDateRange(
  start?: string | Date | null,
  end?: string | Date | null,
): boolean {
  if (!start || !end) return true
  return new Date(start).getTime() < new Date(end).getTime()
}