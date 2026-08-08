import { startOfMonth, startOfWeek } from 'date-fns'
import { format, toZonedTime } from 'date-fns-tz'

/**
 * Presets de rango del dashboard, con fechas calculadas en la zona horaria de
 * Lima (America/Lima) igual que el backend. El `from`/`to` se arma en
 * YYYY-MM-DD y representa el día completo en Lima.
 */

export type DateRangePreset = 'today' | 'week' | 'month' | 'custom'

export interface DateRange {
  /** Fecha inicial YYYY-MM-DD. */
  from: string
  /** Fecha final YYYY-MM-DD. */
  to: string
}

export interface DateRangeSelection extends DateRange {
  preset: DateRangePreset
}

const LIMA_TIMEZONE = 'America/Lima'

function todayInLima(): Date {
  return toZonedTime(new Date(), LIMA_TIMEZONE)
}

export function rangeForPreset(
  preset: Exclude<DateRangePreset, 'custom'>,
): DateRange {
  const now = todayInLima()
  const today = format(now, 'yyyy-MM-dd')

  if (preset === 'today') {
    return { from: today, to: today }
  }
  if (preset === 'week') {
    return {
      from: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      to: today,
    }
  }
  return {
    from: format(startOfMonth(now), 'yyyy-MM-dd'),
    to: today,
  }
}

/** Rango inicial por defecto: hoy (America/Lima), como el backend. */
export function defaultDateRange(): DateRangeSelection {
  const { from, to } = rangeForPreset('today')
  return { preset: 'today', from, to }
}