import { lazy, Suspense, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Inbox, MapPin, Plus } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Pagination } from '@/components/ui/Pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getApiMessage } from '@/lib/api-errors'
import { formatLima } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useOrder, useOrders } from './hooks'
import { mergeOrderAfterUpdate } from './merge'
import { OrderDetailDialog } from './OrderDetailDialog'
import { orderCustomer } from './orders-utils'
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABELS } from './status'
import type { Order, OrderStatus } from './types'

/**
 * Columna "Cliente": ID corto si tiene cuenta (como siempre); nombre + badge
 * "Sin cuenta" si es un pedido manual anónimo (userId null).
 */
function CustomerCell({ order }: { order: Order }) {
  const customer = orderCustomer(order)
  if (!customer.isAnonymous) {
    return (
      <TableCell className="font-mono text-xs">{customer.shortLabel}</TableCell>
    )
  }
  return (
    <TableCell className="text-sm">
      <div className="flex items-center gap-2">
        <span>{customer.name ?? '—'}</span>
        <Badge variant="outline" className="text-xs">
          {customer.shortLabel}
        </Badge>
      </div>
    </TableCell>
  )
}

// Lazy: Leaflet (~150 KB) solo se descarga al abrir el cotizador.
const DeliveryCalculator = lazy(() =>
  import('./components/DeliveryCalculator').then((m) => ({
    default: m.DeliveryCalculator,
  })),
)

const PAGE_SIZE = 10

const CURRENCY = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const STATUS_FILTERS: { value: OrderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'pendiente', label: ORDER_STATUS_LABELS.pendiente },
  { value: 'confirmado', label: ORDER_STATUS_LABELS.confirmado },
  { value: 'en_camino', label: ORDER_STATUS_LABELS.en_camino },
  { value: 'entregado', label: ORDER_STATUS_LABELS.entregado },
  { value: 'cancelado', label: ORDER_STATUS_LABELS.cancelado },
]

/**
 * Pedidos — MÓDULO 5. Listado paginado (GET /orders) con filtro por estado,
 * detalle en diálogo y transiciones de estado válidas (PATCH /orders/:id/status).
 */
export default function OrdersPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [calculatorOpen, setCalculatorOpen] = useState(false)

  // /orders?order=<id>: abre el detalle de ese pedido (ej. recién creado
  // desde "Crear pedido manual"). Se pide con GET /orders/:id porque puede
  // no estar en la página/filtro actual de la lista.
  const [searchParams, setSearchParams] = useSearchParams()
  const orderParam = searchParams.get('order')
  const linkedOrderQuery = useOrder(orderParam)
  const [openedParam, setOpenedParam] = useState<string | null>(null)
  if (orderParam && linkedOrderQuery.data && openedParam !== orderParam) {
    // Ajuste de estado durante el render (patrón de React para derivar de
    // props/URL) en vez de un efecto: se ejecuta una sola vez por id.
    setOpenedParam(orderParam)
    setSelectedOrder(linkedOrderQuery.data)
    setDialogOpen(true)
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open)
    if (!open && orderParam) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('order')
        return next
      })
    }
  }

  const ordersQuery = useOrders(
    page,
    PAGE_SIZE,
    statusFilter === 'all' ? undefined : statusFilter,
  )

  function handleFilterChange(value: string) {
    setStatusFilter(value as OrderStatus | 'all')
    setPage(1) // el filtro cambia el universo de resultados → volver a la página 1
  }

  function openOrder(order: Order) {
    setSelectedOrder(order)
    setDialogOpen(true)
  }

  const { data, isLoading, isError, refetch } = ordersQuery

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pedidos</h1>
          <p className="text-muted-foreground text-sm">
            Consulta y gestiona el estado de los pedidos de la app.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link to="/orders/create-manual">
              <Plus className="size-4" />
              Crear pedido manual
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setCalculatorOpen(true)}>
            <MapPin className="size-4" />
            Cotizar delivery
          </Button>
          <Select value={statusFilter} onValueChange={handleFilterChange}>
            <SelectTrigger
              className="w-full sm:w-52"
              aria-label="Filtrar por estado"
            >
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {orderParam && linkedOrderQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo abrir el pedido</AlertTitle>
          <AlertDescription>
            {getApiMessage(linkedOrderQuery.error, 'Revisa tu conexión y vuelve a intentar.')}
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <LoadingState label="Cargando pedidos…" />
      ) : isError ? (
        <ErrorState
          title="No se pudieron cargar los pedidos"
          description='Revisa tu conexión y vuelve a intentar.'
          onRetry={() => refetch()}
        />
      ) : data && data.items.length === 0 ? (
        <div className="bg-card border-border flex flex-col items-center gap-3 rounded-xl border px-6 py-14 text-center">
          <Inbox className="text-celtas-orange size-8" />
          <div>
            <p className="font-medium">No hay pedidos</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {statusFilter === 'all'
                ? 'Cuando lleguen pedidos desde la app, aparecerán aquí.'
                : `No hay pedidos con estado "${ORDER_STATUS_LABELS[statusFilter]}".`}
            </p>
          </div>
        </div>
      ) : data ? (
        <div className="bg-card border-border overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-xs">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </TableCell>
                  <CustomerCell order={order} />
                  <TableCell className="text-sm">
                    {order.items.length} producto
                    {order.items.length === 1 ? '' : 's'}
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
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openOrder(order)}
                    >
                      Ver detalle
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            onPageChange={setPage}
          />
        </div>
      ) : null}

      <OrderDetailDialog
        order={selectedOrder}
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        onOrderUpdated={(updated) =>
          // El PATCH devuelve el pedido SIN items (se guarda sin relaciones):
          // mergeOrderAfterUpdate conserva los items del detalle abierto y
          // solo actualiza status/deliveredAt/updatedAt. Ver merge.ts.
          setSelectedOrder((prev) =>
            prev ? mergeOrderAfterUpdate(prev, updated) : updated,
          )
        }
      />

      <Dialog open={calculatorOpen} onOpenChange={setCalculatorOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cotizar delivery</DialogTitle>
            <DialogDescription>
              Busca la dirección del cliente o marca la ubicación en el mapa.
            </DialogDescription>
          </DialogHeader>
          {calculatorOpen ? (
            <Suspense fallback={<LoadingState label="Cargando mapa…" />}>
              <DeliveryCalculator allowManualPin />
            </Suspense>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
