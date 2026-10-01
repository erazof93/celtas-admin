import { useState } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { rangeError, todayInLima } from '../report-utils'
import type {
  ReportChannel,
  ReportFilters as Filters,
  ReportGroupBy,
} from '../types/reports'

const INPUT_CLASS =
  'border-border bg-card text-celtas-cream h-9 w-full rounded-lg border px-2 text-sm'

interface ReportFiltersProps {
  filters: Filters
  onFiltersChange: (filters: Filters) => void
}

/**
 * Filtros de reportes. Las fechas usan inputs nativos (ya emiten YYYY-MM-DD,
 * sin pasar por UTC) y se guardan como borrador: solo se propagan cuando el
 * rango es válido según las reglas del backend (inicio <= fin, máx. 366 días).
 * Mientras tanto la página sigue con el último rango válido.
 */
export function ReportFilters({
  filters,
  onFiltersChange,
}: ReportFiltersProps) {
  const [draftStart, setDraftStart] = useState(filters.startDate)
  const [draftEnd, setDraftEnd] = useState(filters.endDate)
  const [error, setError] = useState<string | null>(null)
  const today = todayInLima()

  function handleDate(field: 'startDate' | 'endDate', value: string) {
    const startDate = field === 'startDate' ? value : draftStart
    const endDate = field === 'endDate' ? value : draftEnd
    setDraftStart(startDate)
    setDraftEnd(endDate)

    const problem = rangeError(startDate, endDate)
    setError(problem)
    if (!problem) onFiltersChange({ ...filters, startDate, endDate })
  }

  return (
    <div className="bg-card border-border space-y-2 rounded-xl border p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="report-start">Desde</Label>
          <input
            id="report-start"
            type="date"
            value={draftStart}
            max={draftEnd || today}
            onChange={(e) => handleDate('startDate', e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="report-end">Hasta</Label>
          <input
            id="report-end"
            type="date"
            value={draftEnd}
            min={draftStart || undefined}
            max={today}
            onChange={(e) => handleDate('endDate', e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="report-channel">Canal (productos y gráfico)</Label>
          <Select
            value={filters.channel}
            onValueChange={(channel) =>
              onFiltersChange({ ...filters, channel: channel as ReportChannel })
            }
          >
            <SelectTrigger id="report-channel" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="app">App</SelectItem>
              <SelectItem value="phone">Teléfono</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="report-group">Agrupar por</Label>
          <Select
            value={filters.groupBy}
            onValueChange={(groupBy) =>
              onFiltersChange({ ...filters, groupBy: groupBy as ReportGroupBy })
            }
          >
            <SelectTrigger id="report-group" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Día</SelectItem>
              <SelectItem value="week">Semana</SelectItem>
              <SelectItem value="month">Mes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-celtas-red-light text-xs">
          {error}
        </p>
      ) : null}
    </div>
  )
}
