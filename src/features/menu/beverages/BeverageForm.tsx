import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { getApiMessage, isConflict } from '@/lib/api-errors'
import { useCreateBeverage, useUpdateBeverage } from './hooks'
import type { Beverage } from '../types'

/**
 * Reglas espejo del CreateBeverageDto del backend: nombre obligatorio, precio
 * > 0 con máximo 2 decimales, sortOrder entero >= 0.
 */
const beverageSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  price: z
    .coerce.number()
    .refine((v) => Number.isFinite(v), 'El precio debe ser un número')
    .refine((v) => v >= 0.01, 'El precio debe ser mayor a cero')
    .refine((v) => Math.round(v * 100) / 100 === v, 'Máximo 2 decimales'),
  sortOrder: z.coerce
    .number()
    .int('El orden debe ser un número entero')
    .min(0, 'El orden no puede ser negativo'),
  active: z.boolean(),
})

type BeverageFormValues = z.output<typeof beverageSchema>
type BeverageFormInputValues = z.input<typeof beverageSchema>

interface BeverageFormProps {
  /** Si se pasa, edita; si no, crea. */
  beverage?: Beverage
  onClose: () => void
}

/**
 * Formulario crear/editar bebida del catálogo. Mapea el 409 de nombre
 * duplicado al campo "name" (mensaje del backend tal cual, en español) —
 * mismo patrón que SauceForm/CategoryForm/ItemForm.
 */
export function BeverageForm({ beverage, onClose }: BeverageFormProps) {
  const createMutation = useCreateBeverage()
  const updateMutation = useUpdateBeverage()
  const isEditing = Boolean(beverage)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BeverageFormInputValues, unknown, BeverageFormValues>({
    resolver: zodResolver(beverageSchema),
    defaultValues: {
      name: beverage?.name ?? '',
      price: beverage?.price ?? '',
      sortOrder: beverage?.sortOrder ?? 0,
      active: beverage?.active ?? true,
    },
  })

  async function onSubmit(values: BeverageFormValues) {
    setServerError(null)
    const payload = {
      name: values.name.trim(),
      price: values.price,
      sortOrder: values.sortOrder,
      active: values.active,
    }

    try {
      if (isEditing && beverage) {
        await updateMutation.mutateAsync({ id: beverage.id, ...payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
      onClose()
    } catch (error) {
      if (isConflict(error)) {
        const message = getApiMessage(error)
        // 409 de nombre duplicado → error en el campo, no genérico.
        if (/nombre/i.test(message)) {
          setError('name', { message })
        } else {
          setServerError(message)
        }
      } else {
        setServerError(getApiMessage(error, 'No se pudo guardar la bebida'))
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="space-y-4"
    >
      {serverError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo guardar</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="beverage-name">Nombre</Label>
        <Input
          id="beverage-name"
          placeholder="Ej. Coca-Cola 500ml"
          aria-invalid={Boolean(errors.name)}
          {...register('name')}
        />
        {errors.name ? (
          <p className="text-celtas-red-light text-xs">{errors.name.message}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="beverage-price">Precio (S/)</Label>
          <Input
            id="beverage-price"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            placeholder="5.00"
            aria-invalid={Boolean(errors.price)}
            {...register('price')}
          />
          {errors.price ? (
            <p className="text-celtas-red-light text-xs">
              {errors.price.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="beverage-sort-order">Orden</Label>
          <Input
            id="beverage-sort-order"
            type="number"
            inputMode="numeric"
            min={0}
            aria-invalid={Boolean(errors.sortOrder)}
            {...register('sortOrder')}
          />
          {errors.sortOrder ? (
            <p className="text-celtas-red-light text-xs">
              {errors.sortOrder.message}
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
                aria-label="Bebida disponible para asignarse a productos"
              />
            )}
          />
          <span className="text-muted-foreground text-sm">
            Disponible para productos
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
              : 'Crear bebida'}
        </Button>
      </div>
    </form>
  )
}
