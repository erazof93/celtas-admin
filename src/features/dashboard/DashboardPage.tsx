import { useState } from 'react'
import { CheckCircle2, Inbox, ShoppingBag, Wallet } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { cn } from '@/lib/utils'
import {
  DateRangeSelector,
} from './DateRangeSelector'
import { defaultDateRange, type DateRangeSelection } from './date-range'
import { useDashboardSummary, useDashboardTopProducts } from './hooks'
import { TopProductsCard } from './TopProductsChart'
import type { DashboardSummary, OrderStatus } from './types'

const CURRENCY = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  en_camino: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

const STATUS_DOT: Record<OrderStatus, string> = {
  pendiente: 'bg-amber-400',
  confirmado: 'bg-sky-400',
  en_camino: 'bg-celtas-orange',
  entregado: 'bg-emerald-500',
  cancelado: 'bg-celtas-red',
}

function countByStatus(summary: DashboardSummary, status: OrderStatus): number {
  return summary.ordersByStatus.find((s) => s.status === status)?.count ?? 0
}

const STAT_TONES = {
  orange: 'bg-celtas-orange/10 text-celtas-orange',
  gold: 'bg-celtas-gold/10 text-celtas-gold',
  emerald: 'bg-emerald-400/10 text-emerald-400',
  amber: 'bg-amber-400/10 text-amber-400',
} as const

function StatCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string
  value: string | number
  hint?: string
  tone: keyof typeof STAT_TONES
  icon: typeof ShoppingBag
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {label}
        </CardTitle>
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg',
            STAT_TONES[tone],
          )}
        >
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        {hint ? (
          <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function StatusBreakdown({
  summary,
}: {
  summary: DashboardSummary
}) {
  const rows = summary.ordersByStatus

  return (
    <Card>
      <CardHeader>
        <CardTitle>Desglose por estado</CardTitle>
        <CardDescription>
          Pedidos creados en el rango, según su estado actual.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Sin pedidos en este rango.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(({ status, count }) => (
              <li
                key={status}
                className="bg-muted/40 flex items-center gap-3 rounded-lg px-3 py-2"
              >
                <span
                  className={cn(
                    'size-2.5 shrink-0 rounded-full',
                    STATUS_DOT[status],
                  )}
                />
                <span className="flex-1 text-sm">{STATUS_LABELS[status]}</span>
                <span className="font-semibold">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Dashboard — MÓDULO 3. Consume GET /admin/dashboard/summary y
 * GET /admin/dashboard/top-products con rango de fechas opcional
 * (default: hoy en America/Lima, calculado por el backend).
 */
export default function DashboardPage() {
  const [range, setRange] = useState<DateRangeSelection>(() =>
    defaultDateRange(),
  )
  const { from, to } = range

  const summaryQuery = useDashboardSummary(from, to)
  const topQuery = useDashboardTopProducts(from, to, 10)

  const summary = summaryQuery.data

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Resumen del día y ventas del negocio.
          </p>
        </div>
        <DateRangeSelector value={range} onChange={setRange} />
      </header>

      {summaryQuery.isLoading ? (
        <LoadingState label="Cargando resumen del día…" />
      ) : summaryQuery.isError ? (
        <ErrorState
          title="No se pudo cargar el resumen"
          description="Revisa tu conexión y vuelve a intentar."
          onRetry={() => summaryQuery.refetch()}
        />
      ) : summary && summary.ordersCount === 0 ? (
        <div className="bg-card border-border flex flex-col items-center gap-3 rounded-xl border px-6 py-14 text-center">
          <Inbox className="text-celtas-orange size-8" />
          <div>
            <p className="font-medium">Sin pedidos en este rango</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Prueba con otro rango de fechas para ver el resumen.
            </p>
          </div>
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Pedidos en el rango"
              value={summary.ordersCount}
              hint="Creados, en todos los estados"
              tone="orange"
              icon={ShoppingBag}
            />
            <StatCard
              label="Ingresos (entregados)"
              value={CURRENCY.format(summary.revenue)}
              hint="Suma de pedidos entregados"
              tone="gold"
              icon={Wallet}
            />
            <StatCard
              label="Entregados"
              value={countByStatus(summary, 'entregado')}
              hint="Pedidos con delivery completado"
              tone="emerald"
              icon={CheckCircle2}
            />
            <StatCard
              label="Pendientes"
              value={countByStatus(summary, 'pendiente')}
              hint="Esperando confirmación"
              tone="amber"
              icon={ShoppingBag}
            />
          </div>

          <StatusBreakdown summary={summary} />

          <TopProductsCard query={topQuery} />
        </>
      ) : null}
    </div>
  )
}