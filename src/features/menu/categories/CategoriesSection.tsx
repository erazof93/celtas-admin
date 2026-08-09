import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { getApiMessage, isConflict } from '@/lib/api-errors'
import { useCategories, useDeleteCategory } from './hooks'
import { CategoryForm } from './CategoryForm'
import type { Category } from '../types'

export function CategoriesSection() {
  const categoriesQuery = useCategories()
  const deleteMutation = useDeleteCategory()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const categories = categoriesQuery.data

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } catch (error) {
      if (isConflict(error)) {
        // 409: la categoría tiene productos → mensaje claro, no error crudo.
        setDeleteError(
          getApiMessage(
            error,
            'No se puede eliminar una categoría que tiene productos',
          ),
        )
      } else {
        setDeleteError(
          getApiMessage(error, 'No se pudo eliminar la categoría'),
        )
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Categorías</h2>
          <p className="text-muted-foreground text-sm">
            Agrupa los productos del menú que ve la app.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus />
          Nueva categoría
        </Button>
      </div>

      {categoriesQuery.isLoading ? (
        <LoadingState label="Cargando categorías…" />
      ) : categoriesQuery.isError ? (
        <ErrorState
          title="No se pudo cargar las categorías"
          description="Revisa tu conexión y vuelve a intentar."
          onRetry={() => categoriesQuery.refetch()}
        />
      ) : categories && categories.length === 0 ? (
        <div className="text-muted-foreground bg-card border-border flex flex-col items-center gap-2 rounded-xl border px-6 py-12 text-center text-sm">
          Todavía no hay categorías. Crea la primera con el botón de arriba.
        </div>
      ) : categories ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Orden</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Productos</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-52 truncate">
                    {category.description ?? '—'}
                  </TableCell>
                  <TableCell>{category.sortOrder}</TableCell>
                  <TableCell>
                    <Badge
                      variant={category.active ? 'default' : 'secondary'}
                      className={category.active ? 'bg-celtas-orange' : ''}
                    >
                      {category.active ? 'Activa' : 'Oculta'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {category.items.length}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${category.name}`}
                        onClick={() => {
                          setEditing(category)
                          setFormOpen(true)
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Eliminar ${category.name}`}
                        className="text-celtas-red-light hover:bg-celtas-red/10 hover:text-celtas-red-light"
                        onClick={() => {
                          setDeleteError(null)
                          setDeleteTarget(category)
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
              {editing ? 'Editar categoría' : 'Nueva categoría'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Actualiza los datos de la categoría.'
                : 'Crea una categoría nueva para agrupar productos.'}
            </DialogDescription>
          </DialogHeader>
          <CategoryForm
            key={editing?.id ?? 'new'}
            category={editing ?? undefined}
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
            <DialogTitle>Eliminar categoría</DialogTitle>
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