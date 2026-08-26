import { useState } from 'react'
import { cn } from '@/lib/utils'
import { MilestonesSection } from '@/features/reward-milestones/MilestonesSection'
import { PromotionsSection } from './PromotionsSection'

const TABS = [
  { key: 'promotions', label: 'Promociones' },
  { key: 'milestones', label: 'Hitos' },
] as const

type StarPromotionsTab = (typeof TABS)[number]['key']

/**
 * Estrellas — shell de tabs (mismo patrón que MenuPage.tsx). "Promociones"
 * (multiplicador por rango de fechas) y "Hitos" (umbrales configurables del
 * tablero, con su propio premio especial).
 */
export default function StarPromotionsPage() {
  const [tab, setTab] = useState<StarPromotionsTab>('promotions')

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Estrellas</h1>
        <p className="text-muted-foreground text-sm">
          Gestiona las promociones y los hitos del programa de fidelización.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Secciones de Estrellas"
        className="border-border bg-card inline-flex gap-1 rounded-xl border p-1"
      >
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              tab === key
                ? 'bg-celtas-orange/15 text-celtas-orange ring-celtas-orange/40 ring-1 ring-inset'
                : 'text-muted-foreground hover:text-celtas-cream hover:bg-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'promotions' ? <PromotionsSection /> : <MilestonesSection />}
    </div>
  )
}
