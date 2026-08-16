import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CategoriesSection } from './categories/CategoriesSection'
import { ItemsSection } from './items/ItemsSection'
import { SaucesSection } from './sauces/SaucesSection'

const TABS = [
  { key: 'categories', label: 'Categorías' },
  { key: 'items', label: 'Productos' },
  { key: 'sauces', label: 'Salsas' },
] as const

type MenuTab = (typeof TABS)[number]['key']

/**
 * Menú — MÓDULO 4. Dos vistas: categorías y productos (tabs).
 */
export default function MenuPage() {
  const [tab, setTab] = useState<MenuTab>('categories')

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Menú</h1>
        <p className="text-muted-foreground text-sm">
          Gestiona las categorías y productos que ve el cliente en la app.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Secciones del menú"
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

      {tab === 'categories' ? (
        <CategoriesSection />
      ) : tab === 'items' ? (
        <ItemsSection />
      ) : (
        <SaucesSection />
      )}
    </div>
  )
}