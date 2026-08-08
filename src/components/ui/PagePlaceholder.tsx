import { cn } from '@/lib/utils'

export interface PagePlaceholderProps {
  title: string
  /** Qué llegará en el módulo correspondiente (texto en español). */
  description: string
  className?: string
}

/**
 * Página provisional para los módulos que se construyen en el ROADMAP.
 * Cada feature reemplaza su placeholder cuando llega su turno.
 */
export function PagePlaceholder({
  title,
  description,
  className,
}: PagePlaceholderProps) {
  return (
    <div
      className={cn(
        'flex min-h-[50vh] flex-col items-center justify-center text-center',
        className,
      )}
    >
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">
        {description}
      </p>
    </div>
  )
}
