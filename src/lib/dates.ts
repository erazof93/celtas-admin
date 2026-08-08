import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

/** Zona horaria del negocio (Lima) — igual que el backend. */
export const LIMA_TIMEZONE = 'America/Lima'

/**
 * Formatea una fecha (ISO del backend) en la zona horaria de Lima.
 * Todas las fechas del panel se muestran así, nunca en UTC ni en la zona
 * local del navegador del admin.
 */
export function formatLima(
  date: string | Date,
  pattern = 'dd/MM/yyyy HH:mm',
): string {
  return formatInTimeZone(date, LIMA_TIMEZONE, pattern)
}

/**
 * Convierte una fecha local de Lima (YYYY-MM-DD, ej. de un <input type="date">)
 * a un Date UTC. Con `endOfDay` usa las 23:59:59.999 de ese día en Lima
 * (para el endDate de un banner: el día completo cuenta como vigente).
 */
export function limaDateToUtc(dateStr: string, endOfDay = false): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  const local = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0)
  return fromZonedTime(local, LIMA_TIMEZONE)
}

/**
 * Convierte un ISO del backend a YYYY-MM-DD en Lima (para precargar un
 * <input type="date"> o el DatePicker al editar).
 */
export function utcToLimaDateInput(iso: string): string {
  return formatInTimeZone(iso, LIMA_TIMEZONE, 'yyyy-MM-dd')
}