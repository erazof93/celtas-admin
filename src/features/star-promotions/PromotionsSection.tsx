import { useState } from 'react'
import { Pencil, Plus, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { cn } from '@/lib/utils'
import { formatStarPromotionDateRange } from './star-promotion-utils'
import { StarPromotionForm } from './StarPromotionForm'
import { useStarPromotions } from './hooks'
import type { StarPromotion } from './types'

/**
 * Promociones de estrellas ("Estrellas dobles") — CRUD admin sin DELETE (para
 * desactivar se envía `active: false`, nunca se borra el historial) y sin
 * reordenar/imagen, a diferencia de Banners. GET /star-promotions devuelve
 * la lista completa sin paginar.
 */
export function PromotionsSection() {
  const promotionsQuery = useStarPromotions()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<StarPromotion | null>(null)

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(promotion: StarPromotion) {
    setEditing(promotion)
    setDialogOpen(true)
  }

  const { data, isLoading, isError, refetch } = promotionsQuery

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Promociones
          </h2>
          <p className="text-muted-foreground text-sm">
            Promociones de multiplicador de estrellas por rango de fechas
            (ej. "estrellas dobles").
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus />
          Nueva promoción
        </Button>
      </div>

      {isLoading ? (
        <LoadingState label="Cargando promociones…" />
      ) : isError ? (
        <ErrorState
          title="No se pudieron cargar las promociones"
          description="Revisa tu conexión y vuelve a intentar."
          onRetry={() => refetch()}
        />
      ) : data && data.length === 0 ? (
        <div className="bg-card border-border flex flex-col items-center gap-3 rounded-xl border px-6 py-14 text-center">
          <Sparkles className="text-celtas-gold size-8" />
          <div>
            <p className="font-medium">No hay promociones</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Crea la primera promoción de estrellas.
            </p>
          </div>
        </div>
      ) : data ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Etiqueta</TableHead>
                <TableHead>Multiplicador</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((promotion) => (
                <TableRow key={promotion.id}>
                  <TableCell className="font-medium">
                    {promotion.label}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    x{promotion.multiplier}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatStarPromotionDateRange(promotion)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        'border border-transparent',
                        promotion.active
                          ? 'bg-emerald-400/15 text-emerald-400'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {promotion.active ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${promotion.label}`}
                      onClick={() => openEdit(promotion)}
                    >
                      <Pencil />
                    </Button>
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
            <DialogTitle>
              {editing ? 'Editar promoción' : 'Nueva promoción'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Actualiza los datos de la promoción de estrellas.'
                : 'Crea una promoción de multiplicador de estrellas por rango de fechas.'}
            </DialogDescription>
          </DialogHeader>
          <StarPromotionForm promotion={editing} onClose={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
