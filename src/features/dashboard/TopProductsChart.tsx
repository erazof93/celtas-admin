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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { UseQueryResult } from '@tanstack/react-query'
import { formatCurrency, formatPercent, revenueShare } from './dashboard-utils'
import type { TopProduct, TopProductsResult } from './types'

const CHART_BAR_COLOR = 'var(--color-celtas-orange)'
const CHART_TICK_COLOR = 'var(--color-celtas-cream)'

interface TopProductsChartProps {
  query: UseQueryResult<TopProductsResult>
}

/**
 * Gráfica de productos más vendidos (Recharts, barras horizontales).
 * Solo incluye pedidos ENTREGADOS en el rango (lo calcula el backend).
 */
export function TopProductsChart({ query }: TopProductsChartProps) {
  if (query.isLoading) {
    return <LoadingState label="Cargando productos…" />
  }

  if (query.isError) {
    return (
      <ErrorState
        title="No se pudo cargar los productos"
        description="Revisa tu conexión y vuelve a intentar."
        onRetry={() => query.refetch()}
      />
    )
  }

  const items = query.data?.items ?? []

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        Aún no hay ventas en este rango (pedidos entregados).
      </p>
    )
  }

  const chartHeight = Math.min(items.length * 44, 440) + 48

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={items} layout="vertical" margin={{ left: 0, right: 24 }}>
        <CartesianGrid
          stroke="var(--border)"
          strokeDasharray="3 3"
          horizontal={false}
        />
        <XAxis
          type="number"
          allowDecimals={false}
          stroke="var(--border)"
          tick={{ fill: CHART_TICK_COLOR, fontSize: 12 }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={190}
          stroke="var(--border)"
          tick={{ fill: CHART_TICK_COLOR, fontSize: 12 }}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'rgba(232, 89, 12, 0.08)' }}
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--foreground)',
            fontSize: 12,
          }}
          labelStyle={{ fontWeight: 600 }}
          formatter={(value, name) => [
            String(value),
            name === 'quantity' ? 'Cantidad' : String(name),
          ]}
        />
        <Bar dataKey="quantity" fill={CHART_BAR_COLOR} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * Tabla de productos más vendidos: mismo orden que el backend (por cantidad
 * vendida) con ingresos y participación. El % es sobre los ingresos de los
 * productos listados (el backend no expone ingresos por producto fuera del
 * top N), por eso la columna dice "% del top", no "% del total".
 */
export function TopProductsTable({ items }: { items: TopProduct[] }) {
  const shares = revenueShare(items)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Producto</TableHead>
          <TableHead className="text-right">Cantidad</TableHead>
          <TableHead className="text-right">Ingresos</TableHead>
          <TableHead className="text-right">% del top</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item, index) => (
          <TableRow key={item.menuItemId ?? `deleted-${index}`}>
            <TableCell className="font-medium">{item.name}</TableCell>
            <TableCell className="text-right">{item.quantity}</TableCell>
            <TableCell className="text-right">{formatCurrency(item.revenue)}</TableCell>
            <TableCell className="text-muted-foreground text-right">
              {formatPercent(shares[index])}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * Tarjeta de productos más vendidos con manejo de estados
 * (loading/error/vacío) y alternancia gráfico/tabla.
 */
export function TopProductsCard({
  query,
}: {
  query: UseQueryResult<TopProductsResult>
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const items = query.data?.items ?? []
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Productos más vendidos</CardTitle>
          <CardDescription>
            Pedidos entregados en el rango seleccionado, por cantidad vendida.
          </CardDescription>
        </div>
        {items.length > 0 ? (
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
        {view === 'table' && items.length > 0 ? (
          <TopProductsTable items={items} />
        ) : (
          <TopProductsChart query={query} />
        )}
      </CardContent>
    </Card>
  )
}
