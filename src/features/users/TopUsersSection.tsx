import { useState } from 'react'
import { Inbox, TicketPercent } from 'lucide-react'
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
import { GenerateCouponForm } from '@/features/coupons/GenerateCouponForm'
import { formatLima } from '@/lib/dates'
import { useUsers } from './hooks'
import { formatTotalSpent } from './users-utils'
import type { AdminUser } from './types'

const PAGE_SIZE = 10

/**
 * Top usuarios por gasto total — GET /users?sortBy=totalSpent&order=desc
 * (contrato confirmado en QueryUsersDto vía /docs-json, generate:types
 * corrido antes de esta pantalla). Cada fila tiene un botón "Generar cupón"
 * que abre el formulario de cupón individual (no el de campaña) con el
 * userId de esa fila prellenado, para no tener que copiar el UUID a mano.
 */
export function TopUsersSection() {
  const [page, setPage] = useState(1)
  const [couponUser, setCouponUser] = useState<AdminUser | null>(null)

  const { data, isLoading, isError, refetch } = useUsers(
    page,
    PAGE_SIZE,
    'totalSpent',
    'desc',
  )

  return (
    <div className="space-y-4">
      {isLoading ? (
        <LoadingState label="Cargando top usuarios…" />
      ) : isError ? (
        <ErrorState
          title="No se pudo cargar el top de usuarios"
          description="Revisa tu conexión y vuelve a intentar."
          onRetry={() => refetch()}
        />
      ) : data && data.items.length === 0 ? (
        <div className="bg-card border-border flex flex-col items-center gap-3 rounded-xl border px-6 py-14 text-center">
          <Inbox className="text-celtas-orange size-8" />
          <div>
            <p className="font-medium">No hay usuarios</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Los clientes aparecen aquí al registrarse en la app.
            </p>
          </div>
        </div>
      ) : data ? (
        <div className="bg-card border-border overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Total gastado</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.fullName}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {user.email}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold">
                    {formatTotalSpent(user.totalSpent)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatLima(user.createdAt, 'dd/MM/yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCouponUser(user)}
                      aria-label={`Generar cupón para ${user.fullName}`}
                    >
                      <TicketPercent />
                      Generar cupón
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

      <Dialog
        open={Boolean(couponUser)}
        onOpenChange={(open) => {
          if (!open) setCouponUser(null)
        }}
      >
        {couponUser ? (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Generar cupón individual</DialogTitle>
              <DialogDescription>
                Cupón manual para{' '}
                <span className="font-semibold text-foreground">
                  {couponUser.fullName}
                </span>
                .
              </DialogDescription>
            </DialogHeader>
            <GenerateCouponForm
              key={couponUser.id}
              defaultUserId={couponUser.id}
              onClose={() => setCouponUser(null)}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  )
}
