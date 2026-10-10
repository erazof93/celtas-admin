import { useRef, useState } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { Check, Clock, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { formatLima } from '@/lib/dates'
import { getApiMessage } from '@/lib/api-errors'
import { useAuthStore } from '@/features/auth/store'
import { usePendingOrders, useUpdateOrderStatus } from './hooks'
import type { Order } from './types'

const currency = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

export function PendingOrdersTray({
  onDetail,
}: {
  onDetail: (order: Order) => void
}) {
  const query = usePendingOrders()
  const update = useUpdateOrderStatus()
  const busy = useIsMutating({ mutationKey: ['orders', 'status'] }) > 0
  const sending = useRef(false)
  const sessionId = useAuthStore((state) => state.sessionId)
  const sessionEnding = useAuthStore((state) => state.sessionEnding)
  const [notice, setNotice] = useState<{
    sessionId: number
    text: string
    error: boolean
  }>()
  if (sessionEnding) return null
  async function accept(order: Order) {
    if (
      sending.current ||
      busy ||
      order.status !== 'pendiente' ||
      query.isError ||
      query.accessBlocked
    )
      return
    sending.current = true
    setNotice(undefined)
    try {
      await update.mutateAsync({ id: order.id, status: 'confirmado' })
      if (
        useAuthStore.getState().sessionId === sessionId &&
        !useAuthStore.getState().sessionEnding
      )
        setNotice({
          sessionId,
          text: `Pedido #${order.id.slice(0, 8).toUpperCase()} confirmado.`,
          error: false,
        })
    } catch (error) {
      if (
        useAuthStore.getState().sessionId !== sessionId ||
        useAuthStore.getState().sessionEnding
      )
        return
      setNotice({
        sessionId,
        text: getApiMessage(
          error,
          'No se pudo aceptar el pedido. Puede haber cambiado de estado; actualiza la bandeja y vuelve a intentar.',
        ),
        error: true,
      })
      // A competing admin may already have changed its state. REST remains authoritative.
      void query.refetch({ cancelRefetch: false })
    } finally {
      sending.current = false
    }
  }
  return (
    <section
      aria-labelledby="pending-orders-title"
      className="border-celtas-orange/30 bg-card space-y-4 rounded-xl border p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="pending-orders-title"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <Clock className="text-celtas-orange size-5" /> Pedidos por aceptar
            <Badge
              variant="outline"
              aria-label="Cantidad de pedidos por aceptar"
            >
              {query.data?.items.length ?? '—'}
            </Badge>
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Los más antiguos primero. Aceptar cambia el estado a Confirmado.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetching}
          onClick={() => query.retryAccess()}
        >
          Actualizar bandeja
        </Button>
      </div>
      {notice?.sessionId === sessionId && (
        <Alert variant={notice.error ? 'destructive' : 'default'}>
          <AlertDescription role="status">{notice.text}</AlertDescription>
        </Alert>
      )}
      {query.accessBlocked ? (
        <ErrorState
          title="No se pudo autorizar la bandeja"
          onRetry={query.retryAccess}
        />
      ) : query.isLoading ? (
        <LoadingState label="Cargando pedidos por aceptar…" />
      ) : query.isError ? (
        <ErrorState
          title="No se pudo actualizar la bandeja"
          description={getApiMessage(
            query.error,
            'Revisa tu conexión y vuelve a intentar.',
          )}
          onRetry={query.retryAccess}
        />
      ) : null}
      {!query.accessBlocked &&
        query.data &&
        (query.data.items.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
            <Inbox className="size-5" /> No hay pedidos por aceptar.
          </p>
        ) : (
          <div className="grid max-h-[32rem] gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
            {query.data.items
              .filter((order) => order.status === 'pendiente')
              .map((order) => (
                <article
                  key={order.id}
                  aria-label={`Pedido #${order.id.slice(0, 8).toUpperCase()}`}
                  className="border-border flex flex-col gap-3 rounded-lg border p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className="font-semibold">
                      {currency.format(order.total)}
                    </span>
                  </div>
                  <time
                    dateTime={order.createdAt}
                    className="text-muted-foreground text-xs"
                  >
                    {formatLima(order.createdAt)}
                  </time>
                  <p className="text-sm">
                    {order.items
                      .slice(0, 3)
                      .map((item) => `${item.quantity} × ${item.name}`)
                      .join(' · ') || 'Consulta los productos en el detalle.'}
                    {order.items.length > 3
                      ? ` · +${order.items.length - 3} más`
                      : ''}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDetail(order)}
                    >
                      Ver detalle
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy || update.isPending || query.isError}
                      onClick={() => void accept(order)}
                    >
                      <Check className="size-4" />
                      {update.isPending && update.variables?.id === order.id
                        ? 'Aceptando…'
                        : 'Aceptar pedido'}
                    </Button>
                  </div>
                </article>
              ))}
          </div>
        ))}
    </section>
  )
}
