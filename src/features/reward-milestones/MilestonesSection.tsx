import { useState } from 'react'
import { Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { getApiMessage } from '@/lib/api-errors'
import { RewardMilestoneForm } from './RewardMilestoneForm'
import { useDeleteRewardMilestone, useRewardMilestones } from './hooks'
import type { RewardMilestone } from './types'

/**
 * Hitos configurables del tablero de estrellas — CRUD admin CON DELETE real
 * (a diferencia de Promociones): un hito borrado no afecta premios ya
 * otorgados, porque RewardRedemption guarda su propio snapshot del umbral,
 * no una FK. GET /reward-milestones devuelve la lista completa, ASC por
 * starsRequired (sin ordenar en el cliente).
 */
export function MilestonesSection() {
  const milestonesQuery = useRewardMilestones()
  const deleteMutation = useDeleteRewardMilestone()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RewardMilestone | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RewardMilestone | null>(
    null,
  )
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(milestone: RewardMilestone) {
    setEditing(milestone)
    setDialogOpen(true)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } catch (error) {
      setDeleteError(getApiMessage(error, 'No se pudo eliminar el hito'))
    }
  }

  const { data, isLoading, isError, refetch } = milestonesQuery

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Hitos</h2>
          <p className="text-muted-foreground text-sm">
            Cantidades de estrellas que otorgan un premio y si entregan el
            catálogo especial.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus />
          Nuevo hito
        </Button>
      </div>

      {isLoading ? (
        <LoadingState label="Cargando hitos…" />
      ) : isError ? (
        <ErrorState
          title="No se pudieron cargar los hitos"
          description="Revisa tu conexión y vuelve a intentar."
          onRetry={() => refetch()}
        />
      ) : data && data.length === 0 ? (
        <div className="bg-card border-border flex flex-col items-center gap-3 rounded-xl border px-6 py-14 text-center">
          <Star className="text-celtas-gold size-8" />
          <div>
            <p className="font-medium">No hay hitos configurados</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Crea el primero.
            </p>
          </div>
        </div>
      ) : data ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estrellas requeridas</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((milestone) => (
                <TableRow key={milestone.id}>
                  <TableCell className="font-medium">
                    {milestone.starsRequired} ⭐
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        'border border-transparent',
                        milestone.isSpecial
                          ? 'bg-celtas-gold/15 text-celtas-gold'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {milestone.isSpecial ? 'Especial' : 'Normal'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar hito de ${milestone.starsRequired} estrellas`}
                        onClick={() => openEdit(milestone)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Eliminar hito de ${milestone.starsRequired} estrellas`}
                        className="text-celtas-red-light hover:bg-celtas-red/10 hover:text-celtas-red-light"
                        onClick={() => {
                          setDeleteError(null)
                          setDeleteTarget(milestone)
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar hito' : 'Nuevo hito'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Actualiza los datos del hito.'
                : 'Crea un nuevo hito del tablero de estrellas.'}
            </DialogDescription>
          </DialogHeader>
          <RewardMilestoneForm
            milestone={editing}
            onClose={() => setDialogOpen(false)}
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
            <DialogTitle>Eliminar hito</DialogTitle>
            <DialogDescription>
              ¿Seguro que quieres eliminar el hito de{' '}
              {deleteTarget?.starsRequired} estrellas? Esta acción no se
              puede deshacer.
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
