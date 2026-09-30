import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  useDeleteFriesType,
  useFriesTypes,
  useUpdateFriesType,
} from './hooks'
import { FriesTypeForm } from './FriesTypeForm'
import type { FriesType } from '../types'

/**
 * Catálogo de tipos de papas (Papas fritas, Papas al hilo...). Cada producto
 * del Menú elige un subconjunto (ver ItemForm). A lo sumo uno es "por
 * defecto" (preseleccionado en la app): el backend desmarca el anterior al
 * marcar otro, por eso la lista se refresca completa tras cada cambio.
 *
 * Sin bloqueo de borrado por uso: los pedidos guardan el nombre elegido como
 * snapshot (OrderItem.selectedFriesTypes) y el backend limpia la relación con
 * los productos antes de borrar (confirmado contra fries-types.service.ts).
 */
export function FriesTypesSection() {
  const friesTypesQuery = useFriesTypes()
  const updateMutation = useUpdateFriesType()
  const deleteMutation = useDeleteFriesType()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FriesType | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FriesType | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const friesTypes = friesTypesQuery.data

  async function handleToggleDefault(friesType: FriesType, isDefault: boolean) {
    setToggleError(null)
    try {
      await updateMutation.mutateAsync({ id: friesType.id, isDefault })
    } catch (error) {
      setToggleError(
        getApiMessage(error, 'No se pudo cambiar el tipo por defecto'),
      )
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } catch (error) {
      setDeleteError(
        getApiMessage(error, 'No se pudo eliminar el tipo de papas'),
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Tipos de papas
          </h2>
          <p className="text-muted-foreground text-sm">
            Catálogo que los productos ofrecen para elegir (fritas, al
            hilo...). Cada producto decide, en su formulario, cuáles ofrece.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus />
          Agregar tipo de papas
        </Button>
      </div>

      {toggleError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo guardar</AlertTitle>
          <AlertDescription>{toggleError}</AlertDescription>
        </Alert>
      ) : null}

      {friesTypesQuery.isLoading ? (
        <LoadingState label="Cargando tipos de papas…" />
      ) : friesTypesQuery.isError ? (
        <ErrorState
          title="No se pudo cargar los tipos de papas"
          description="Revisa tu conexión y vuelve a intentar."
          onRetry={() => friesTypesQuery.refetch()}
        />
      ) : friesTypes && friesTypes.length === 0 ? (
        <div className="text-muted-foreground bg-card border-border flex flex-col items-center gap-2 rounded-xl border px-6 py-12 text-center text-sm">
          Todavía no hay tipos de papas en el catálogo. Crea el primero con el
          botón de arriba.
        </div>
      ) : friesTypes ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-center">Por defecto</TableHead>
                <TableHead className="text-center">ID</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {friesTypes.map((friesType) => (
                <TableRow key={friesType.id}>
                  <TableCell className="font-medium">
                    {friesType.name}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center">
                      <Checkbox
                        checked={friesType.isDefault}
                        disabled={updateMutation.isPending}
                        aria-label={`${friesType.name} por defecto`}
                        onCheckedChange={(isChecked) =>
                          handleToggleDefault(friesType, isChecked === true)
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <CopyIdButton id={friesType.id} label={friesType.name} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${friesType.name}`}
                        onClick={() => {
                          setEditing(friesType)
                          setFormOpen(true)
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Eliminar ${friesType.name}`}
                        className="text-celtas-red-light hover:bg-celtas-red/10 hover:text-celtas-red-light"
                        onClick={() => {
                          setDeleteError(null)
                          setDeleteTarget(friesType)
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
              {editing ? 'Editar tipo de papas' : 'Agregar tipo de papas'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Actualiza los datos del tipo de papas.'
                : 'Agrega un tipo de papas nuevo al catálogo.'}
            </DialogDescription>
          </DialogHeader>
          <FriesTypeForm
            key={editing?.id ?? 'new'}
            friesType={editing ?? undefined}
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
            <DialogTitle>Eliminar tipo de papas</DialogTitle>
            <DialogDescription>
              ¿Seguro que quieres eliminar "{deleteTarget?.name}"? Se quitará
              de la oferta de cualquier producto que lo tenga asignado. Los
              pedidos ya hechos no cambian. Esta acción no se puede deshacer.
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
