import { useState } from 'react'
import { Inbox, MapPin, ShieldCheck } from 'lucide-react'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCoupons } from '@/features/coupons/hooks'
import {
  formatCouponDiscount,
  getEffectiveStatus,
} from '@/features/coupons/coupon-utils'
import {
  COUPON_ORIGIN_LABELS,
  COUPON_STATUS_BADGE,
  COUPON_STATUS_LABELS,
} from '@/features/coupons/status'
import { formatLima } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { RoleChangeDialog } from './RoleChangeDialog'
import { USER_ROLE_BADGE, USER_ROLE_LABELS, formatTotalSpent } from './users-utils'
import type { AdminUser } from './types'

const COUPONS_PAGE_SIZE = 5

interface UserDetailDialogProps {
  user: AdminUser | null
  onOpenChange: (open: boolean) => void
}

/**
 * Detalle de un usuario (modal). Muestra el perfil completo que trae
 * GET /users (sin password), sus cupones (GET /coupons?userId=X — filtro que
 * el backend agregó y desbloquea el ítem pendiente del módulo 6) y un acceso
 * directo al cambio de rol (RoleChangeDialog compartido).
 *
 * BLOQUEADO (declarado, no simulado): el backend NO expone un endpoint admin
 * para ver las direcciones de OTRO usuario — los endpoints de direcciones son
 * todos /users/me/addresses (solo del usuario autenticado). Requiere un cambio
 * en el backend (ej. GET /users/:id/addresses con rol admin).
 */
export function UserDetailDialog({ user, onOpenChange }: UserDetailDialogProps) {
  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      {user ? (
        <UserDetailContent
          key={user.id}
          user={user}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </Dialog>
  )
}

/**
 * Contenido del modal. Se monta con `key={user.id}` desde UserDetailDialog:
 * al cambiar de usuario React remonta el componente y todo el estado local
 * (página de cupones, dialog de rol) arranca fresco — sin useEffect ni
 * setState en efecto (regla react-hooks/set-state-in-effect).
 */
function UserDetailContent({
  user,
  onOpenChange,
}: {
  user: AdminUser
  onOpenChange: (open: boolean) => void
}) {
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [couponsPage, setCouponsPage] = useState(1)

  const couponsQuery = useCoupons(
    couponsPage,
    COUPONS_PAGE_SIZE,
    undefined,
    user.id,
  )

  return (
    <>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{user.fullName}</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {user.id}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Perfil */}
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Email</p>
              <p className="text-sm">{user.email}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Teléfono</p>
              <p className="text-sm">{user.phone ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Rol</p>
              <div className="flex items-center gap-2">
                <Badge
                  className={cn(
                    USER_ROLE_BADGE[user.role],
                    'border border-transparent',
                  )}
                >
                  {USER_ROLE_LABELS[user.role]}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRoleDialogOpen(true)}
                >
                  <ShieldCheck />
                  Cambiar rol
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Total gastado</p>
              <p className="text-sm font-medium">
                {formatTotalSpent(user.totalSpent)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Registro</p>
              <p className="text-sm">
                {formatLima(user.createdAt, 'dd/MM/yyyy')}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Cuenta</p>
              <p className="text-sm">
                {user.provider === 'google' ? 'Google' : 'Email + contraseña'}
              </p>
            </div>
          </section>

          {/* Direcciones — BLOQUEADO por contrato */}
          <section className="bg-muted/40 border-border rounded-lg border border-dashed p-4">
            <div className="flex items-start gap-3">
              <MapPin className="text-muted-foreground mt-0.5 size-4" />
              <div>
                <p className="text-sm font-medium">Direcciones guardadas</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  No disponible: el backend no expone un endpoint admin para
                  ver las direcciones de otro usuario (solo{' '}
                  <span className="font-mono">/users/me/addresses</span>, del
                  propio autenticado). Requiere un cambio en el backend (ej.{' '}
                  <span className="font-mono">GET /users/:id/addresses</span>{' '}
                  con rol admin).
                </p>
              </div>
            </div>
          </section>

          {/* Cupones del usuario */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Cupones de este usuario</h3>

            {couponsQuery.isLoading ? (
              <LoadingState label="Cargando cupones…" />
            ) : couponsQuery.isError ? (
              <ErrorState
                title="No se pudieron cargar los cupones"
                description="Revisa tu conexión y vuelve a intentar."
                onRetry={() => couponsQuery.refetch()}
              />
            ) : couponsQuery.data && couponsQuery.data.items.length === 0 ? (
              <div className="bg-muted/40 border-border flex items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-sm">
                <Inbox className="text-muted-foreground size-4" />
                <p className="text-muted-foreground">
                  Este usuario no tiene cupones.
                </p>
              </div>
            ) : couponsQuery.data ? (
              <div className="bg-card border-border overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descuento</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Origen</TableHead>
                      <TableHead>Expiración</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {couponsQuery.data.items.map((coupon) => {
                      const effective = getEffectiveStatus(
                        coupon.status,
                        coupon.expiresAt,
                        new Date(),
                      )
                      return (
                        <TableRow key={coupon.id}>
                          <TableCell className="font-mono text-sm font-semibold">
                            {coupon.code}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatCouponDiscount(
                              coupon.discountType,
                              coupon.discountValue,
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={cn(
                                COUPON_STATUS_BADGE[effective],
                                'border border-transparent',
                              )}
                            >
                              {COUPON_STATUS_LABELS[effective]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {COUPON_ORIGIN_LABELS[coupon.origin]}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatLima(coupon.expiresAt, 'dd/MM/yyyy')}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                <Pagination
                  page={couponsQuery.data.meta.page}
                  totalPages={couponsQuery.data.meta.totalPages}
                  onPageChange={setCouponsPage}
                />
              </div>
            ) : null}
          </section>
        </div>
      </DialogContent>

      <RoleChangeDialog
        open={roleDialogOpen}
        onOpenChange={setRoleDialogOpen}
        userId={user.id}
        userName={user.fullName}
        currentRole={user.role}
        onSuccess={() => onOpenChange(false)}
      />
    </>
  )
}