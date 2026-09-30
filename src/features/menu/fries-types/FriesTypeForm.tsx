import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getApiMessage, isConflict } from '@/lib/api-errors'
import { useCreateFriesType, useUpdateFriesType } from './hooks'
import type { FriesType } from '../types'

/** Reglas espejo del CreateFriesTypeDto del backend: nombre obligatorio, máx. 100. */
const friesTypeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(100, 'El nombre no puede superar los 100 caracteres'),
  isDefault: z.boolean(),
})

type FriesTypeFormValues = z.output<typeof friesTypeSchema>
type FriesTypeFormInputValues = z.input<typeof friesTypeSchema>

interface FriesTypeFormProps {
  /** Si se pasa, edita; si no, crea. */
  friesType?: FriesType
  onClose: () => void
}

/**
 * Formulario crear/editar tipo de papas. Mapea el 409 de nombre duplicado al
 * campo "name" (mensaje del backend tal cual) — mismo patrón que SauceForm.
 */
export function FriesTypeForm({ friesType, onClose }: FriesTypeFormProps) {
  const createMutation = useCreateFriesType()
  const updateMutation = useUpdateFriesType()
  const isEditing = Boolean(friesType)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FriesTypeFormInputValues, unknown, FriesTypeFormValues>({
    resolver: zodResolver(friesTypeSchema),
    defaultValues: {
      name: friesType?.name ?? '',
      isDefault: friesType?.isDefault ?? false,
    },
  })

  async function onSubmit(values: FriesTypeFormValues) {
    setServerError(null)
    const payload = { name: values.name, isDefault: values.isDefault }

    try {
      if (isEditing && friesType) {
        await updateMutation.mutateAsync({ id: friesType.id, ...payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
      onClose()
    } catch (error) {
      if (isConflict(error)) {
        const message = getApiMessage(error)
        if (/nombre/i.test(message)) {
          setError('name', { message })
        } else {
          setServerError(message)
        }
      } else {
        setServerError(
          getApiMessage(error, 'No se pudo guardar el tipo de papas'),
        )
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {serverError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo guardar</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="fries-type-name">Nombre</Label>
        <Input
          id="fries-type-name"
          placeholder="Ej. Papas al hilo"
          maxLength={100}
          aria-invalid={Boolean(errors.name)}
          {...register('name')}
        />
        {errors.name ? (
          <p className="text-celtas-red-light text-xs">{errors.name.message}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="isDefault"
            render={({ field }) => (
              <Checkbox
                id="fries-type-default"
                checked={field.value}
                onCheckedChange={(isChecked) => field.onChange(isChecked === true)}
              />
            )}
          />
          <Label htmlFor="fries-type-default" className="text-sm font-normal">
            Por defecto
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">
          Opción preseleccionada en la app. Solo puede haber una: marcar esta
          desmarca la anterior.
        </p>
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
              : 'Crear tipo de papas'}
        </Button>
      </div>
    </form>
  )
}
