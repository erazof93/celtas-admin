import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getApiMessage, isConflict } from '@/lib/api-errors'
import { useCreateCategory, useUpdateCategory } from './hooks'
import type { Category } from '../types'

/**
 * Reglas espejo del CreateCategoryDto del backend: nombre obligatorio,
 * descripción opcional (no vacía si se manda), sortOrder entero >= 0.
 */
const categorySchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  description: z.string().optional(),
  sortOrder: z.coerce
    .number()
    .int('El orden debe ser un número entero')
    .min(0, 'El orden no puede ser negativo'),
  active: z.boolean(),
})

type CategoryFormValues = z.output<typeof categorySchema>
type CategoryFormInputValues = z.input<typeof categorySchema>

interface CategoryFormProps {
  /** Si se pasa, edita; si no, crea. */
  category?: Category
  onClose: () => void
}

/**
 * Formulario crear/editar categoría. Mapea el 409 de nombre duplicado al campo
 * "name" (mensaje del backend tal cual, en español); el resto de errores se
 * muestran como alerta del formulario.
 */
export function CategoryForm({ category, onClose }: CategoryFormProps) {
  const createMutation = useCreateCategory()
  const updateMutation = useUpdateCategory()
  const isEditing = Boolean(category)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormInputValues, unknown, CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? '',
      description: category?.description ?? '',
      sortOrder: category?.sortOrder ?? 0,
      active: category?.active ?? true,
    },
  })

  async function onSubmit(values: CategoryFormValues) {
    setServerError(null)
    const payload = {
      name: values.name.trim(),
      ...(values.description?.trim() ? { description: values.description.trim() } : {}),
      sortOrder: values.sortOrder,
      active: values.active,
    }

    try {
      if (isEditing && category) {
        await updateMutation.mutateAsync({ id: category.id, ...payload })
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
        setServerError(getApiMessage(error, 'No se pudo guardar la categoría'))
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
        <Label htmlFor="category-name">Nombre</Label>
        <Input
          id="category-name"
          placeholder="Ej. Burgers"
          aria-invalid={Boolean(errors.name)}
          {...register('name')}
        />
        {errors.name ? (
          <p className="text-celtas-red text-xs">{errors.name.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="category-description">Descripción</Label>
        <Textarea
          id="category-description"
          placeholder="Ej. Hamburguesas artesanales"
          rows={2}
          {...register('description')}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="category-sort-order">Orden</Label>
          <Input
            id="category-sort-order"
            type="number"
            inputMode="numeric"
            min={0}
            aria-invalid={Boolean(errors.sortOrder)}
            {...register('sortOrder')}
          />
          {errors.sortOrder ? (
            <p className="text-celtas-red text-xs">{errors.sortOrder.message}</p>
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
                  aria-label="Categoría activa en la app"
                />
              )}
            />
            <span className="text-muted-foreground text-sm">
              Visible en la app
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
              : 'Crear categoría'}
        </Button>
      </div>
    </form>
  )
}