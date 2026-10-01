import { ArrowDownRight, ArrowRight, ArrowUpRight, Repeat } from 'lucide-react'
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
import { averageDaysToConvert, conversionDeltaPoints } from '../report-utils'
import type { ConversionReport } from '../types/reports'

interface ConversionCardProps {
  query: UseQueryResult<ConversionReport>
  /** Mismo reporte para el período anterior de igual duración (tendencia). */
  previousQuery: UseQueryResult<ConversionReport>
}

/**
 * Conversión teléfono → app (GET /admin/reports/conversion). La tendencia es
 * la diferencia en puntos porcentuales contra el período anterior, calculada
 * con una segunda llamada al mismo endpoint (el backend no trae tendencia).
 */
export function ConversionCard({ query, previousQuery }: ConversionCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-lg">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-1.5">
          <CardTitle>Conversión teléfono → app</CardTitle>
          <CardDescription>
            Clientes por teléfono del rango que después compraron por la app.
          </CardDescription>
        </div>
        <span className="bg-celtas-orange/10 text-celtas-orange flex size-8 shrink-0 items-center justify-center rounded-lg">
          <Repeat className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <LoadingState label="Cargando conversión…" />
        ) : query.isError ? (
          <ErrorState
            title="No se pudo cargar la conversión"
            description="Revisa tu conexión y vuelve a intentar."
            onRetry={() => query.refetch()}
          />
        ) : query.data ? (
          <ConversionBody report={query.data} previousQuery={previousQuery} />
        ) : null}
      </CardContent>
    </Card>
  )
}

function ConversionBody({
  report,
  previousQuery,
}: {
  report: ConversionReport
  previousQuery: UseQueryResult<ConversionReport>
}) {
  if (report.phoneCustomers === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        Sin pedidos por teléfono entregados en este rango.
      </p>
    )
  }

  const delta = conversionDeltaPoints(report, previousQuery.data)
  const avgDays = averageDaysToConvert(report)

  return (
    <div className="space-y-4">
      <p className="text-5xl font-bold tracking-tight">
        {report.conversionRate}
      </p>
      <p className="text-muted-foreground text-sm">
        <span className="text-foreground font-medium">
          {report.convertedToApp}
        </span>{' '}
        de{' '}
        <span className="text-foreground font-medium">
          {report.phoneCustomers}
        </span>{' '}
        {report.phoneCustomers === 1 ? 'cliente' : 'clientes'} por teléfono
        también compraron por la app ({report.phoneOrders}{' '}
        {report.phoneOrders === 1 ? 'pedido' : 'pedidos'} por teléfono).
      </p>
      <ul className="text-muted-foreground space-y-1 text-xs">
        <li>
          {previousQuery.isLoading ? (
            <span>Comparando con el período anterior…</span>
          ) : previousQuery.isError ? (
            <span>No se pudo cargar el período anterior para comparar.</span>
          ) : (
            <Trend delta={delta} />
          )}
        </li>
        {avgDays !== null ? (
          <li>
            En promedio pasaron{' '}
            <span className="text-foreground font-medium">{avgDays}</span> días
            hasta su primer pedido por app.
          </li>
        ) : null}
      </ul>
    </div>
  )
}

function Trend({ delta }: { delta: number | null }) {
  if (delta === null)
    return <span>Sin datos del período anterior para comparar.</span>

  const Icon =
    delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : ArrowRight
  const tone =
    delta > 0
      ? 'text-emerald-400'
      : delta < 0
        ? 'text-celtas-red-light'
        : 'text-muted-foreground'

  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center gap-0.5 font-medium ${tone}`}>
        <Icon className="size-3.5" aria-hidden />
        {delta > 0 ? '+' : ''}
        {delta.toFixed(1)} pp
      </span>
      vs período anterior
    </span>
  )
}
