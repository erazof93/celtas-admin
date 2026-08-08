import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface LoadingStateProps {
  /** Texto junto al spinner (default: "Cargando…"). */
  label?: string
  /**
   * Pista que aparece tras unos segundos de espera. Por defecto avisa del
   * cold start de Render — el backend puede tardar 30-50s en despertar.
   */
  hint?: string
  /** Milisegundos antes de mostrar `hint` (default: 5000). */
  hintDelayMs?: number
  className?: string
}

/**
 * Estado de carga reutilizable para todas las pantallas que llaman a la API.
 * Si la espera se prolonga más de `hintDelayMs`, muestra un aviso para que el
 * usuario no piense que la app se colgó (cold start de Render).
 */
export function LoadingState({
  label = 'Cargando…',
  hint = 'Esto puede tardar un poco la primera vez…',
  hintDelayMs = 5_000,
  className,
}: LoadingStateProps) {
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShowHint(true), hintDelayMs)
    return () => clearTimeout(timer)
  }, [hintDelayMs])

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-14 text-center',
        className,
      )}
    >
      <Loader2 className="text-celtas-orange size-6 animate-spin" />
      <div>
        <p className="text-muted-foreground text-sm">{label}</p>
        {showHint && hint ? (
          <p className="text-celtas-gold/80 mt-1 text-xs">{hint}</p>
        ) : null}
      </div>
    </div>
  )
}
