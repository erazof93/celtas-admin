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
import type { UseQueryResult } from '@tanstack/react-query'
import type { TopProductsResult } from './types'

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
 * Tarjeta que envuelve la gráfica con su título y manejo de estados
 * (loading/error/vacío) — se usa dentro del dashboard.
 */
export function TopProductsCard({
  query,
}: {
  query: UseQueryResult<TopProductsResult>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Productos más vendidos</CardTitle>
        <CardDescription>
          Pedidos entregados en el rango seleccionado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TopProductsChart query={query} />
      </CardContent>
    </Card>
  )
}