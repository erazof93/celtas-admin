import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Switch } from '@/components/ui/switch'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { getApiMessage } from '@/lib/api-errors'
import {
  useDeleteItem,
  useMenuItems,
  useToggleItemAvailable,
  useToggleItemRedeemableWithStars,
  useToggleItemSpecialReward,
} from './hooks'
import { ItemForm } from './ItemForm'
import type { MenuItem } from '../types'

const CURRENCY = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function ItemsSection() {
  const itemsQuery = useMenuItems()
  const toggleMutation = useToggleItemAvailable()
  const toggleRedeemableMutation = useToggleItemRedeemableWithStars()
  const toggleSpecialMutation = useToggleItemSpecialReward()
  const deleteMutation = useDeleteItem()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<MenuItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [toggleRedeemableError, setToggleRedeemableError] = useState<
    string | null
  >(null)
  const [toggleSpecialError, setToggleSpecialError] = useState<string | null>(
    null,
  )

  const items = itemsQuery.data

  async function handleToggle(item: MenuItem, available: boolean) {
    setToggleError(null)
    try {
      await toggleMutation.mutateAsync({ id: item.id, available })
    } catch (error) {
      setToggleError(
        getApiMessage(error, 'No se pudo cambiar la disponibilidad'),
      )
    }
  }

  async function handleToggleRedeemable(
    item: MenuItem,
    redeemableWithStars: boolean,
  ) {
    setToggleRedeemableError(null)
    try {
      await toggleRedeemableMutation.mutateAsync({
        id: item.id,
        redeemableWithStars,
      })
    } catch (error) {
      setToggleRedeemableError(
        getApiMessage(error, 'No se pudo cambiar el canje con estrellas'),
      )
    }
  }

  async function handleToggleSpecial(item: MenuItem, specialReward: boolean) {
    setToggleSpecialError(null)
    try {
      await toggleSpecialMutation.mutateAsync({ id: item.id, specialReward })
    } catch (error) {
      setToggleSpecialError(
        getApiMessage(error, 'No se pudo cambiar el premio especial'),
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
      setDeleteError(getApiMessage(error, 'No se pudo eliminar el producto'))
    }
  }

  const togglingId = toggleMutation.isPending
    ? toggleMutation.variables?.id
    : null
  const togglingRedeemableId = toggleRedeemableMutation.isPending
    ? toggleRedeemableMutation.variables?.id
    : null
  const togglingSpecialId = toggleSpecialMutation.isPending
    ? toggleSpecialMutation.variables?.id
    : null

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Productos</h2>
          <p className="text-muted-foreground text-sm">
            Los productos que se ofrecen en la app, con su categoría.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus />
          Nuevo producto
        </Button>
      </div>

      {toggleError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo cambiar la disponibilidad</AlertTitle>
          <AlertDescription>{toggleError}</AlertDescription>
        </Alert>
      ) : null}

      {toggleRedeemableError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo cambiar el canje con estrellas</AlertTitle>
          <AlertDescription>{toggleRedeemableError}</AlertDescription>
        </Alert>
      ) : null}

      {toggleSpecialError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo cambiar el premio especial</AlertTitle>
          <AlertDescription>{toggleSpecialError}</AlertDescription>
        </Alert>
      ) : null}

      {itemsQuery.isLoading ? (
        <LoadingState label="Cargando productos…" />
      ) : itemsQuery.isError ? (
        <ErrorState
          title="No se pudo cargar los productos"
          description="Revisa tu conexión y vuelve a intentar."
          onRetry={() => itemsQuery.refetch()}
        />
      ) : items && items.length === 0 ? (
        <div className="text-muted-foreground bg-card border-border flex flex-col items-center gap-2 rounded-xl border px-6 py-12 text-center text-sm">
          Todavía no hay productos. Crea el primero con el botón de arriba.
        </div>
      ) : items ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Disponible</TableHead>
                <TableHead>Canjeable</TableHead>
                <TableHead>Especial</TableHead>
                <TableHead className="text-center">ID</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt=""
                          className="border-border size-10 shrink-0 rounded-lg border object-cover"
                        />
                      ) : (
                        <div className="bg-muted border-border size-10 shrink-0 rounded-lg border" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">{item.name}</p>
                        {item.description ? (
                          <p className="text-muted-foreground max-w-56 truncate text-xs">
                            {item.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.category?.name ?? '—'}
                  </TableCell>
                  <TableCell className="font-medium">
                    {CURRENCY.format(item.price)}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={item.available}
                      onCheckedChange={(next) => handleToggle(item, next)}
                      disabled={togglingId === item.id}
                      aria-label={`Cambiar disponibilidad de ${item.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={item.redeemableWithStars}
                      onCheckedChange={(next) =>
                        handleToggleRedeemable(item, next)
                      }
                      disabled={togglingRedeemableId === item.id}
                      aria-label={`Cambiar canje con estrellas de ${item.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={item.specialReward}
                      onCheckedChange={(next) =>
                        handleToggleSpecial(item, next)
                      }
                      disabled={togglingSpecialId === item.id}
                      aria-label={`Cambiar premio especial de ${item.name}`}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <CopyIdButton id={item.id} label={item.name} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${item.name}`}
                        onClick={() => {
                          setEditing(item)
                          setFormOpen(true)
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Eliminar ${item.name}`}
                        className="text-celtas-red-light hover:bg-celtas-red/10 hover:text-celtas-red-light"
                        onClick={() => {
                          setDeleteError(null)
                          setDeleteTarget(item)
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
          if (!open) {
            setEditing(null)
            setToggleError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar producto' : 'Nuevo producto'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Actualiza los datos del producto.'
                : 'El producto se crea primero; la imagen se sube al guardar.'}
            </DialogDescription>
          </DialogHeader>
          <ItemForm
            key={editing?.id ?? 'new'}
            item={editing ?? undefined}
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
            <DialogTitle>Eliminar producto</DialogTitle>
            <DialogDescription>
              ¿Seguro que quieres eliminar "{deleteTarget?.name}"? Esta acción
              no se puede deshacer.
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