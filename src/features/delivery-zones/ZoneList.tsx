import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { DeliveryZone } from './types'

interface Props {
  zones: DeliveryZone[]
  selectedId: string | null
  busy: boolean
  protectedId: string | null
  onSelect: (zone: DeliveryZone) => void
  onEdit: (zone: DeliveryZone) => void
  onToggle: (zone: DeliveryZone) => void
  onDelete: (zone: DeliveryZone) => void
}

export function ZoneList({
  zones,
  selectedId,
  busy,
  protectedId,
  onSelect,
  onEdit,
  onToggle,
  onDelete,
}: Props) {
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Zonas configuradas</h3>
      {zones.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aún no hay zonas configuradas
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tarifa</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {zones.map((zone) => (
              <TableRow
                key={zone.id}
                data-state={selectedId === zone.id ? 'selected' : undefined}
              >
                <TableCell>
                  <Button
                    variant="link"
                    disabled={busy}
                    onClick={() => onSelect(zone)}
                    aria-pressed={selectedId === zone.id}
                  >
                    {zone.name}
                  </Button>
                </TableCell>
                <TableCell>S/ {zone.fee.toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant={zone.active ? 'default' : 'secondary'}>
                    {zone.active ? 'Activa' : 'Inactiva'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onEdit(zone)}
                      aria-label={`Editar ${zone.name}`}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || protectedId === zone.id}
                      onClick={() => onToggle(zone)}
                      aria-label={`${zone.active ? 'Desactivar' : 'Activar'} ${zone.name}`}
                    >
                      {zone.active ? 'Desactivar' : 'Activar'}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy || protectedId === zone.id}
                      onClick={() => onDelete(zone)}
                      aria-label={`Eliminar ${zone.name}`}
                    >
                      Eliminar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
