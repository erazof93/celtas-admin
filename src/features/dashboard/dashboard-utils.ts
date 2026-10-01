import type { TopProduct } from './types'

const CURRENCY = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCurrency(value: number): string {
  return CURRENCY.format(value)
}

export type MetricsPeriod = 'today' | 'week' | 'month'

export const PERIOD_OPTIONS: { value: MetricsPeriod; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
]

/** Sufijo de los KPIs por período (semana y mes son calendario, en Lima). */
export const PERIOD_SUFFIX: Record<MetricsPeriod, string> = {
  today: 'hoy',
  week: 'esta semana',
  month: 'este mes',
}

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/**
 * "lun 28" a partir de un día calendario YYYY-MM-DD del backend (ya está en
 * Lima). Se parsea como fecha civil en UTC para que la zona horaria del
 * navegador no lo corra al día anterior.
 */
export function formatTrendDay(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`
}

/** "28/09/2026" a partir de YYYY-MM-DD, sin pasar por la zona horaria. */
export function formatCalendarDate(date: string): string {
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

/**
 * Participación de cada producto en los ingresos de la lista mostrada (no en
 * las ventas totales: el backend no expone ingresos por producto fuera del
 * top N, y `summary.revenue` incluye delivery y descuentos). 0 si la lista
 * no tiene ingresos.
 */
export function revenueShare(items: TopProduct[]): number[] {
  const total = items.reduce((sum, item) => sum + item.revenue, 0)
  return items.map((item) => (total > 0 ? item.revenue / total : 0))
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}
