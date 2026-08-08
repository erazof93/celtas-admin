import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getApiMessage } from '@/lib/api-errors'
import { formatLima } from '@/lib/dates'
import { cn } from '@/lib/utils'
import {
  ORDER_STATUS_BADGE,
  ORDER_STATUS_LABELS,
  TRANSITION_ACTION_LABELS,
  VALID_ORDER_TRANSITIONS,
} from './status'
import { useUpdateOrderStatus } from './hooks'
import type { AddressSnapshot, Order, OrderStatus } from './types'

const CURRENCY = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Parsea el JSON de addressSnapshot (defensivo: si no es JSON, muestra el texto crudo). */
function parseAddress(snapshot: string): AddressSnapshot | null {
  try {
    return JSON.parse(snapshot) as AddressSnapshot
  } catch {
    return null
  }
}

interface OrderDetailDialogProps {
  order: Order | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Recibe el pedido actualizado tras un cambio de estado (para no perder el detalle). */
  onOrderUpdated: (order: Order) => void
}

/**
 * Detalle de un pedido: items del snapshot (nombre/cantidad/precio del momento
 * del pedido), dirección del snapshot, total, link de WhatsApp y las
 * transiciones de estado VÁLIDAS desde el estado actual (solo esas).
 */
export function OrderDetailDialog({
  order,
  open,
  onOpenChange,
  onOrderUpdated,
}: OrderDetailDialogProps) {
  const updateStatus = useUpdateOrderStatus()
  const [transitionError, setTransitionError] = useState<string | null>(null)

  async function handleTransition(next: OrderStatus) {
    if (!order) return
    setTransitionError(null)
    try {
      const updated = await updateStatus.mutateAsync({
        id: order.id,
        status: next,
      })
      onOrderUpdated(updated)
    } catch (error) {
      setTransitionError(
        getApiMessage(error, 'No se pudo cambiar el estado del pedido'),
      )
    }
  }

  const transitions = order ? VALID_ORDER_TRANSITIONS[order.status] : []
  const address = order ? parseAddress(order.addressSnapshot) : null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setTransitionError(null)
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        {order ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <DialogTitle>
                  Pedido #{order.id.slice(0, 8).toUpperCase()}
                </DialogTitle>
                <Badge
                  className={cn(
                    ORDER_STATUS_BADGE[order.status],
                    'border border-transparent',
                  )}
                >
                  {ORDER_STATUS_LABELS[order.status]}
                </Badge>
              </div>
              <DialogDescription>
                Creado el {formatLima(order.createdAt)} · Cliente{' '}
                {order.userId.slice(0, 8).toUpperCase()}
              </DialogDescription>
            </DialogHeader>

            {transitionError ? (
              <Alert variant="destructive">
                <AlertTitle>No se pudo cambiar el estado</AlertTitle>
                <AlertDescription>{transitionError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Items del pedido (snapshot del momento del pedido). */}
              <div className="border-border rounded-lg border">
                <p className="border-border border-b px-3 py-2 text-sm font-medium">
                  Productos
                </p>
                <ul className="divide-y divide-border">
                  {order.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {item.quantity} x {CURRENCY.format(item.unitPrice)}
                        </p>
                      </div>
                      <span className="shrink-0 font-medium">
                        {CURRENCY.format(item.subtotal)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="border-border flex items-center justify-between border-t px-3 py-2 text-sm font-semibold">
                  <span>Total</span>
                  <span className="text-celtas-gold">
                    {CURRENCY.format(order.total)}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                {/* Dirección del snapshot (no la actual del usuario). */}
                <div className="border-border rounded-lg border p-3">
                  <p className="text-sm font-medium">Dirección de entrega</p>
                  {address ? (
                    <dl className="text-muted-foreground mt-2 space-y-1 text-sm">
                      {address.alias ? (
                        <div>
                          <dt className="inline text-xs">Alias: </dt>
                          <dd className="inline">{address.alias}</dd>
                        </div>
                      ) : null}
                      <p className="text-celtas-cream">
                        {address.fullAddress}
                        {address.district ? `, ${address.district}` : ''}
                      </p>
                      {address.reference ? (
                        <p className="text-xs">
                          Ref: {address.reference}
                        </p>
                      ) : null}
                    </dl>
                  ) : (
                    <p className="text-muted-foreground mt-2 text-sm">
                      {order.addressSnapshot}
                    </p>
                  )}
                </div>

                <div className="border-border rounded-lg border p-3 text-sm">
                  <dl className="space-y-1">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Cliente (ID)</dt>
                      <dd className="font-mono text-xs pt-0.5">
                        {order.userId}
                      </dd>
                    </div>
                    {order.deliveredAt ? (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Entregado</dt>
                        <dd>{formatLima(order.deliveredAt)}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>

                <Button asChild variant="outline" className="w-full">
                  <a
                    href={order.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle />
                    Abrir en WhatsApp
                  </a>
                </Button>
              </div>
            </div>

            {/* Transiciones: SOLO las válidas desde el estado actual. */}
            <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <span className="text-muted-foreground text-sm">
                Cambiar estado:
              </span>
              {transitions.length === 0 ? (
                <span className="text-muted-foreground text-sm">
                  Este pedido no tiene transiciones disponibles.
                </span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {transitions.map((next) =>
                    next === 'cancelado' ? (
                      <Button
                        key={next}
                        variant="destructive"
                        onClick={() => handleTransition(next)}
                        disabled={updateStatus.isPending}
                      >
                        {TRANSITION_ACTION_LABELS[next]}
                      </Button>
                    ) : (
                      <Button
                        key={next}
                        onClick={() => handleTransition(next)}
                        disabled={updateStatus.isPending}
                        className={
                          next === 'entregado'
                            ? 'bg-emerald-600 hover:bg-emerald-600/80 text-white'
                            : undefined
                        }
                      >
                        {TRANSITION_ACTION_LABELS[next]}
                      </Button>
                    ),
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle>Pedido no disponible</DialogTitle>
            <DialogDescription>
              El pedido ya no está en la lista actual.
            </DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  )
}