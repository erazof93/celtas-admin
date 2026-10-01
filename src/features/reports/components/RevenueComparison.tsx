import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatCurrency } from '@/features/dashboard/dashboard-utils'
import { cn } from '@/lib/utils'
import { formatPeriod } from '../report-utils'
import type { ReportChannel, ReportGroupBy, SummaryRow } from '../types/reports'

const CHART_HEIGHT = 220
const COLOR_TOTAL = 'var(--color-celtas-gold)'
const COLOR_APP = 'var(--color-channel-app)'
const COLOR_PHONE = 'var(--color-channel-phone)'
const TICK = { fill: 'var(--muted-foreground)', fontSize: 12 }

const SERIES_LABELS: Record<string, string> = {
  revenue: 'Total',
  revenueApp: 'App',
  revenuePhone: 'Teléfono',
  ordersApp: 'App',
  ordersPhone: 'Teléfono',
}

const TOOLTIP_PROPS = {
  cursor: { fill: 'rgba(245, 241, 232, 0.06)' },
  contentStyle: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--foreground)',
    fontSize: 12,
  },
  labelStyle: { fontWeight: 600 },
}

interface RevenueComparisonProps {
  rows: SummaryRow[]
  groupBy: ReportGroupBy
  channel: ReportChannel
}

/**
 * Ingresos y pedidos por período, app vs teléfono (summary.data).
 *
 * Dos gráficos con el mismo eje X en vez de uno con doble eje Y — igual que
 * el dashboard: soles y cantidad de pedidos tienen escalas distintas y un
 * doble eje invita a leer cruces que no significan nada. El filtro de canal
 * solo oculta series aquí; el backend siempre trae ambos canales en summary.
 */
export function RevenueComparison({
  rows,
  groupBy,
  channel,
}: RevenueComparisonProps) {
  const showApp = channel !== 'phone'
  const showPhone = channel !== 'app'
  const showTotal = channel === 'all'
  const tickFormatter = (period: string) => formatPeriod(period, groupBy)
  const isEmpty = rows.every((r) => r.orders === 0)

  return (
    <Card className="transition-shadow hover:shadow-lg">
      <CardHeader>
        <CardTitle>Ingresos y pedidos por canal</CardTitle>
        <CardDescription>Pedidos entregados en cada período.</CardDescription>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            Sin pedidos entregados en este rango.
          </p>
        ) : (
          <div className="space-y-6">
            <figure className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <figcaption className="text-sm font-medium">
                  Ingresos (S/)
                </figcaption>
                <Legend app={showApp} phone={showPhone} total={showTotal} />
              </div>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <LineChart data={rows} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="period"
                    tickFormatter={tickFormatter}
                    stroke="var(--border)"
                    tick={TICK}
                    tickLine={false}
                  />
                  <YAxis
                    width={72}
                    stroke="var(--border)"
                    tick={TICK}
                    tickLine={false}
                    tickFormatter={(v: number) => `S/ ${v}`}
                  />
                  <Tooltip
                    {...TOOLTIP_PROPS}
                    labelFormatter={(label) => tickFormatter(String(label))}
                    formatter={(value, name) => [
                      formatCurrency(Number(value)),
                      SERIES_LABELS[String(name)] ?? String(name),
                    ]}
                  />
                  {showTotal ? (
                    <Line
                      dataKey="revenue"
                      stroke={COLOR_TOTAL}
                      strokeWidth={2}
                      dot={false}
                    />
                  ) : null}
                  {showApp ? (
                    <Line
                      dataKey="revenueApp"
                      stroke={COLOR_APP}
                      strokeWidth={2}
                      dot={false}
                    />
                  ) : null}
                  {showPhone ? (
                    <Line
                      dataKey="revenuePhone"
                      stroke={COLOR_PHONE}
                      strokeWidth={2}
                      dot={false}
                    />
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
            </figure>

            <figure className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <figcaption className="text-sm font-medium">Pedidos</figcaption>
                <Legend app={showApp} phone={showPhone} total={false} />
              </div>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={rows} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="period"
                    tickFormatter={tickFormatter}
                    stroke="var(--border)"
                    tick={TICK}
                    tickLine={false}
                  />
                  <YAxis
                    width={72}
                    allowDecimals={false}
                    stroke="var(--border)"
                    tick={TICK}
                    tickLine={false}
                  />
                  <Tooltip
                    {...TOOLTIP_PROPS}
                    labelFormatter={(label) => tickFormatter(String(label))}
                    formatter={(value, name) => [
                      String(value),
                      SERIES_LABELS[String(name)] ?? String(name),
                    ]}
                  />
                  {/* stroke del color de la tarjeta = separación de 2px entre segmentos */}
                  {showApp ? (
                    <Bar
                      dataKey="ordersApp"
                      stackId="orders"
                      fill={COLOR_APP}
                      stroke="var(--card)"
                      strokeWidth={2}
                      maxBarSize={36}
                    />
                  ) : null}
                  {showPhone ? (
                    <Bar
                      dataKey="ordersPhone"
                      stackId="orders"
                      fill={COLOR_PHONE}
                      stroke="var(--card)"
                      strokeWidth={2}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={36}
                    />
                  ) : null}
                </BarChart>
              </ResponsiveContainer>
            </figure>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Legend({
  app,
  phone,
  total,
}: {
  app: boolean
  phone: boolean
  total: boolean
}) {
  const items = [
    { show: total, label: 'Total', className: 'bg-celtas-gold' },
    { show: app, label: 'App', className: 'bg-channel-app' },
    { show: phone, label: 'Teléfono', className: 'bg-channel-phone' },
  ].filter((i) => i.show)

  return (
    <ul className="text-muted-foreground flex items-center gap-4 text-xs">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn('size-2.5 rounded-sm', item.className)}
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
