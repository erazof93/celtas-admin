import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const TONES = {
  orange: 'bg-celtas-orange/10 text-celtas-orange',
  gold: 'bg-celtas-gold/10 text-celtas-gold',
  emerald: 'bg-emerald-400/10 text-emerald-400',
  amber: 'bg-amber-400/10 text-amber-400',
  sky: 'bg-sky-400/10 text-sky-400',
} as const

export type KPITone = keyof typeof TONES

/** Sub-métrica bajo el valor (ej. pedidos por canal). */
export interface KPIBreakdownItem {
  label: string
  value: string | number
  /** Clase del punto de color que identifica la serie (ej. `bg-channel-app`). */
  dotClassName?: string
}

interface KPICardProps {
  label: string
  value: string | number
  icon: LucideIcon
  tone: KPITone
  hint?: string
  breakdown?: KPIBreakdownItem[]
}

/**
 * Tarjeta de KPI del dashboard: valor grande + pista y/o desglose. El texto
 * va siempre en tinta neutra; el color solo vive en el icono y en los puntos
 * del desglose (la identidad de la serie nunca depende solo del color: cada
 * punto va con su etiqueta).
 */
export function KPICard({
  label,
  value,
  icon: Icon,
  tone,
  hint,
  breakdown,
}: KPICardProps) {
  return (
    <Card className="hover:border-celtas-orange/40 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {label}
        </CardTitle>
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg',
            TONES[tone],
          )}
        >
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        {hint ? (
          <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
        ) : null}
        {breakdown && breakdown.length > 0 ? (
          <ul className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {breakdown.map((item) => (
              <li key={item.label} className="flex items-center gap-1.5">
                {item.dotClassName ? (
                  <span
                    aria-hidden
                    className={cn('size-2 shrink-0 rounded-full', item.dotClassName)}
                  />
                ) : null}
                <span>{item.label}:</span>
                <span className="text-foreground font-medium">{item.value}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}
