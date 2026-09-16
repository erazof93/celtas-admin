import { useState } from 'react'
import { Inbox, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/ErrorState'
import { Input } from '@/components/ui/input'
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
import { formatLima } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { TopUsersSection } from './TopUsersSection'
import { useUsers } from './hooks'
import { UserDetailDialog } from './UserDetailDialog'
import {
  USER_ROLE_BADGE,
  USER_ROLE_LABELS,
  filterUsersByQuery,
  formatTotalSpent,
} from './users-utils'
import type { AdminUser } from './types'

const PAGE_SIZE = 15

/**
 * Usuarios — MÓDULO 9. Listado paginado (GET /users) con filtro de búsqueda
 * en el cliente (el backend NO soporta búsqueda server-side: QueryUsersDto
 * solo tiene page/limit) y detalle en modal (perfil + cupones del usuario +
 * cambio de rol).
 */
export default function UsersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)

  const usersQuery = useUsers(page, PAGE_SIZE)

  const { data, isLoading, isError, refetch } = usersQuery

  // Filtro en cliente sobre la página actual (no es una búsqueda real).
  const visibleUsers = data ? filterUsersByQuery(data.items, search) : []

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Usuarios</h1>
        <p className="text-muted-foreground text-sm">
          Clientes y admins registrados.
        </p>
      </header>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="top">Top usuarios</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-muted-foreground text-sm">
              El filtro busca en la página actual.
            </p>
            <div className="relative w-full sm:w-72">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o email…"
                className="pl-9"
                aria-label="Buscar usuarios"
              />
            </div>
          </div>

          {isLoading ? (
            <LoadingState label="Cargando usuarios…" />
          ) : isError ? (
            <ErrorState
              title="No se pudieron cargar los usuarios"
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
                    <TableHead>Rol</TableHead>
                    <TableHead>Registro</TableHead>
                    <TableHead className="text-right">Total gastado</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.fullName}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            USER_ROLE_BADGE[user.role],
                            'border border-transparent',
                          )}
                        >
                          {USER_ROLE_LABELS[user.role]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatLima(user.createdAt, 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatTotalSpent(user.totalSpent)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedUser(user)}
                          aria-label={`Ver detalle de ${user.fullName}`}
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

          {search && visibleUsers.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Sin resultados para "{search}" en esta página.
            </p>
          ) : null}

          <UserDetailDialog
            user={selectedUser}
            onOpenChange={(open) => {
              if (!open) setSelectedUser(null)
            }}
          />
        </TabsContent>

        <TabsContent value="top" className="mt-4">
          <TopUsersSection />
        </TabsContent>
      </Tabs>
    </div>
  )
}
