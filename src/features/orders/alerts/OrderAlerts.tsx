import { useEffect, useSyncExternalStore } from 'react'
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
  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          aria-label={
            state.enabled ? 'Silenciar pedidos' : 'Activar sonido de pedidos'
          }
          title={
            state.enabled ? 'Silenciar pedidos' : 'Activar sonido de pedidos'
          }
          disabled={!state.coordinated}
          onClick={() => {
            if (state.enabled) orderAlerts.mute()
            else void orderAlerts.enableSound()
          }}
        >
          {state.enabled ? <Volume2 /> : <VolumeX />}
          <span className="hidden sm:inline">
            {state.enabled ? 'Silenciar' : 'Activar sonido'}
          </span>
        </Button>
        <label className="sr-only" htmlFor="order-alert-volume">
          Volumen de pedidos
        </label>
        <input
          id="order-alert-volume"
          className="w-16 accent-orange-500"
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
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed right-4 bottom-4 z-50 flex max-w-sm flex-col gap-2"
      >
        {state.error && (
          <p
            role="status"
            className="border-border bg-card rounded-lg border p-3 text-sm"
          >
            {state.error}
          </p>
        )}
        {state.notices.map((notice) => (
          <div
            key={notice.orderId}
            role="status"
            className="border-celtas-orange/50 bg-card flex items-center gap-3 rounded-lg border p-3 shadow-lg"
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
      </div>
    </>
  )
}
