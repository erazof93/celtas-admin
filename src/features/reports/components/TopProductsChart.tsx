import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { UseQueryResult } from '@tanstack/react-query'
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
import { formatCurrency } from '@/features/dashboard/dashboard-utils'
import type { ReportChannel, TopProduct } from '../types/reports'

const ROW_HEIGHT = 36
const COLOR_APP = 'var(--color-channel-app)'
const COLOR_PHONE = 'var(--color-channel-phone)'
const TICK = { fill: 'var(--muted-foreground)', fontSize: 12 }

const CHANNEL_LABEL: Record<ReportChannel, string> = {
  all: 'ambos canales',
  app: 'solo app',
  phone: 'solo teléfono',
}

interface TopProductsChartProps {
  query: UseQueryResult<TopProduct[]>
  channel: ReportChannel
}

/**
 * Top 10 por cantidad vendida (orden del backend), con ingresos apilados por
 * canal. Barras horizontales: los nombres de producto no caben en un eje X.
 * Ingresos de producto = precio × cantidad (sin delivery ni extras), por eso
 * no suman lo mismo que los ingresos del resumen.
 */
export function TopProductsChart({ query, channel }: TopProductsChartProps) {
  const products = query.data ?? []
  const rows = products.map((p) => ({
    name: p.name,
    app: p.byChannel.app.revenue,
    phone: p.byChannel.phone.revenue,
  }))

  return (
    <Card className="transition-shadow hover:shadow-lg">
      <CardHeader>
        <CardTitle>Productos más vendidos</CardTitle>
        <CardDescription>
          Top 10 por cantidad, {CHANNEL_LABEL[channel]}. Ingresos = precio ×
          cantidad (sin delivery ni extras).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <LoadingState label="Cargando productos…" />
        ) : query.isError ? (
          <ErrorState
            title="No se pudieron cargar los productos"
            description="Revisa tu conexión y vuelve a intentar."
            onRetry={() => query.refetch()}
          />
        ) : products.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            Sin productos vendidos en este rango.
          </p>
        ) : (
          <div className="space-y-6">
            <ResponsiveContainer
              width="100%"
              height={rows.length * ROW_HEIGHT + 40}
            >
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ left: 8, right: 16 }}
              >
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  stroke="var(--border)"
                  tick={TICK}
                  tickLine={false}
                  tickFormatter={(v: number) => `S/ ${v}`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  stroke="var(--border)"
                  tick={TICK}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(245, 241, 232, 0.06)' }}
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--foreground)',
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [
                    formatCurrency(Number(value)),
                    name === 'app' ? 'App' : 'Teléfono',
                  ]}
                />
                {channel !== 'phone' ? (
                  <Bar
                    dataKey="app"
                    stackId="revenue"
                    fill={COLOR_APP}
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                ) : null}
                {channel !== 'app' ? (
                  <Bar
                    dataKey="phone"
                    stackId="revenue"
                    fill={COLOR_PHONE}
                    stroke="var(--card)"
                    strokeWidth={2}
                    radius={[0, 4, 4, 0]}
                  />
                ) : null}
              </BarChart>
            </ResponsiveContainer>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                  <TableHead className="text-right">% ingresos</TableHead>
                  <TableHead className="text-right">App</TableHead>
                  <TableHead className="text-right">Teléfono</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id ?? `deleted-${p.name}`}>
                    <TableCell>
                      {p.name}
                      {p.id === null ? (
                        <span className="text-muted-foreground ml-1 text-xs">
                          (eliminado)
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">{p.quantity}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(p.revenue)}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.revenuePercentage.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(p.byChannel.app.revenue)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(p.byChannel.phone.revenue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
