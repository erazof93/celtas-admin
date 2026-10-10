import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Bell, Volume2, VolumeX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { mountOrderAlerts, orderAlerts } from './runtime'
import { localOrderAlertsEnabled } from './environment'

export function OrderAlerts() {
  useEffect(() => mountOrderAlerts(), [])
  const state = useSyncExternalStore(
    orderAlerts.subscribe,
    orderAlerts.getSnapshot,
  )
  if (!localOrderAlertsEnabled()) return null
  const canMute = state.enabled && state.ready
  const soundLabel = canMute
    ? 'Silenciar pedidos'
    : state.enabled
      ? 'Habilitar audio de pedidos'
      : 'Activar sonido de pedidos'
  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          aria-label={soundLabel}
          title={
            state.enabled && !state.ready
              ? 'Sonido activado en tus preferencias. Pulsa para permitir audio en este navegador.'
              : soundLabel
          }
          disabled={!state.coordinated}
          onClick={() => {
            if (canMute) orderAlerts.mute()
            else void orderAlerts.enableSound()
          }}
        >
          {canMute ? <Volume2 /> : <VolumeX />}
          <span className="hidden sm:inline">
            {canMute
              ? 'Silenciar'
              : state.enabled
                ? 'Habilitar audio'
                : 'Activar sonido'}
          </span>
        </Button>
        {state.enabled && !state.ready && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Silenciar pedidos"
            title="Silenciar pedidos"
            onClick={() => orderAlerts.mute()}
          >
            <VolumeX />
          </Button>
        )}
        <label className="sr-only" htmlFor="order-alert-volume">
          Volumen de pedidos
        </label>
        <input
          id="order-alert-volume"
          className="hidden w-16 accent-orange-500 sm:block"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.volume}
          onChange={(event) =>
            orderAlerts.setVolume(Number(event.target.value))
          }
        />
      </div>
      {createPortal(
        <div
          aria-live="polite"
          aria-atomic="false"
          data-order-alerts=""
          className="pointer-events-none fixed top-[calc(3.5rem+max(1rem,env(safe-area-inset-top)))] right-[max(1rem,env(safe-area-inset-right))] z-35 flex max-h-[calc(100dvh-3.5rem-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[min(24rem,calc(100%-2rem-env(safe-area-inset-left)-env(safe-area-inset-right)))] flex-col gap-2 overflow-y-auto overscroll-contain"
        >
          {state.error && (
            <p
              role="status"
              className="border-border bg-card pointer-events-auto rounded-lg border p-3 text-sm"
            >
              {state.error}
            </p>
          )}
          {state.notices.map((notice) => (
            <div
              key={notice.orderId}
              role="status"
              className="border-celtas-orange/50 bg-card pointer-events-auto flex items-center gap-3 rounded-lg border p-3 shadow-lg"
            >
              <Bell className="text-celtas-orange size-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  Nuevo pedido #{notice.orderId.slice(0, 8).toUpperCase()}
                </p>
                <Link
                  className="text-celtas-orange text-sm underline"
                  to={`/orders?order=${encodeURIComponent(notice.orderId)}`}
                >
                  Ver pedido
                </Link>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Cerrar aviso de pedido"
                onClick={() => orderAlerts.dismiss(notice.orderId)}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
