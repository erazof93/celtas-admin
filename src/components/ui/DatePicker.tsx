import { useState } from 'react'
import { CalendarIcon, XIcon } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import { es } from 'react-day-picker/locale'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  /** Fecha seleccionada (Date local del calendario, sin hora). */
  value?: Date | null
  onChange: (date: Date | null) => void
  placeholder?: string
  disabled?: boolean
  /** Fecha mínima seleccionable (ej. hoy para startDate). */
  fromDate?: Date
  /** Fecha máxima seleccionable (ej. endDate para startDate). */
  toDate?: Date
  /** Nombre accesible del botón de limpiar (ej. "Limpiar inicio de vigencia"). */
  clearLabel?: string
}

/**
 * Date picker con popover (Radix) + react-day-picker, en español.
 * Trabaja con fechas del calendario (sin hora); la conversión a la zona de
 * Lima la hace el formulario con limaDateToUtc/utcToLimaDateInput.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Selecciona una fecha',
  disabled,
  fromDate,
  toDate,
  clearLabel = 'Limpiar fecha',
}: DatePickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              'w-full justify-start text-left font-normal',
              !value && 'text-muted-foreground',
              value && 'pr-8',
            )}
          >
            <CalendarIcon />
            {value
              ? value.toLocaleDateString('es-PE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })
              : placeholder}
          </Button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="border-popover-foreground/10 bg-popover text-popover-foreground z-50 rounded-xl border p-2 shadow-md"
        >
          <DayPicker
            mode="single"
            selected={value ?? undefined}
            onSelect={(date) => {
              onChange(date ?? null)
              setOpen(false)
            }}
            locale={es}
            showOutsideDays
            disabled={[
              ...(fromDate ? [{ before: fromDate }] : []),
              ...(toDate ? [{ after: toDate }] : []),
            ]}
            classNames={{
              months: 'flex flex-col',
              month: 'space-y-2',
              month_caption: 'flex justify-center',
              caption_label: 'text-sm font-medium',
              nav: 'flex items-center justify-between',
              button_previous: 'inline-flex size-7 items-center justify-center rounded-md hover:bg-muted',
              button_next: 'inline-flex size-7 items-center justify-center rounded-md hover:bg-muted',
              weekdays: 'flex',
              weekday: 'text-muted-foreground w-8 text-center text-xs font-medium',
              week: 'flex w-full',
              day: cn(
                'inline-flex size-8 items-center justify-center rounded-md text-sm',
                'hover:bg-muted',
                'aria-selected:bg-celtas-orange aria-selected:text-white',
                'disabled:pointer-events-none disabled:opacity-40',
              ),
              today: 'ring-1 ring-inset ring-celtas-orange/50',
              outside: 'text-muted-foreground/50',
            }}
          />
        </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      {value && !disabled ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onChange(null)
            setOpen(false)
          }}
          aria-label={clearLabel}
          className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5"
        >
          <XIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}