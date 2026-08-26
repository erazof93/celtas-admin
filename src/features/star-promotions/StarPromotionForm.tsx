import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/DatePicker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { getApiMessage } from '@/lib/api-errors'
import { isValidStarPromotionDateRange } from './star-promotion-utils'
import { useCreateStarPromotion, useUpdateStarPromotion } from './hooks'
import type { StarPromotion } from './types'

/** Convierte un Date del calendario a YYYY-MM-DD (fecha local, sin hora). */
function toDateInput(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Convierte YYYY-MM-DD a Date local para el DatePicker. */
function parseDateInput(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Reglas espejo de CreateStarPromotionDto/UpdateStarPromotionDto del backend:
 * label obligatorio, multiplier entre 0.01 y 99.99, startDate/endDate
 * OBLIGATORIAS (a diferencia de Banners) con startDate <= endDate.
 */
const starPromotionSchema = z
  .object({
    label: z.string().min(1, 'El label es obligatorio'),
    multiplier: z.coerce
      .number('El multiplicador debe ser un número')
      .min(0.01, 'El multiplicador debe ser mayor a 0')
      .max(99.99, 'El multiplicador no puede superar 99.99'),
    startDate: z.string().min(1, 'La fecha de inicio es obligatoria'),
    endDate: z.string().min(1, 'La fecha de fin es obligatoria'),
    active: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (
      data.startDate &&
      data.endDate &&
      !isValidStarPromotionDateRange(data.startDate, data.endDate)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'startDate debe ser anterior o igual a endDate',
      })
    }
  })

type StarPromotionFormValues = z.output<typeof starPromotionSchema>
type StarPromotionFormInputValues = z.input<typeof starPromotionSchema>

interface StarPromotionFormProps {
  /** Si se pasa, edita; si no, crea. */
  promotion?: StarPromotion | null
  onClose: () => void
}

/**
 * Formulario crear/editar promoción de estrellas. Sin DELETE ni imagen — solo
 * label, multiplier y un rango de fechas calendario (YYYY-MM-DD plano, sin
 * conversión de zona horaria: el backend usa una columna `date`, no timestamp).
 */
export function StarPromotionForm({
  promotion,
  onClose,
}: StarPromotionFormProps) {
  const createMutation = useCreateStarPromotion()
  const updateMutation = useUpdateStarPromotion()
  const isEditing = Boolean(promotion)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<StarPromotionFormInputValues, unknown, StarPromotionFormValues>({
    resolver: zodResolver(starPromotionSchema),
    defaultValues: {
      label: promotion?.label ?? '',
      multiplier: promotion?.multiplier ?? 2,
      startDate: promotion?.startDate ?? '',
      endDate: promotion?.endDate ?? '',
      active: promotion?.active ?? true,
    },
  })

  const startDate = watch('startDate')
  const endDate = watch('endDate')

  async function onSubmit(values: StarPromotionFormValues) {
    setServerError(null)

    const payload = {
      label: values.label.trim(),
      multiplier: values.multiplier,
      startDate: values.startDate,
      endDate: values.endDate,
      active: values.active,
    }

    try {
      if (isEditing && promotion) {
        await updateMutation.mutateAsync({ id: promotion.id, ...payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
      onClose()
    } catch (error) {
      const message = getApiMessage(
        error,
        'No se pudo guardar la promoción',
      )
      if (/fechas/i.test(message)) {
        setError('endDate', { message })
      } else {
        setServerError(message)
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo guardar</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="star-promotion-label">Etiqueta</Label>
        <Input
          id="star-promotion-label"
          placeholder="Ej. Navidad 2026"
          aria-invalid={Boolean(errors.label)}
          {...register('label')}
        />
        {errors.label ? (
          <p className="text-celtas-red-light text-xs">
            {errors.label.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="star-promotion-multiplier">Multiplicador</Label>
        <Input
          id="star-promotion-multiplier"
          type="number"
          step="0.01"
          placeholder="Ej. 2"
          aria-invalid={Boolean(errors.multiplier)}
          {...register('multiplier')}
        />
        {errors.multiplier ? (
          <p className="text-celtas-red-light text-xs">
            {errors.multiplier.message}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Inicio de vigencia</Label>
          <Controller
            control={control}
            name="startDate"
            render={({ field }) => (
              <DatePicker
                value={field.value ? parseDateInput(field.value) : null}
                onChange={(date) =>
                  field.onChange(date ? toDateInput(date) : '')
                }
                placeholder="Selecciona una fecha"
                toDate={endDate ? parseDateInput(endDate) : undefined}
                clearLabel="Limpiar inicio de vigencia"
              />
            )}
          />
          {errors.startDate ? (
            <p className="text-celtas-red-light text-xs">
              {errors.startDate.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label>Fin de vigencia</Label>
          <Controller
            control={control}
            name="endDate"
            render={({ field }) => (
              <DatePicker
                value={field.value ? parseDateInput(field.value) : null}
                onChange={(date) =>
                  field.onChange(date ? toDateInput(date) : '')
                }
                placeholder="Selecciona una fecha"
                fromDate={startDate ? parseDateInput(startDate) : undefined}
                clearLabel="Limpiar fin de vigencia"
              />
            )}
          />
          {errors.endDate ? (
            <p className="text-celtas-red-light text-xs">
              {errors.endDate.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">Activa</span>
        <div className="flex items-center gap-2 pt-0.5">
          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-label="Promoción activa"
              />
            )}
          />
          <span className="text-muted-foreground text-sm">
            Habilitada mientras esté dentro de las fechas de vigencia
          </span>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Guardando…'
            : isEditing
              ? 'Guardar cambios'
              : 'Crear promoción'}
        </Button>
      </div>
    </form>
  )
}
