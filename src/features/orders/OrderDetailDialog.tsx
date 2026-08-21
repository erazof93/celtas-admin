import { useState } from 'react'
import { MessageCircle, TriangleAlert } from 'lucide-react'
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
import { useSettings } from '../settings/hooks'
import {
  DELIVERY_ALERT_RADIUS_METERS_KEY,
  parseDeliveryAlertRadiusMeters,
  parseStoreLocation,
  STORE_LOCATION_KEY,
} from '../settings/settings-utils'
import { buildAddressMapUrl, buildGoogleMapsUrl } from '../users/users-utils'
import { digitsOnly, isFarOrder, orderDistanceMeters, orderSubtotal } from './orders-utils'
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
  const settingsQuery = useSettings()
  const [transitionError, setTransitionError] = useState<string | null>(null)

  const geoapifyApiKey = import.meta.env.VITE_GEOAPIFY_API_KEY as
    | string
    | undefined

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

  // Distancia recalculada del lado del cliente (el backend no la expone en
  // la respuesta del pedido, ver orders-utils.ts). Sin store_location
  // configurado o sin coordenadas en la dirección del pedido → sin badge,
  // nunca se inventa un estado "lejano".
  const storeLocation = parseStoreLocation(
    settingsQuery.data?.find((s) => s.key === STORE_LOCATION_KEY)?.value,
  )
  const alertRadiusMeters = settingsQuery.data
    ? parseDeliveryAlertRadiusMeters(
        settingsQuery.data.find((s) => s.key === DELIVERY_ALERT_RADIUS_METERS_KEY)
          ?.value,
      )
    : null
  const distanceMeters = orderDistanceMeters(address, storeLocation)
  const showFarBadge = order ? isFarOrder(distanceMeters, alertRadiusMeters) : false

  const addressLat = typeof address?.latitude === 'number' ? address.latitude : null
  const addressLng = typeof address?.longitude === 'number' ? address.longitude : null
  const customerPhoneDigits = order?.user.phone ? digitsOnly(order.user.phone) : null
  const subtotal = order ? orderSubtotal(order) : 0

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
                {showFarBadge ? (
                  <Badge className="bg-celtas-red/15 text-celtas-red-light flex items-center gap-1 border border-transparent">
                    <TriangleAlert className="size-3" />
                    Fuera de zona habitual
                  </Badge>
                ) : null}
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
                        {item.selectedSauces !== null ? (
                          <p className="text-muted-foreground text-xs italic">
                            {item.selectedSauces.length > 0
                              ? `Salsas: ${item.selectedSauces.join(', ')}`
                              : 'Sin salsas'}
                          </p>
                        ) : null}
                        {item.comment !== null ? (
                          <p className="text-muted-foreground text-xs italic">
                            Comentario: {item.comment}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 font-medium">
                        {CURRENCY.format(item.subtotal)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="border-border space-y-1 border-t px-3 py-2 text-sm">
                  <div className="text-muted-foreground flex items-center justify-between">
                    <span>Subtotal</span>
                    <span>{CURRENCY.format(subtotal)}</span>
                  </div>
                  <div className="text-muted-foreground flex items-center justify-between">
                    <span>Envío</span>
                    <span>{CURRENCY.format(order.deliveryFee)}</span>
                  </div>
                  <div className="flex items-center justify-between font-semibold">
                    <span>Total</span>
                    <span className="text-celtas-gold">
                      {CURRENCY.format(order.total)}
                    </span>
                  </div>
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
                  {addressLat !== null && addressLng !== null && geoapifyApiKey ? (
                    <a
                      href={buildGoogleMapsUrl(addressLat, addressLng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir en Google Maps"
                      aria-label="Abrir en Google Maps"
                      className="border-border group mt-2 block overflow-hidden rounded-lg border"
                    >
                      <img
                        src={buildAddressMapUrl(addressLat, addressLng, geoapifyApiKey)}
                        alt="Mapa de la dirección de entrega"
                        className="block w-full cursor-pointer transition-opacity group-hover:opacity-80"
                        width={400}
                        height={200}
                        loading="lazy"
                      />
                    </a>
                  ) : null}
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

                {/*
                  Distinto de "Abrir en WhatsApp" de arriba (order.whatsappUrl,
                  el mensaje del PEDIDO hacia la tienda). Este es un chat
                  directo con el cliente, sin mensaje prellenado — oculto si
                  no tiene teléfono registrado (campo opcional).
                */}
                {customerPhoneDigits ? (
                  <Button asChild variant="outline" className="w-full">
                    <a
                      href={`https://wa.me/${customerPhoneDigits}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle />
                      Contactar al cliente por WhatsApp
                    </a>
                  </Button>
                ) : null}
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