import { useState } from 'react'
import { CalendarRange, ShoppingBag, UserPlus, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import {
  PERIOD_OPTIONS,
  PERIOD_SUFFIX,
  formatCurrency,
  type MetricsPeriod,
} from '../dashboard-utils'
import { useDashboardMetrics } from '../hooks'
import { KPICard } from './KPICard'

/**
 * KPIs de GET /admin/dashboard/metrics con filtro Hoy / Semana / Mes. Los tres
 * períodos llegan en una sola respuesta: el filtro solo elige cuál mostrar,
 * no vuelve a pedir datos. "Clientes nuevos" e "Ingresos del mes" son
 * siempre del mes (el backend solo cuenta clientes nuevos por mes).
 */
export function MetricsSection() {
  const [period, setPeriod] = useState<MetricsPeriod>('today')
  const query = useDashboardMetrics()

  return (
    <section aria-labelledby="metrics-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="metrics-title" className="text-lg font-semibold">
          Resumen
        </h2>
        <div
          role="group"
          aria-label="Período"
          className="bg-muted/40 border-border inline-flex w-fit rounded-lg border p-1"
        >
          {PERIOD_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={period === option.value ? 'default' : 'ghost'}
              aria-pressed={period === option.value}
              onClick={() => setPeriod(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <LoadingState label="Cargando métricas…" />
      ) : query.isError ? (
        <ErrorState
          title="No se pudieron cargar las métricas"
          description="Revisa tu conexión y vuelve a intentar."
          onRetry={() => query.refetch()}
        />
      ) : query.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KPICard
            label={`Ingresos ${PERIOD_SUFFIX[period]}`}
            value={formatCurrency(query.data[period].revenue)}
            hint="Pedidos entregados"
            tone="gold"
            icon={Wallet}
          />
          <KPICard
            label={`Pedidos ${PERIOD_SUFFIX[period]}`}
            value={query.data[period].orders}
            tone="amber"
            icon={ShoppingBag}
            breakdown={[
              {
                label: 'App',
                value: query.data[period].ordersApp,
                dotClassName: 'bg-channel-app',
              },
              {
                label: 'Teléfono',
                value: query.data[period].ordersPhone,
                dotClassName: 'bg-channel-phone',
              },
            ]}
          />
          <KPICard
            label="Clientes nuevos (mes)"
            value={query.data.month.newCustomers}
            hint="Cuentas de cliente registradas este mes"
            tone="sky"
            icon={UserPlus}
          />
          <KPICard
            label="Ingresos del mes"
            value={formatCurrency(query.data.month.revenue)}
            hint="Desde el día 1, pedidos entregados"
            tone="emerald"
            icon={CalendarRange}
          />
        </div>
      ) : null}
    </section>
  )
}
