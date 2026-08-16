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
import { useCreateSauce, useUpdateSauce } from './hooks'
import type { Sauce } from '../types'

/** Reglas espejo del CreateSauceDto del backend: nombre obligatorio, sortOrder entero >= 0. */
const sauceSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  sortOrder: z.coerce
    .number()
    .int('El orden debe ser un número entero')
    .min(0, 'El orden no puede ser negativo'),
  active: z.boolean(),
})

type SauceFormValues = z.output<typeof sauceSchema>
type SauceFormInputValues = z.input<typeof sauceSchema>

interface SauceFormProps {
  /** Si se pasa, edita; si no, crea. */
  sauce?: Sauce
  onClose: () => void
}

/**
 * Formulario crear/editar salsa del catálogo. Mapea el 409 de nombre
 * duplicado al campo "name" (mensaje del backend tal cual, en español) —
 * mismo patrón que CategoryForm/ItemForm.
 */
export function SauceForm({ sauce, onClose }: SauceFormProps) {
  const createMutation = useCreateSauce()
  const updateMutation = useUpdateSauce()
  const isEditing = Boolean(sauce)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SauceFormInputValues, unknown, SauceFormValues>({
    resolver: zodResolver(sauceSchema),
    defaultValues: {
      name: sauce?.name ?? '',
      sortOrder: sauce?.sortOrder ?? 0,
      active: sauce?.active ?? true,
    },
  })

  async function onSubmit(values: SauceFormValues) {
    setServerError(null)
    const payload = {
      name: values.name.trim(),
      sortOrder: values.sortOrder,
      active: values.active,
    }

    try {
      if (isEditing && sauce) {
        await updateMutation.mutateAsync({ id: sauce.id, ...payload })
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
        setServerError(getApiMessage(error, 'No se pudo guardar la salsa'))
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
        <Label htmlFor="sauce-name">Nombre</Label>
        <Input
          id="sauce-name"
          placeholder="Ej. Mayonesa"
          aria-invalid={Boolean(errors.name)}
          {...register('name')}
        />
        {errors.name ? (
          <p className="text-celtas-red-light text-xs">{errors.name.message}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="sauce-sort-order">Orden</Label>
          <Input
            id="sauce-sort-order"
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
                  aria-label="Salsa disponible para asignarse a productos"
                />
              )}
            />
            <span className="text-muted-foreground text-sm">
              Disponible para productos
            </span>
          </div>
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
              : 'Crear salsa'}
        </Button>
      </div>
    </form>
  )
}
