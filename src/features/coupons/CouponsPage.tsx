import { useState } from 'react'
import { Inbox, Plus } from 'lucide-react'
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
import { formatLima } from '@/lib/dates'
import { cn } from '@/lib/utils'
import {
  formatCouponDiscount,
  formatMinPurchaseAmount,
  getDaysUntilExpiry,
  getEffectiveStatus,
} from './coupon-utils'
import { GenerateCouponForm } from './GenerateCouponForm'
import { useCoupons } from './hooks'
import { COUPON_ORIGIN_LABELS, COUPON_STATUS_BADGE, COUPON_STATUS_LABELS } from './status'
import type { Coupon, CouponStatus } from './types'

const PAGE_SIZE = 10

const STATUS_FILTERS: { value: CouponStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'active', label: COUPON_STATUS_LABELS.active },
  { value: 'used', label: COUPON_STATUS_LABELS.used },
  { value: 'expired', label: COUPON_STATUS_LABELS.expired },
]

/**
 * Celda "Descuento": valor del descuento + línea secundaria con el monto
 * mínimo de compra SOLO si existe (null/0 = sin mínimo → no se muestra nada,
 * ni siquiera un <p> vacío).
 */
function DiscountCell({ coupon }: { coupon: Coupon }) {
  const minText = formatMinPurchaseAmount(coupon.minPurchaseAmount)
  return (
    <TableCell className="text-sm">
      <p>{formatCouponDiscount(coupon.discountType, coupon.discountValue)}</p>
      {minText ? (
        <p className="text-muted-foreground text-xs">{minText}</p>
      ) : null}
    </TableCell>
  )
}

/** Texto de la columna "Expiración" según el estado efectivo y los días restantes. */
function ExpiryCell({ coupon }: { coupon: { status: CouponStatus; expiresAt: string } }) {
  const now = new Date()
  const effective = getEffectiveStatus(coupon.status, coupon.expiresAt, now)

  if (effective === 'expired') {
    return (
      <span className="text-celtas-red-light text-sm">Expirado</span>
    )
  }

  const daysLeft = getDaysUntilExpiry(coupon.expiresAt, now)
  return (
    <div className="text-sm">
      <p>{formatLima(coupon.expiresAt, 'dd/MM/yyyy')}</p>
      <p className="text-muted-foreground text-xs">
        {daysLeft === 0 ? 'Hoy' : `En ${daysLeft} día${daysLeft === 1 ? '' : 's'}`}
      </p>
    </div>
  )
}

/**
 * Cupones — MÓDULO 6. Listado paginado (GET /coupons) con filtro por estado,
 * generación manual de campañas (POST /coupons/generate).
 *
 * NOTA de contrato: el backend NO expone un endpoint para ver los cupones de
 * un usuario específico desde el panel admin (GET /coupons no filtra por
 * userId y GET /coupons/me es solo del usuario autenticado). Ese item del
 * ROADMAP queda pendiente de un cambio en el backend.
 */
export default function CouponsPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<CouponStatus | 'all'>('all')
  const [generateOpen, setGenerateOpen] = useState(false)

  const couponsQuery = useCoupons(
    page,
    PAGE_SIZE,
    statusFilter === 'all' ? undefined : statusFilter,
  )

  function handleFilterChange(value: string) {
    setStatusFilter(value as CouponStatus | 'all')
    setPage(1) // el filtro cambia el universo de resultados → volver a la página 1
  }

  const { data, isLoading, isError, refetch } = couponsQuery

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cupones</h1>
          <p className="text-muted-foreground text-sm">
            Genera cupones de campaña y consulta los cupones de los clientes.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={statusFilter} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Filtrar por estado">
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
          <Button onClick={() => setGenerateOpen(true)}>
            <Plus />
            Generar cupón
          </Button>
        </div>
      </header>

      {isLoading ? (
        <LoadingState label="Cargando cupones…" />
      ) : isError ? (
        <ErrorState
          title="No se pudieron cargar los cupones"
          description="Revisa tu conexión y vuelve a intentar."
          onRetry={() => refetch()}
        />
      ) : data && data.items.length === 0 ? (
        <div className="bg-card border-border flex flex-col items-center gap-3 rounded-xl border px-6 py-14 text-center">
          <Inbox className="text-celtas-orange size-8" />
          <div>
            <p className="font-medium">No hay cupones</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {statusFilter === 'all'
                ? 'Genera un cupón de campaña o espera a que se generen automáticamente.'
                : `No hay cupones con estado "${COUPON_STATUS_LABELS[statusFilter]}".`}
            </p>
          </div>
        </div>
      ) : data ? (
        <div className="bg-card border-border overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Descuento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Expiración</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((coupon) => (
                <TableRow key={coupon.id}>
                  <TableCell className="font-mono text-sm font-semibold">
                    {coupon.code}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {coupon.userId.slice(0, 8).toUpperCase()}
                  </TableCell>
                  <DiscountCell coupon={coupon} />
                  <TableCell>
                    <Badge
                      className={cn(
                        COUPON_STATUS_BADGE[coupon.status],
                        'border border-transparent',
                      )}
                    >
                      {COUPON_STATUS_LABELS[coupon.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {COUPON_ORIGIN_LABELS[coupon.origin]}
                  </TableCell>
                  <TableCell>
                    <ExpiryCell coupon={coupon} />
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

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Generar cupón de campaña</DialogTitle>
            <DialogDescription>
              Crea un cupón manual para un cliente específico. No depende del
              umbral de gasto.
            </DialogDescription>
          </DialogHeader>
          <GenerateCouponForm onClose={() => setGenerateOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}