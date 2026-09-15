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
import { useBeverages, useDeleteBeverage } from './hooks'
import { BeverageForm } from './BeverageForm'
import type { Beverage } from '../types'

/**
 * Catálogo de bebidas (Coca-Cola, Inca Kola, Agua, etc.). Cada producto del
 * Menú elige un subconjunto de este catálogo (ver ItemForm) — productos que
 * no ofrecen bebida simplemente no marcan ninguna. Mismo patrón que
 * SaucesSection, con precio.
 *
 * Sin bloqueo de borrado por uso: es un catálogo de etiquetas, no una FK con
 * historial — los pedidos ya creados guardan nombre + precio como snapshot,
 * así que borrar una bebida solo la quita de la oferta futura de los
 * productos que la tenían asignada (confirmado contra beverages.service.ts
 * del backend).
 */
export function BeveragesSection() {
  const beveragesQuery = useBeverages()
  const deleteMutation = useDeleteBeverage()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Beverage | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Beverage | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const beverages = beveragesQuery.data

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } catch (error) {
      setDeleteError(getApiMessage(error, 'No se pudo eliminar la bebida'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Bebidas</h2>
          <p className="text-muted-foreground text-sm">
            Catálogo que los productos ofrecen para elegir (Coca-Cola, Inca
            Kola, Agua...). Cada producto decide, en su formulario, cuáles de
            estas ofrece — los que no incluyen bebida simplemente no marcan
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
          Nueva bebida
        </Button>
      </div>

      {beveragesQuery.isLoading ? (
        <LoadingState label="Cargando bebidas…" />
      ) : beveragesQuery.isError ? (
        <ErrorState
          title="No se pudo cargar las bebidas"
          description="Revisa tu conexión y vuelve a intentar."
          onRetry={() => beveragesQuery.refetch()}
        />
      ) : beverages && beverages.length === 0 ? (
        <div className="text-muted-foreground bg-card border-border flex flex-col items-center gap-2 rounded-xl border px-6 py-12 text-center text-sm">
          Todavía no hay bebidas en el catálogo. Crea la primera con el botón
          de arriba.
        </div>
      ) : beverages ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Orden</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-center">ID</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {beverages.map((beverage) => (
                <TableRow key={beverage.id}>
                  <TableCell className="font-medium">
                    {beverage.name}
                  </TableCell>
                  <TableCell>S/ {beverage.price.toFixed(2)}</TableCell>
                  <TableCell>{beverage.sortOrder}</TableCell>
                  <TableCell>
                    <Badge
                      variant={beverage.active ? 'default' : 'secondary'}
                      className={beverage.active ? 'bg-celtas-orange' : ''}
                    >
                      {beverage.active ? 'Activa' : 'Oculta'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <CopyIdButton id={beverage.id} label={beverage.name} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${beverage.name}`}
                        onClick={() => {
                          setEditing(beverage)
                          setFormOpen(true)
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Eliminar ${beverage.name}`}
                        className="text-celtas-red-light hover:bg-celtas-red/10 hover:text-celtas-red-light"
                        onClick={() => {
                          setDeleteError(null)
                          setDeleteTarget(beverage)
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
            <DialogTitle>
              {editing ? 'Editar bebida' : 'Nueva bebida'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Actualiza los datos de la bebida.'
                : 'Agrega una bebida nueva al catálogo.'}
            </DialogDescription>
          </DialogHeader>
          <BeverageForm
            key={editing?.id ?? 'new'}
            beverage={editing ?? undefined}
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
            <DialogTitle>Eliminar bebida</DialogTitle>
            <DialogDescription>
              ¿Seguro que quieres eliminar "{deleteTarget?.name}"? Se quitará
              de la oferta de cualquier producto que la tenga asignada. Los
              pedidos ya hechos con esta bebida no cambian (queda guardada tal
              cual se pidió, con su nombre y precio). Esta acción no se puede
              deshacer.
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
