import { useEffect, useState } from 'react'
import { CheckCircle2, Inbox, Link2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { getApiMessage, isConflict } from '@/lib/api-errors'
import { formatLima } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABELS } from '@/features/orders/status'
import { useAnonymousOrders, useLinkAnonymousOrders } from './hooks'
import type { LinkAnonymousOrdersResult } from './types'

const CURRENCY = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const SUCCESS_MESSAGE_MS = 2000

interface AnonymousOrdersSectionProps {
  userId: string
  /**
   * Se llama con la respuesta del POST. El backend devuelve el `totalSpent`
   * ya actualizado (no el cliente completo): el padre lo usa para refrescar
   * "Total gastado" sin cerrar/reabrir el diálogo.
   */
  onLinked?: (result: LinkAnonymousOrdersResult) => void
}

/**
 * "Pedidos sin cuenta con este celular" (detalle del cliente). Preview con
 * GET /users/:id/anonymous-orders y vinculación con UN POST
 * /users/:id/link-anonymous-orders con los `orderIds` marcados (todo o nada).
 * El teléfono solo no prueba identidad: el admin elige explícitamente cuáles
 * vincular, nada viene preseleccionado.
 *
 * Tras vincular, la invalidación de ['users'] refresca el preview (los
 * vinculados ya no son anónimos y desaparecen de la lista). En 409 (algún
 * pedido dejó de ser vinculable, p. ej. otro admin lo vinculó) se muestra el
 * mensaje del backend y se refresca el preview.
 */
export function AnonymousOrdersSection({
  userId,
  onLinked,
}: AnonymousOrdersSectionProps) {
  const query = useAnonymousOrders(userId)
  const linkMutation = useLinkAnonymousOrders()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!successMessage) return
    const timer = setTimeout(
      () => setSuccessMessage(null),
      SUCCESS_MESSAGE_MS,
    )
    return () => clearTimeout(timer)
  }, [successMessage])

  const orders = query.data?.orders ?? []
  // Solo cuenta lo marcado que sigue en la lista actual (tras un refetch).
  const selectedIds = orders.map((o) => o.id).filter((id) => selected.has(id))
  const allSelected = orders.length > 0 && selectedIds.length === orders.length

  function toggle(id: string, checked: boolean) {
    setSuccessMessage(null)
    linkMutation.reset()
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSuccessMessage(null)
    linkMutation.reset()
    setSelected(checked ? new Set(orders.map((o) => o.id)) : new Set())
  }

  function handleLink() {
    if (selectedIds.length === 0) return
    setSuccessMessage(null)
    linkMutation.mutate(
      { userId, orderIds: selectedIds },
      {
        onSuccess: (result) => {
          setSelected(new Set())
          setSuccessMessage('Vinculados correctamente ✅')
          onLinked?.(result)
        },
        onError: (error) => {
          if (isConflict(error)) void query.refetch()
        },
      },
    )
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Pedidos sin cuenta con este celular</h3>

      {successMessage ? (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-emerald-400"
        >
          <CheckCircle2 className="size-4" />
          {successMessage}
        </p>
      ) : null}

      {query.isLoading ? (
        <LoadingState label="Buscando pedidos sin cuenta…" />
      ) : query.isError ? (
        <ErrorState
          title="No se pudieron cargar los pedidos sin cuenta"
          description={getApiMessage(
            query.error,
            'Revisa tu conexión y vuelve a intentar.',
          )}
          onRetry={() => query.refetch()}
        />
      ) : orders.length === 0 ? (
        <div className="bg-muted/40 border-border flex items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-sm">
          <Inbox className="text-muted-foreground size-4" />
          <p className="text-muted-foreground">No hay pedidos sin cuenta.</p>
        </div>
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            Pedidos manuales tomados con el celular {query.data?.phone}. Confirma
            con el cliente cuáles son suyos antes de vincularlos.
          </p>
          <div className="bg-card border-border overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Seleccionar todos"
                      checked={allSelected}
                      onCheckedChange={(c) => toggleAll(c === true)}
                      disabled={linkMutation.isPending}
                    />
                  </TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const code = `#${order.id.slice(0, 8).toUpperCase()}`
                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Checkbox
                          aria-label={`Seleccionar pedido ${code}`}
                          checked={selected.has(order.id)}
                          onCheckedChange={(c) => toggle(order.id, c === true)}
                          disabled={linkMutation.isPending}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{code}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatLima(order.createdAt, 'dd/MM/yyyy')}
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
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {linkMutation.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {getApiMessage(
                linkMutation.error,
                'No se pudieron vincular los pedidos.',
              )}
            </p>
          ) : null}

          <Button
            onClick={handleLink}
            disabled={selectedIds.length === 0 || linkMutation.isPending}
          >
            <Link2 />
            {linkMutation.isPending
              ? 'Vinculando…'
              : `Vincular seleccionados (${selectedIds.length})`}
          </Button>
        </>
      )}
    </div>
  )
}
