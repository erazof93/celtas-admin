import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatCalendarDate,
  formatCurrency,
  formatTrendDay,
} from '../dashboard-utils'
import { useDashboardRevenueTrend } from '../hooks'
import type { RevenueTrendDay } from '../types'

const TREND_DAYS = 7
const CHART_HEIGHT = 180

const COLOR_REVENUE = 'var(--color-celtas-gold)'
const COLOR_APP = 'var(--color-channel-app)'
const COLOR_PHONE = 'var(--color-channel-phone)'
const TICK = { fill: 'var(--muted-foreground)', fontSize: 12 }

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
  labelFormatter: (_: unknown, payload: readonly { payload?: RevenueTrendDay }[]) =>
    payload?.[0]?.payload ? formatCalendarDate(payload[0].payload.date) : '',
}

/**
 * Tendencia de los últimos 7 días (GET /admin/dashboard/revenue-trend).
 *
 * Dos gráficos con el mismo eje X en vez de uno con doble eje Y: ingresos (S/)
 * y pedidos (cantidad) tienen escalas distintas, y un doble eje induce a leer
 * cruces que no significan nada. Ingresos = pedidos ENTREGADOS ese día; pedidos
 * = CREADOS ese día, por canal. El backend no separa ingresos por canal.
 */
export function RevenueTrendCard() {
  const query = useDashboardRevenueTrend(TREND_DAYS)
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const days = query.data ?? []
  const isEmpty = days.every(
    (d) => d.revenue === 0 && d.ordersApp === 0 && d.ordersPhone === 0,
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Últimos 7 días</CardTitle>
          <CardDescription>
            Ingresos de pedidos entregados y pedidos creados por canal.
          </CardDescription>
        </div>
        {query.data && !isEmpty ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
          >
            {view === 'chart' ? 'Ver tabla' : 'Ver gráfico'}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <LoadingState label="Cargando tendencia…" />
        ) : query.isError ? (
          <ErrorState
            title="No se pudo cargar la tendencia"
            description="Revisa tu conexión y vuelve a intentar."
            onRetry={() => query.refetch()}
          />
        ) : isEmpty ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            Sin pedidos ni ventas en los últimos 7 días.
          </p>
        ) : view === 'table' ? (
          <TrendTable days={days} />
        ) : (
          <div className="space-y-6">
            <figure className="space-y-2">
              <figcaption className="text-sm font-medium">Ingresos por día</figcaption>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={days} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatTrendDay}
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
                    formatter={(value) => [formatCurrency(Number(value)), 'Ingresos']}
                  />
                  <Bar dataKey="revenue" fill={COLOR_REVENUE} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </figure>

            <figure className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <figcaption className="text-sm font-medium">Pedidos por día</figcaption>
                <ChannelLegend />
              </div>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={days} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatTrendDay}
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
                    formatter={(value, name) => [
                      String(value),
                      name === 'ordersApp' ? 'App' : 'Teléfono',
                    ]}
                  />
                  {/* stroke del color de la tarjeta = separación de 2px entre segmentos */}
                  <Bar
                    dataKey="ordersApp"
                    stackId="orders"
                    fill={COLOR_APP}
                    stroke="var(--card)"
                    strokeWidth={2}
                    maxBarSize={36}
                  />
                  <Bar
                    dataKey="ordersPhone"
                    stackId="orders"
                    fill={COLOR_PHONE}
                    stroke="var(--card)"
                    strokeWidth={2}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />
                </BarChart>
              </ResponsiveContainer>
            </figure>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ChannelLegend() {
  return (
    <ul className="text-muted-foreground flex items-center gap-4 text-xs">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="bg-channel-app size-2.5 rounded-sm" />
        App
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="bg-channel-phone size-2.5 rounded-sm" />
        Teléfono
      </li>
    </ul>
  )
}

function TrendTable({ days }: { days: RevenueTrendDay[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Día</TableHead>
          <TableHead className="text-right">Ingresos</TableHead>
          <TableHead className="text-right">Pedidos app</TableHead>
          <TableHead className="text-right">Pedidos teléfono</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {days.map((day) => (
          <TableRow key={day.date}>
            <TableCell>{formatCalendarDate(day.date)}</TableCell>
            <TableCell className="text-right">{formatCurrency(day.revenue)}</TableCell>
            <TableCell className="text-right">{day.ordersApp}</TableCell>
            <TableCell className="text-right">{day.ordersPhone}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
