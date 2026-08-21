import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { UserAddressesSection } from './UserAddressesSection'
import { UserOrdersSection } from './UserOrdersSection'
import { useUserAddresses, useUserOrders } from './hooks'
import { USER_ROLE_BADGE, USER_ROLE_LABELS, formatTotalSpent } from './users-utils'
import type { AdminUser } from './types'

const COUPONS_PAGE_SIZE = 5
const ORDERS_PAGE_SIZE = 5

interface UserDetailDialogProps {
  user: AdminUser | null
  onOpenChange: (open: boolean) => void
}

/**
 * Vista 360 del cliente (modal). Tabs con:
 * - Perfil: datos de GET /users (sin password) + cambio de rol.
 * - Direcciones: GET /users/:id/addresses (admin, array plano).
 * - Cupones: GET /coupons?userId=X (filtro agregado por el backend).
 * - Pedidos: GET /orders?userId=X (filtro agregado por el backend).
 *
 * El contenido se monta con `key={user.id}`: al cambiar de usuario React
 * remonta todo y cada query arranca con el userId correcto — sin riesgo de
 * mostrar datos de otro usuario (mismo patrón que el fix de la paginación
 * de cupones).
 *
 * **Scroll interno (bug de clase, no exclusivo de este modal)**: `DialogContent`
 * (`components/ui/dialog.tsx`) no define `max-height`/`overflow-y-auto` — pasaba
 * desapercibido porque el contenido de las tabs era corto, pero con el mapa
 * nuevo de Direcciones (~200px por tarjeta) 4+ direcciones exceden la altura
 * del viewport. Confirmado con evidencia real (medición de
 * `getBoundingClientRect()` en un navegador real, no jsdom): con 5 direcciones
 * con mapa, el diálogo medía 2522px en un viewport de 855px — como
 * `DialogContent` es `position: fixed` centrado con `translate(-50%,-50%)` y
 * sin contenedor con overflow, ni el header ni el final del contenido eran
 * alcanzables (no hay scroll real posible, a diferencia de lo que sugeriría
 * simplemente "se corta abajo"). Cupones/Pedidos (5 ítems paginados, filas de
 * tabla compactas) NO tienen este problema — confirmado con la misma medición
 * (288.8px de diálogo, cabe entero). Fix acotado a este componente vía
 * className (no se tocó `dialog.tsx` compartido): `DialogContent` con
 * `flex max-h-[85vh] flex-col overflow-hidden`, `Tabs` con `flex-1 min-h-0`,
 * y cada `TabsContent` con `min-h-0 overflow-y-auto` — el header y la lista de
 * tabs quedan fijos arriba, solo el contenido de la tab activa scrollea. Sin
 * test unitario: es un fix de layout/CSS puro (jsdom no calcula dimensiones
 * reales de caja), verificado visualmente con capturas y mediciones reales de
 * `getBoundingClientRect()` en un harness temporal (no commiteado).
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

function UserDetailContent({
  user,
  onOpenChange,
}: {
  user: AdminUser
  onOpenChange: (open: boolean) => void
}) {
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [couponsPage, setCouponsPage] = useState(1)
  const [ordersPage, setOrdersPage] = useState(1)

  const couponsQuery = useCoupons(
    couponsPage,
    COUPONS_PAGE_SIZE,
    undefined,
    user.id,
  )
  const addressesQuery = useUserAddresses(user.id)
  const ordersQuery = useUserOrders(ordersPage, ORDERS_PAGE_SIZE, user.id)

  return (
    <>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{user.fullName}</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {user.id}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="perfil" className="min-h-0 flex-1">
          <TabsList className="w-full shrink-0">
            <TabsTrigger value="perfil" className="flex-1">
              Perfil
            </TabsTrigger>
            <TabsTrigger value="direcciones" className="flex-1">
              Direcciones
            </TabsTrigger>
            <TabsTrigger value="cupones" className="flex-1">
              Cupones
            </TabsTrigger>
            <TabsTrigger value="pedidos" className="flex-1">
              Pedidos
            </TabsTrigger>
          </TabsList>

          {/* Perfil */}
          <TabsContent value="perfil" className="mt-4 min-h-0 overflow-y-auto">
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
          </TabsContent>

          {/* Direcciones */}
          <TabsContent value="direcciones" className="mt-4 min-h-0 overflow-y-auto">
            <UserAddressesSection query={addressesQuery} />
          </TabsContent>

          {/* Cupones */}
          <TabsContent value="cupones" className="mt-4 min-h-0 overflow-y-auto">
            <div className="space-y-3">
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
            </div>
          </TabsContent>

          {/* Pedidos */}
          <TabsContent value="pedidos" className="mt-4 min-h-0 overflow-y-auto">
            <UserOrdersSection
              query={ordersQuery}
              onPageChange={setOrdersPage}
            />
          </TabsContent>
        </Tabs>
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