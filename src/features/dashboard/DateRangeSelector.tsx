import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  rangeForPreset,
  type DateRangePreset,
  type DateRangeSelection,
} from './date-range'

/**
 * Selector de rango de fechas del dashboard.
 *
 * Los presets (Hoy / Esta semana / Este mes) se calculan en la zona horaria
 * de Lima (America/Lima), igual que el backend. El rango personalizado usa
 * inputs de fecha nativos (que ya emiten YYYY-MM-DD) y valida que from <= to
 * antes de propagarlo — nunca mandamos un rango invertido al backend (400).
 */

const PRESET_OPTIONS: { key: DateRangePreset; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mes' },
  { key: 'custom', label: 'Rango' },
]

export interface DateRangeSelectorProps {
  value: DateRangeSelection
  onChange: (next: DateRangeSelection) => void
}

export function DateRangeSelector({
  value,
  onChange,
}: DateRangeSelectorProps) {
  // Borradores de los inputs del rango personalizado. Solo se propagan a
  // `value` cuando ambas fechas existen y from <= to; si no, se muestra un
  // error y el dashboard sigue con el último rango válido.
  const [draftFrom, setDraftFrom] = useState(
    value.preset === 'custom' ? value.from : '',
  )
  const [draftTo, setDraftTo] = useState(
    value.preset === 'custom' ? value.to : '',
  )
  const [draftError, setDraftError] = useState<string | null>(null)

  const isCustom = value.preset === 'custom'

  function handlePreset(preset: DateRangePreset) {
    if (preset === 'custom') {
      setDraftFrom(value.from)
      setDraftTo(value.to)
      setDraftError(null)
      onChange({ ...value, preset })
      return
    }
    const { from, to } = rangeForPreset(preset)
    onChange({ preset, from, to })
  }

  function handleDraft(field: 'from' | 'to', raw: string) {
    const nextFrom = field === 'from' ? raw : draftFrom
    const nextTo = field === 'to' ? raw : draftTo
    setDraftFrom(nextFrom)
    setDraftTo(nextTo)

    if (!nextFrom || !nextTo) {
      setDraftError(null)
      return
    }
    if (nextFrom > nextTo) {
      setDraftError('La fecha inicial no puede ser posterior a la final.')
      return
    }
    setDraftError(null)
    onChange({ preset: 'custom', from: nextFrom, to: nextTo })
  }

  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-label="Rango de fechas"
        className="flex flex-wrap gap-1.5"
      >
        {PRESET_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={value.preset === key}
            onClick={() => handlePreset(key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              value.preset === key
                ? 'bg-celtas-orange/15 text-celtas-orange ring-celtas-orange/40 ring-1 ring-inset'
                : 'border-border text-muted-foreground bg-card hover:bg-muted hover:text-celtas-cream border',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isCustom ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Desde</span>
            <input
              type="date"
              value={draftFrom}
              max={draftTo || undefined}
              onChange={(e) => handleDraft('from', e.target.value)}
              className="border-border bg-card text-celtas-cream h-8 rounded-lg border px-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Hasta</span>
            <input
              type="date"
              value={draftTo}
              min={draftFrom || undefined}
              onChange={(e) => handleDraft('to', e.target.value)}
              className="border-border bg-card text-celtas-cream h-8 rounded-lg border px-2 text-sm"
            />
          </label>
        </div>
      ) : null}

      {draftError ? (
        <p className="text-celtas-red text-xs">{draftError}</p>
      ) : null}
    </div>
  )
}