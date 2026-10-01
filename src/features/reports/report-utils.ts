import { format, toZonedTime } from 'date-fns-tz'
import type {
  ConversionReport,
  ReportFilters,
  ReportGroupBy,
} from './types/reports'

const LIMA_TIMEZONE = 'America/Lima'
const DAY_MS = 86_400_000
const DEFAULT_RANGE_DAYS = 30

/** Tope de días (inclusive) que acepta el backend en un rango de reporte. */
export const MAX_REPORT_RANGE_DAYS = 366

/** Hoy en Lima como YYYY-MM-DD. */
export function todayInLima(now: Date = new Date()): string {
  return format(toZonedTime(now, LIMA_TIMEZONE), 'yyyy-MM-dd')
}

/**
 * Suma días a una fecha calendario YYYY-MM-DD. Se opera en UTC para que la
 * zona horaria del navegador no corra el día.
 */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

/** Días que abarca [from, to], ambos incluidos (igual que el backend). */
export function spanInDays(from: string, to: string): number {
  return (
    Math.round(
      (Date.parse(`${to}T00:00:00.000Z`) -
        Date.parse(`${from}T00:00:00.000Z`)) /
        DAY_MS,
    ) + 1
  )
}

/** Filtros iniciales: últimos 30 días (hoy incluido) en Lima, ambos canales, por día. */
export function defaultReportFilters(now: Date = new Date()): ReportFilters {
  const endDate = todayInLima(now)
  return {
    startDate: addDays(endDate, -(DEFAULT_RANGE_DAYS - 1)),
    endDate,
    channel: 'all',
    groupBy: 'day',
  }
}

/**
 * Motivo por el que el rango no es válido, o null si lo es. Mismas reglas que
 * el DTO del backend (inicio <= fin, máx. 366 días), para no mandar un 400.
 */
export function rangeError(startDate: string, endDate: string): string | null {
  if (!startDate || !endDate) return 'Elige ambas fechas.'
  if (startDate > endDate) {
    return 'La fecha inicial no puede ser posterior a la final.'
  }
  if (spanInDays(startDate, endDate) > MAX_REPORT_RANGE_DAYS) {
    return `El rango no puede superar ${MAX_REPORT_RANGE_DAYS} días.`
  }
  return null
}

/**
 * Período anterior de la misma duración, justo antes del rango elegido
 * (1-30 sep → 2-31 ago). Es lo que se compara en "vs período anterior".
 */
export function previousPeriod(
  startDate: string,
  endDate: string,
): { startDate: string; endDate: string } {
  const days = spanInDays(startDate, endDate)
  return {
    startDate: addDays(startDate, -days),
    endDate: addDays(startDate, -1),
  }
}

/** "YYYY-MM-DD:YYYY-MM-DD", el formato de current/previous en /comparison. */
export function toPeriodParam(startDate: string, endDate: string): string {
  return `${startDate}:${endDate}`
}

const MONTHS = [
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
 * Etiqueta corta de un período de summary.data: "28/09" (día), "sem 28/09"
 * (week: el período es el lunes) o "sep 2026" (month: el período es el día 1).
 */
export function formatPeriod(period: string, groupBy: ReportGroupBy): string {
  const [y, m, d] = period.split('-')
  if (groupBy === 'month') return `${MONTHS[Number(m) - 1]} ${y}`
  if (groupBy === 'week') return `sem ${d}/${m}`
  return `${d}/${m}`
}

/** "25.0%" → 25. NaN si el backend mandara algo inesperado. */
export function parseRate(rate: string): number {
  return Number.parseFloat(rate)
}

/**
 * Diferencia en puntos porcentuales entre la conversión actual y la anterior
 * (no un % relativo: pasar de 20% a 25% es +5 pp). null si el período anterior
 * no tuvo clientes por teléfono — no hay base para comparar.
 */
export function conversionDeltaPoints(
  current: ConversionReport,
  previous: ConversionReport | undefined,
): number | null {
  if (!previous || previous.phoneCustomers === 0) return null
  const delta =
    parseRate(current.conversionRate) - parseRate(previous.conversionRate)
  return Number.isNaN(delta) ? null : Math.round(delta * 10) / 10
}

/** Promedio de días entre el primer pedido por teléfono y el primero por app. */
export function averageDaysToConvert(report: ConversionReport): number | null {
  if (report.timeline.length === 0) return null
  const total = report.timeline.reduce((sum, t) => sum + t.daysDiff, 0)
  return Math.round((total / report.timeline.length) * 10) / 10
}
