import { useState } from 'react'
import { Receipt, ShoppingBag, Users, Wallet } from 'lucide-react'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { KPICard } from '@/features/dashboard/components/KPICard'
import { formatCurrency } from '@/features/dashboard/dashboard-utils'
import { ConversionCard } from './components/ConversionCard'
import { ReportFilters } from './components/ReportFilters'
import { ReportSummary } from './components/ReportSummary'
import { RevenueComparison } from './components/RevenueComparison'
import { TopProductsChart } from './components/TopProductsChart'
import { useReportComparison } from './hooks/useReportComparison'
import { useReportConversion } from './hooks/useReportConversion'
import { useReportSummary } from './hooks/useReportSummary'
import { useReportTopProducts } from './hooks/useReportTopProducts'
import { defaultReportFilters, previousPeriod } from './report-utils'
import type { ReportFilters as Filters } from './types/reports'

const APP_DOT = 'bg-channel-app'
const PHONE_DOT = 'bg-channel-phone'

/** "+11.6% vs período anterior", o nada si el backend no puede calcularlo (null). */
function changeHint(change: string | null | undefined): string | undefined {
  return change ? `${change} vs período anterior` : undefined
}

/**
 * Reportes app vs teléfono (GET /admin/reports/*). Cada sección carga y falla
 * por su cuenta: un reporte lento (cold start de Render) no bloquea al resto.
 *
 * Base de todo: pedidos ENTREGADOS en el rango, por deliveredAt en Lima.
 */
export default function ReportsPage() {
  const [filters, setFilters] = useState<Filters>(() => defaultReportFilters())
  const { startDate, endDate, channel, groupBy } = filters
  const prev = previousPeriod(startDate, endDate)

  const summaryQuery = useReportSummary(startDate, endDate, groupBy)
  const comparisonQuery = useReportComparison(startDate, endDate)
  const topProductsQuery = useReportTopProducts(startDate, endDate, channel)
  const conversionQuery = useReportConversion(startDate, endDate)
  const previousConversionQuery = useReportConversion(
    prev.startDate,
    prev.endDate,
  )

  const summary = summaryQuery.data
  const changes = comparisonQuery.data?.comparison

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
        <p className="text-muted-foreground text-sm">
          Ingresos y ventas de pedidos entregados, app vs teléfono.
        </p>
      </header>

      <ReportFilters filters={filters} onFiltersChange={setFilters} />

      {summaryQuery.isLoading ? (
        <LoadingState label="Cargando resumen…" />
      ) : summaryQuery.isError ? (
        <ErrorState
          title="No se pudo cargar el resumen"
          description="Revisa tu conexión y vuelve a intentar."
          onRetry={() => summaryQuery.refetch()}
        />
      ) : summary ? (
        <div className="space-y-2">
          {comparisonQuery.isError ? (
            <p role="status" className="text-muted-foreground text-xs">
              No se pudo cargar la comparación con el período anterior.{' '}
              <button
                type="button"
                onClick={() => comparisonQuery.refetch()}
                className="text-celtas-orange underline-offset-2 hover:underline"
              >
                Reintentar
              </button>
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KPICard
              label="Ingresos totales"
              value={formatCurrency(summary.summary.totalRevenue)}
              hint={changeHint(changes?.revenueChange)}
              tone="gold"
              icon={Wallet}
              breakdown={[
                {
                  label: 'App',
                  value: formatCurrency(summary.byChannel.app.revenue),
                  dotClassName: APP_DOT,
                },
                {
                  label: 'Teléfono',
                  value: formatCurrency(summary.byChannel.phone.revenue),
                  dotClassName: PHONE_DOT,
                },
              ]}
            />
            <KPICard
              label="Pedidos entregados"
              value={summary.summary.totalOrders}
              hint={changeHint(changes?.ordersChange)}
              tone="orange"
              icon={ShoppingBag}
              breakdown={[
                {
                  label: 'App',
                  value: summary.byChannel.app.orders,
                  dotClassName: APP_DOT,
                },
                {
                  label: 'Teléfono',
                  value: summary.byChannel.phone.orders,
                  dotClassName: PHONE_DOT,
                },
              ]}
            />
            <KPICard
              label="Clientes"
              value={summary.summary.totalCustomers}
              hint="Quien compró por ambos canales cuenta una vez"
              tone="sky"
              icon={Users}
              breakdown={[
                {
                  label: 'App',
                  value: summary.byChannel.app.customers,
                  dotClassName: APP_DOT,
                },
                {
                  label: 'Teléfono',
                  value: summary.byChannel.phone.customers,
                  dotClassName: PHONE_DOT,
                },
              ]}
            />
            <KPICard
              label="Ticket promedio"
              value={formatCurrency(summary.summary.averageTicket)}
              hint={changeHint(changes?.ticketChange)}
              tone="emerald"
              icon={Receipt}
              breakdown={[
                {
                  label: 'App',
                  value: formatCurrency(summary.byChannel.app.averageTicket),
                  dotClassName: APP_DOT,
                },
                {
                  label: 'Teléfono',
                  value: formatCurrency(summary.byChannel.phone.averageTicket),
                  dotClassName: PHONE_DOT,
                },
              ]}
            />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {summary ? (
            <RevenueComparison
              rows={summary.data}
              groupBy={groupBy}
              channel={channel}
            />
          ) : null}
        </div>
        <ConversionCard
          query={conversionQuery}
          previousQuery={previousConversionQuery}
        />
      </div>

      <TopProductsChart query={topProductsQuery} channel={channel} />

      {summary ? <ReportSummary data={summary} groupBy={groupBy} /> : null}
    </div>
  )
}
