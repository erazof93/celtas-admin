import type { Banner, BannerVigencia } from './types'

/**
 * Vigencia EFECTIVA de un banner para el panel admin.
 *
 * Espejo de findActive del backend (banners.service.ts): un banner es vigente
 * si active=true Y (sin startDate O startDate <= ahora) Y (sin endDate O
 * endDate >= ahora). El panel muestra los 4 estados para que el admin vea
 * también los programados, vencidos e inactivos.
 */
export function getBannerVigencia(
  banner: Pick<Banner, 'active' | 'startDate' | 'endDate'>,
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
  return 'vigente'
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