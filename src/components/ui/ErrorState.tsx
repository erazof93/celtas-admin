import { CircleAlert, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ErrorStateProps {
  /** Título del error (default: "Algo salió mal"). */
  title?: string
  /** Descripción opcional con el detalle que venga del backend. */
  description?: string
  /** Si se pasa, muestra el botón para reintentar la petición. */
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

/**
 * Estado de error reutilizable con botón de "Reintentar" opcional.
 * Lo usan todas las pantallas que llaman a la API: si la petición falla
 * (incluido el cold start de Render), el admin ve qué pasó y puede volver
 * a intentar sin recargar la página.
 */
export function ErrorState({
  title = 'Algo salió mal',
  description,
  onRetry,
  retryLabel = 'Reintentar',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'bg-celtas-red/5 border-celtas-red/30 flex flex-col items-center gap-3 rounded-xl border px-6 py-10 text-center',
        className,
      )}
    >
      <CircleAlert className="text-celtas-red size-6" />
      <div>
        <p className="text-celtas-red-light font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        ) : null}
      </div>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry} className="mt-1">
          <RefreshCw />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}