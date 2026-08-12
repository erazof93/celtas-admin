import { useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Inbox, Pencil, Plus, Trash2 } from 'lucide-react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatLima } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { getBannerVigencia, formatDaysOfWeek } from './banner-utils'
import { BannerForm } from './BannerForm'
import { useBanners, useDeleteBanner, useReorderBanners } from './hooks'
import {
  BANNER_ACTION_TYPE_LABELS,
  BANNER_VIGENCIA_BADGE,
  BANNER_VIGENCIA_LABELS,
} from './status'
import type { Banner } from './types'

function SortableBannerRow({
  banner,
  onEdit,
  confirmDeleteId,
  onDelete,
}: {
  banner: Banner
  onEdit: (banner: Banner) => void
  confirmDeleteId: string | null
  onDelete: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: banner.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const vigencia = getBannerVigencia(banner, new Date())
  const confirming = confirmDeleteId === banner.id

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && 'opacity-50')}
    >
      <TableCell className="w-10">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Arrastrar banner ${banner.title}`}
          className="text-muted-foreground hover:text-celtas-cream cursor-grab touch-none rounded p-1"
        >
          <GripVertical className="size-4" />
        </button>
      </TableCell>
      <TableCell>
        {banner.imageUrl ? (
          <img
            src={banner.imageUrl}
            alt={banner.title}
            className="border-border size-12 shrink-0 rounded-lg border object-cover"
          />
        ) : (
          <div className="bg-muted border-border flex size-12 items-center justify-center rounded-lg border border-dashed">
            <Inbox className="text-muted-foreground size-4" />
          </div>
        )}
      </TableCell>
      <TableCell className="font-medium">{banner.title}</TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {banner.actionType === 'none'
          ? 'Sin acción'
          : `${BANNER_ACTION_TYPE_LABELS[banner.actionType]}: ${banner.actionValue}`}
      </TableCell>
      <TableCell>
        <Badge
          className={cn(
            BANNER_VIGENCIA_BADGE[vigencia],
            'border border-transparent',
          )}
        >
          {BANNER_VIGENCIA_LABELS[vigencia]}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {banner.startDate || banner.endDate ? (
          <span>
            {banner.startDate
              ? formatLima(banner.startDate, 'dd/MM/yyyy')
              : '…'}{' '}
            →{' '}
            {banner.endDate ? formatLima(banner.endDate, 'dd/MM/yyyy') : '…'}
          </span>
        ) : (
          'Sin fechas'
        )}
        {banner.daysOfWeek && banner.daysOfWeek.length > 0 && formatDaysOfWeek(banner.daysOfWeek) !== 'Todos los días' && (
          <span className="text-xs text-muted-foreground capitalize">
            {formatDaysOfWeek(banner.daysOfWeek)}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(banner)}
            aria-label={`Editar ${banner.title}`}
          >
            <Pencil />
          </Button>
          {confirming ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(banner.id)}
            >
              ¿Seguro?
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(banner.id)}
              aria-label={`Eliminar ${banner.title}`}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

/**
 * Banners — MÓDULO 7. CRUD completo (GET/POST/PATCH/DELETE /banners), subida
 * de imagen en 2 pasos (POST /banners/:id/image) y reordenamiento drag & drop
 * que persiste contra PATCH /banners/reorder ({ items: [{id, order}] }).
 */
export default function BannersPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const bannersQuery = useBanners()
  const reorderMutation = useReorderBanners()
  const deleteMutation = useDeleteBanner()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  function openCreate() {
    setEditingBanner(null)
    setDialogOpen(true)
  }

  function openEdit(banner: Banner) {
    setEditingBanner(banner)
    setDialogOpen(true)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    const banners = bannersQuery.data
    if (!over || active.id === over.id || !banners) return

    const oldIndex = banners.findIndex((b) => b.id === active.id)
    const newIndex = banners.findIndex((b) => b.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(banners, oldIndex, newIndex)
    // El orden nuevo es la posición en la lista (0-based, ascendente).
    reorderMutation.mutate(
      reordered.map((b, index) => ({ id: b.id, order: index })),
    )
  }

  function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id)
      return
    }
    setConfirmDeleteId(null)
    deleteMutation.mutate(id)
  }

  const { data, isLoading, isError, refetch } = bannersQuery

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banners</h1>
          <p className="text-muted-foreground text-sm">
            Promociones visibles en la app. Arrastra las filas para reordenarlas.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus />
          Nuevo banner
        </Button>
      </header>

      {isLoading ? (
        <LoadingState label="Cargando banners…" />
      ) : isError ? (
        <ErrorState
          title="No se pudieron cargar los banners"
          description="Revisa tu conexión y vuelve a intentar."
          onRetry={() => refetch()}
        />
      ) : data && data.length === 0 ? (
        <div className="bg-card border-border flex flex-col items-center gap-3 rounded-xl border px-6 py-14 text-center">
          <Inbox className="text-celtas-orange size-8" />
          <div>
            <p className="font-medium">No hay banners</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Crea el primer banner de promoción para la app.
            </p>
          </div>
        </div>
      ) : data ? (
        <div className="bg-card border-border overflow-hidden rounded-xl border">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={data.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" aria-label="Reordenar" />
                    <TableHead>Imagen</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>Vigencia</TableHead>
                    <TableHead>Fechas</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((banner) => (
                    <SortableBannerRow
                      key={banner.id}
                      banner={banner}
                      onEdit={openEdit}
                      confirmDeleteId={confirmDeleteId}
                      onDelete={handleDelete}
                    />
                  ))}
                </TableBody>
              </Table>
            </SortableContext>
          </DndContext>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingBanner ? 'Editar banner' : 'Nuevo banner'}
            </DialogTitle>
            <DialogDescription>
              {editingBanner
                ? 'Actualiza los datos del banner. La imagen se sube al guardar.'
                : 'Crea una promoción para la app. La imagen se sube al guardar.'}
            </DialogDescription>
          </DialogHeader>
          <BannerForm
            banner={editingBanner}
            onClose={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}