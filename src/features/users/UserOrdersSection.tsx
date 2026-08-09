import { Inbox } from 'lucide-react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Pagination } from '@/components/ui/Pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatLima } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABELS } from '@/features/orders/status'
import type { PaginatedOrders } from '@/features/orders/types'

const CURRENCY = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

interface UserOrdersSectionProps {
  query: UseQueryResult<PaginatedOrders, Error>
  onPageChange: (page: number) => void
}

/**
 * Pedidos del usuario (tab del detalle). Consume GET /orders?userId=X
 * (paginado). Reutiliza ORDER_STATUS_BADGE/LABELS del módulo de pedidos —
 * no duplica la lógica de labels/colores por estado. Maneja los 3 estados:
 * loading, error y vacío ("Este cliente no tiene pedidos todavía").
 */
export function UserOrdersSection({
  query,
  onPageChange,
}: UserOrdersSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Pedidos de este cliente</h3>

      {query.isLoading ? (
        <LoadingState label="Cargando pedidos…" />
      ) : query.isError ? (
        <ErrorState
          title="No se pudieron cargar los pedidos"
          description="Revisa tu conexión y vuelve a intentar."
          onRetry={() => query.refetch()}
        />
      ) : query.data && query.data.items.length === 0 ? (
        <div className="bg-muted/40 border-border flex items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-sm">
          <Inbox className="text-muted-foreground size-4" />
          <p className="text-muted-foreground">
            Este cliente no tiene pedidos todavía.
          </p>
        </div>
      ) : query.data ? (
        <div className="bg-card border-border overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-xs">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </TableCell>
                  <TableCell className="font-medium">
                    {CURRENCY.format(order.total)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        ORDER_STATUS_BADGE[order.status],
                        'border border-transparent',
                      )}
                    >
                      {ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatLima(order.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Pagination
            page={query.data.meta.page}
            totalPages={query.data.meta.totalPages}
            onPageChange={onPageChange}
          />
        </div>
      ) : null}
    </div>
  )
}