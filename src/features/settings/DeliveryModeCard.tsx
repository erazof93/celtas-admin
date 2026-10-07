import { useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getApiMessage, getApiStatus } from '@/lib/api-errors'
import { useSettings, useUpsertSetting } from './hooks'
import { deliveryModeFromSettings, DELIVERY_MODE_KEY } from './delivery-mode'
import { useDeliveryZones } from '../delivery-zones/hooks'
import type { DeliveryMode } from '../delivery-zones/types'

export function DeliveryModeCard({ editorOpen }: { editorOpen: boolean }) {
  const settings = useSettings()
  const catalog = useDeliveryZones()
  const mutation = useUpsertSetting()
  const mode = deliveryModeFromSettings(settings.data)
  const [target, setTarget] = useState<DeliveryMode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const catalogReady =
    catalog.isSuccess && !catalog.isError && !catalog.isFetching
  const hasActive = catalog.data?.some((zone) => zone.active) === true
  const ready =
    settings.isSuccess &&
    !settings.isFetching &&
    !settings.isError &&
    mode !== null &&
    !editorOpen &&
    !mutation.isPending
  const canActivateZones = ready && catalogReady && hasActive

  async function confirm() {
    if (!target || !ready || (target === 'ZONES' && !canActivateZones)) return
    setError(null)
    try {
      await mutation.mutateAsync({ key: DELIVERY_MODE_KEY, value: target })
      setTarget(null)
    } catch (err) {
      setError(
        getApiStatus(err) === 409
          ? 'No se pudo cambiar el método. Para activar delivery por zonas debe existir al menos una zona activa. Se actualizará la configuración.'
          : getApiMessage(
              err,
              'No se pudo cambiar el método de cálculo. Intenta nuevamente.',
            ),
      )
      await Promise.all([settings.refetch(), catalog.refetch()])
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Método de cálculo del delivery</CardTitle>
        <CardDescription>
          El cambio requiere confirmación. Los tramos y las zonas permanecerán
          guardados.
        </CardDescription>
        <p className="font-semibold" role="status">
          Método activo:{' '}
          {settings.isLoading
            ? 'Cargando…'
            : settings.isError || !mode
              ? 'No disponible'
              : mode === 'ZONES'
                ? 'Por zonas'
                : 'Por distancia'}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <Button
            variant={mode === 'ZONES' ? 'default' : 'outline'}
            disabled={mode === 'ZONES' || !canActivateZones}
            onClick={() => {
              setError(null)
              setTarget('ZONES')
            }}
          >
            Por zonas{mode === 'ZONES' ? ' — Activo' : ''}
          </Button>
          <Button
            variant={mode === 'DISTANCE' ? 'default' : 'outline'}
            disabled={mode === 'DISTANCE' || !ready}
            onClick={() => {
              setError(null)
              setTarget('DISTANCE')
            }}
          >
            Por distancia{mode === 'DISTANCE' ? ' — Activo' : ''}
          </Button>
        </div>
        {mutation.isPending && (
          <p role="status">Guardando método de cálculo…</p>
        )}
        {editorOpen && (
          <p className="text-muted-foreground text-sm">
            Guarda o cancela la edición de la zona antes de cambiar el método.
          </p>
        )}
        {mode !== 'ZONES' && !catalogReady && (
          <p className="text-muted-foreground text-sm">
            El catálogo debe cargarse correctamente antes de activar zonas.
          </p>
        )}
        {mode !== 'ZONES' && catalogReady && !hasActive && (
          <p className="text-muted-foreground text-sm">
            Configura al menos una zona activa para utilizar delivery por zonas.
          </p>
        )}
        {(settings.isError || catalog.isError) && (
          <Button
            variant="outline"
            onClick={() =>
              void Promise.all([settings.refetch(), catalog.refetch()])
            }
          >
            Reintentar configuración
          </Button>
        )}
        {error && (
          <p role="alert" className="text-celtas-red-light text-sm">
            {error}
          </p>
        )}
      </CardContent>
      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setTarget(null)
        }}
      >
        <DialogContent showCloseButton={!mutation.isPending}>
          <DialogHeader>
            <DialogTitle>
              {target === 'ZONES'
                ? 'Activar delivery por zonas'
                : 'Usar delivery por distancia'}
            </DialogTitle>
            <DialogDescription>
              {target === 'ZONES'
                ? 'Las tarifas se calcularán exclusivamente según las zonas activas. Las tarifas por distancia dejarán de utilizarse mientras este modo esté activo. Las direcciones fuera de las zonas activas quedarán fuera de cobertura. Las tarifas por distancia permanecerán guardadas y podrás volver a ellas más adelante.'
                : 'Las zonas permanecerán guardadas, pero dejarán de utilizarse para calcular el delivery. El precio volverá a calcularse mediante los tramos por distancia.'}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-celtas-red-light text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              disabled={!ready || (target === 'ZONES' && !canActivateZones)}
              onClick={() => void confirm()}
            >
              {mutation.isPending
                ? 'Guardando…'
                : target === 'ZONES'
                  ? 'Activar zonas'
                  : 'Usar distancia'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
