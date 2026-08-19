import { Inbox } from 'lucide-react'
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
import { formatLima } from '@/lib/dates'
import { BroadcastForm } from './BroadcastForm'
import { useBroadcastHistory } from './hooks'

/**
 * Marketing/fidelización — MÓDULO nuevo, sección propia (NO mezclada con
 * Configuración). Formulario de envío inmediato arriba, historial de
 * campañas ya enviadas debajo (GET /notifications/broadcast-history).
 */
export default function MarketingPage() {
  const { data, isLoading, isError, refetch } = useBroadcastHistory()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Marketing</h1>
        <p className="text-muted-foreground text-sm">
          Envía una notificación push a todos los clientes con notificaciones
          activadas. Envío manual e inmediato, sin segmentación ni
          programación.
        </p>
      </header>

      <div className="bg-card border-border rounded-xl border p-4 sm:p-6">
        <BroadcastForm />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          Historial de campañas
        </h2>

        {isLoading ? (
          <LoadingState label="Cargando historial…" />
        ) : isError ? (
          <ErrorState
            title="No se pudo cargar el historial"
            description="Revisa tu conexión y vuelve a intentar."
            onRetry={() => refetch()}
          />
        ) : data && data.length === 0 ? (
          <div className="bg-card border-border flex flex-col items-center gap-3 rounded-xl border px-6 py-14 text-center">
            <Inbox className="text-celtas-orange size-8" />
            <div>
              <p className="font-medium">Todavía no enviaste ninguna campaña</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Usa el formulario de arriba para enviar la primera.
              </p>
            </div>
          </div>
        ) : data ? (
          <div className="bg-card border-border overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Cuerpo</TableHead>
                  <TableHead>Alcance</TableHead>
                  <TableHead>Enviada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">
                      {campaign.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate text-sm">
                      {campaign.body}
                    </TableCell>
                    <TableCell className="text-sm">
                      {campaign.sentCount} / {campaign.totalCount}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatLima(campaign.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>
    </div>
  )
}
