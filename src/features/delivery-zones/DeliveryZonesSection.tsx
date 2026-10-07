import { lazy, Suspense } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { useZoneEditor } from './useZoneEditor'
import { ZoneForm } from './ZoneForm'
import { ZoneList } from './ZoneList'
import { DeliveryModeCard } from '../settings/DeliveryModeCard'

const ZoneMap = lazy(() => import('./ZoneMap'))

export function DeliveryZonesSection() {
  const {
    settings,
    catalog,
    selectedId,
    editor,
    drawing,
    pendingAction,
    deleteZone,
    error,
    notice,
    form,
    polygon,
    active,
    zones,
    selected,
    mode,
    modeKnown,
    protectedId,
    busy,
    location,
    remove,
    request,
    save,
    confirmDelete,
    perform,
    setPendingAction,
    setDeleteZone,
    setDrawing,
    setError,
  } = useZoneEditor()
  return (
    <>
      <DeliveryModeCard
        editorOpen={editor !== null || busy || deleteZone !== null}
      />
      <Card>
        <CardHeader>
          <CardTitle>Delivery por zonas</CardTitle>
          <CardDescription>
            {mode === 'ZONES'
              ? 'Activo para calcular delivery'
              : 'Configuración de respaldo — actualmente inactiva. Preparar zonas no cambia el modo operativo.'}
          </CardDescription>
          <p className="text-sm">
            Modo operativo:{' '}
            {modeKnown
              ? mode === 'ZONES'
                ? 'Zonas'
                : 'Distancia'
              : settings.isLoading
                ? 'Cargando…'
                : 'No disponible'}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {mode === 'ZONES' && (
            <Alert>
              <AlertTitle>El backend ya opera por zonas</AlertTitle>
              <AlertDescription>
                Las direcciones fuera de las zonas activas quedan sin cobertura.
                No se permite eliminar o desactivar la última zona activa desde
                este panel. Esta protección no evita cambios concurrentes.
              </AlertDescription>
            </Alert>
          )}
          {!modeKnown && !settings.isLoading && (
            <ErrorState
              title="No se pudo determinar el modo operativo"
              onRetry={() => settings.refetch()}
            />
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>No se pudo completar la operación</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
          {catalog.isLoading ? (
            <LoadingState label="Cargando zonas…" />
          ) : catalog.isError && !catalog.data ? (
            <ErrorState
              title="No se pudieron cargar las zonas"
              onRetry={() => catalog.refetch()}
            />
          ) : (
            <>
              {catalog.isError && (
                <ErrorState
                  title="No se pudo actualizar el catálogo"
                  description="Se conserva el borrador. Reintenta antes de guardar."
                  onRetry={() => catalog.refetch()}
                />
              )}
              <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
                <div className="min-w-0 space-y-3">
                  <Suspense
                    fallback={<LoadingState label="Cargando editor de mapa…" />}
                  >
                    <ZoneMap
                      zones={zones}
                      selectedId={selectedId}
                      location={location}
                      editor={editor}
                      polygon={polygon}
                      drawing={drawing}
                      busy={busy}
                      onSelect={(zone) => request({ kind: 'select', zone })}
                      onPolygon={(value) => {
                        form.setValue('polygon', value, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                        setDrawing(false)
                      }}
                      onError={setError}
                    />
                  </Suspense>
                  <Button
                    disabled={busy || !modeKnown || drawing}
                    onClick={() => request({ kind: 'create' })}
                  >
                    {zones.length ? 'Dibujar zona' : 'Dibujar primera zona'}
                  </Button>
                  {drawing && (
                    <div className="flex items-center gap-2">
                      <p role="status" className="text-sm">
                        Dibujando: coloca al menos tres puntos y pulsa el primer
                        vértice para cerrar.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => request({ kind: 'cancel' })}
                      >
                        Cancelar dibujo
                      </Button>
                    </div>
                  )}
                </div>
                {editor ? (
                  <ZoneForm
                    form={form}
                    drawing={drawing}
                    saving={busy}
                    onSubmit={() => void form.handleSubmit(save)()}
                    onCancel={() => request({ kind: 'cancel' })}
                  />
                ) : (
                  <div className="space-y-3">
                    {selected ? (
                      <>
                        <h3 className="font-semibold">{selected.name}</h3>
                        <p>
                          S/ {selected.fee.toFixed(2)} ·{' '}
                          {selected.active ? 'Activa' : 'Inactiva'}
                        </p>
                        <Button
                          disabled={busy || !modeKnown}
                          onClick={() =>
                            request({ kind: 'edit', zone: selected })
                          }
                        >
                          Editar zona seleccionada
                        </Button>
                      </>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        Selecciona una zona en el mapa o listado, o dibuja una
                        nueva.
                      </p>
                    )}
                  </div>
                )}
              </div>
              {editor && !active && (
                <p className="text-muted-foreground text-sm">
                  La zona inactiva sigue visible y no ofrece cobertura. También
                  debe respetar los límites de otras zonas.
                </p>
              )}
              <ZoneList
                zones={zones}
                selectedId={selectedId}
                busy={busy || !modeKnown}
                protectedId={protectedId}
                onSelect={(zone) => request({ kind: 'select', zone })}
                onEdit={(zone) => request({ kind: 'edit', zone })}
                onToggle={(zone) => request({ kind: 'toggle', zone })}
                onDelete={(zone) => request({ kind: 'delete', zone })}
              />
            </>
          )}
          <Dialog
            open={pendingAction !== null}
            onOpenChange={(open) => {
              if (!open && !busy) setPendingAction(null)
            }}
          >
            <DialogContent showCloseButton={!busy}>
              <DialogHeader>
                <DialogTitle>Cambios sin guardar</DialogTitle>
                <DialogDescription>
                  Guarda el borrador antes de continuar o descártalo. Cancelar
                  te mantiene en la edición.
                </DialogDescription>
              </DialogHeader>
              {error && (
                <p role="alert" className="text-celtas-red-light text-sm">
                  {error}
                </p>
              )}
              {form.formState.errors.polygon && (
                <p role="alert" className="text-celtas-red-light text-sm">
                  Revisa el polígono antes de guardar.
                </p>
              )}
              {(form.formState.errors.name || form.formState.errors.fee) && (
                <p role="alert" className="text-celtas-red-light text-sm">
                  Revisa el nombre y la tarifa antes de guardar, o cancela para
                  corregirlos.
                </p>
              )}
              <DialogFooter>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => setPendingAction(null)}
                >
                  Cancelar
                </Button>
                <Button
                  disabled={busy}
                  variant="destructive"
                  onClick={() => {
                    const next = pendingAction
                    setPendingAction(null)
                    if (next) void perform(next)
                  }}
                >
                  Descartar
                </Button>
                <Button
                  disabled={busy || drawing}
                  onClick={() => void form.handleSubmit(save)()}
                >
                  Guardar y continuar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog
            open={deleteZone !== null}
            onOpenChange={(open) => {
              if (!open && !busy) setDeleteZone(null)
            }}
          >
            <DialogContent showCloseButton={!busy}>
              <DialogHeader>
                <DialogTitle>Eliminar {deleteZone?.name}</DialogTitle>
                <DialogDescription>
                  ¿Eliminar esta zona? Dejará de ofrecer cobertura. Los
                  snapshots de pedidos históricos no se modifican.
                </DialogDescription>
              </DialogHeader>
              {error && (
                <p role="alert" className="text-celtas-red-light text-sm">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => setDeleteZone(null)}
                >
                  Cancelar
                </Button>
                <Button
                  disabled={busy || deleteZone?.id === protectedId}
                  variant="destructive"
                  onClick={() => void confirmDelete()}
                >
                  {remove.isPending ? 'Eliminando…' : 'Confirmar eliminación'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </>
  )
}
