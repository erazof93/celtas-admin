import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CopyIdButton } from '@/components/ui/CopyIdButton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { getApiMessage } from '@/lib/api-errors'
import { useDeleteSauce, useSauces } from './hooks'
import { SauceForm } from './SauceForm'
import type { Sauce } from '../types'

/**
 * Catálogo de salsas/cremas (Mayonesa, Mostaza, Ketchup, etc.). Cada producto
 * del Menú elige un subconjunto de este catálogo (ver ItemForm) — productos
 * que no lo necesitan (ej. arroz chaufa) simplemente no marcan ninguna.
 *
 * Sin bloqueo de borrado por uso: es un catálogo de etiquetas, no una FK con
 * historial — los pedidos ya creados guardan el nombre elegido como snapshot,
 * así que borrar una salsa solo la quita de la oferta futura de los productos
 * que la tenían asignada (confirmado contra sauces.service.ts del backend).
 */
export function SaucesSection() {
  const saucesQuery = useSauces()
  const deleteMutation = useDeleteSauce()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Sauce | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Sauce | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const sauces = saucesQuery.data

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } catch (error) {
      setDeleteError(getApiMessage(error, 'No se pudo eliminar la salsa'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Salsas y cremas
          </h2>
          <p className="text-muted-foreground text-sm">
            Catálogo que los productos ofrecen para elegir (mayonesa, mostaza,
            ketchup...). Cada producto decide, en su formulario, cuáles de
            estas ofrece — los que no necesitan salsas simplemente no marcan
            ninguna.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus />
          Nueva salsa
        </Button>
      </div>

      {saucesQuery.isLoading ? (
        <LoadingState label="Cargando salsas…" />
      ) : saucesQuery.isError ? (
        <ErrorState
          title="No se pudo cargar las salsas"
          description="Revisa tu conexión y vuelve a intentar."
          onRetry={() => saucesQuery.refetch()}
        />
      ) : sauces && sauces.length === 0 ? (
        <div className="text-muted-foreground bg-card border-border flex flex-col items-center gap-2 rounded-xl border px-6 py-12 text-center text-sm">
          Todavía no hay salsas en el catálogo. Crea la primera con el botón
          de arriba.
        </div>
      ) : sauces ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Orden</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-center">ID</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sauces.map((sauce) => (
                <TableRow key={sauce.id}>
                  <TableCell className="font-medium">{sauce.name}</TableCell>
                  <TableCell>{sauce.sortOrder}</TableCell>
                  <TableCell>
                    <Badge
                      variant={sauce.active ? 'default' : 'secondary'}
                      className={sauce.active ? 'bg-celtas-orange' : ''}
                    >
                      {sauce.active ? 'Activa' : 'Oculta'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <CopyIdButton id={sauce.id} label={sauce.name} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${sauce.name}`}
                        onClick={() => {
                          setEditing(sauce)
                          setFormOpen(true)
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Eliminar ${sauce.name}`}
                        className="text-celtas-red-light hover:bg-celtas-red/10 hover:text-celtas-red-light"
                        onClick={() => {
                          setDeleteError(null)
                          setDeleteTarget(sauce)
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditing(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar salsa' : 'Nueva salsa'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Actualiza los datos de la salsa.'
                : 'Agrega una salsa nueva al catálogo.'}
            </DialogDescription>
          </DialogHeader>
          <SauceForm
            key={editing?.id ?? 'new'}
            sauce={editing ?? undefined}
            onClose={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar salsa</DialogTitle>
            <DialogDescription>
              ¿Seguro que quieres eliminar "{deleteTarget?.name}"? Se quitará
              de la oferta de cualquier producto que la tenga asignada. Los
              pedidos ya hechos con esta salsa no cambian (queda guardada tal
              cual se pidió). Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          {deleteError ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo eliminar</AlertTitle>
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null)
                setDeleteError(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
