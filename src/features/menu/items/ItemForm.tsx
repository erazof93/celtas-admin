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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getApiMessage, getApiStatus, isConflict, isNotFound } from '@/lib/api-errors'
import { useCategories } from '../categories/hooks'
import {
  useCreateItem,
  useUpdateItem,
  useUploadItemImage,
} from './hooks'
import { ImageUpload } from '@/components/ui/ImageUpload'
import type { MenuItem } from '../types'

/**
 * Reglas espejo del CreateMenuItemDto: nombre obligatorio, precio > 0 con
 * máximo 2 decimales, categoryId UUID obligatorio, available booleano.
 */
const itemSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  description: z.string().optional(),
  price: z
    .coerce.number()
    .refine((v) => Number.isFinite(v), 'El precio debe ser un número')
    .refine((v) => v >= 0.01, 'El precio debe ser mayor a cero')
    .refine((v) => Math.round(v * 100) / 100 === v, 'Máximo 2 decimales'),
  categoryId: z.string().min(1, 'Selecciona una categoría'),
  available: z.boolean(),
})

type ItemFormValues = z.output<typeof itemSchema>
type ItemFormInputValues = z.input<typeof itemSchema>

interface ItemFormProps {
  /** Si se pasa, edita; si no, crea. */
  item?: MenuItem
  onClose: () => void
}

/**
 * Formulario crear/editar producto.
 *
 * Flujo de imagen real del backend: primero se crea el item y luego se sube la
 * imagen a POST /menu/items/:id/image. Si la creación ya existió (edición o
 * reintento tras fallo de subida), se actualiza en vez de crear de nuevo.
 *
 * Errores de negocio mapeados:
 * - 409 nombre duplicado → campo "name" (mensaje del backend tal cual).
 * - 404 categoría inexistente → campo "categoryId".
 * - 400 de subida de imagen → área de imagen, no error genérico.
 */
export function ItemForm({ item, onClose }: ItemFormProps) {
  const categoriesQuery = useCategories()
  const createMutation = useCreateItem()
  const updateMutation = useUpdateItem()
  const uploadMutation = useUploadItemImage()
  const isEditing = Boolean(item)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  // En la creación, el item casi se crea y luego se sube la imagen; si la
  // subida falla y se reintenta, se usa este id en vez de crear duplicado.
  const [createdId, setCreatedId] = useState<string | null>(item?.id ?? null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ItemFormInputValues, unknown, ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: item?.name ?? '',
      description: item?.description ?? '',
      price: item?.price ?? '',
      categoryId: item?.categoryId ?? '',
      available: item?.available ?? true,
    },
  })

  function buildPayload(values: ItemFormValues) {
    return {
      name: values.name.trim(),
      ...(values.description?.trim()
        ? { description: values.description.trim() }
        : {}),
      price: values.price,
      categoryId: values.categoryId,
      available: values.available,
    }
  }

  async function onSubmit(values: ItemFormValues) {
    setServerError(null)
    setImageError(null)
    const payload = buildPayload(values)

    try {
      let id = createdId
      if (item) {
        await updateMutation.mutateAsync({ id: item.id, ...payload })
        id = item.id
      } else if (id) {
        await updateMutation.mutateAsync({ id, ...payload })
      } else {
        const created = await createMutation.mutateAsync(payload)
        id = created.id
        setCreatedId(id)
      }

      if (selectedFile && id) {
        await uploadMutation.mutateAsync({ id, file: selectedFile })
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
      } else if (isNotFound(error)) {
        const message = getApiMessage(error)
        if (/categor[aí]/i.test(message)) {
          setError('categoryId', { message })
        } else {
          setServerError(message)
        }
      } else if (
        getApiStatus(error) === 400 &&
        /(imagen|archivo|m\xE1ximo)/i.test(getApiMessage(error))
      ) {
        setImageError(getApiMessage(error))
      } else {
        setServerError(getApiMessage(error, 'No se pudo guardar el producto'))
      }
    }
  }

  const categories = categoriesQuery.data ?? []

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo guardar</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      {categoriesQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudieron cargar las categorías</AlertTitle>
          <AlertDescription>
            Sin categorías no se puede guardar un producto. Recarga la página y
            vuelve a intentar.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="item-name">Nombre</Label>
        <Input
          id="item-name"
          placeholder="Ej. Celtas Burger Clásica"
          aria-invalid={Boolean(errors.name)}
          {...register('name')}
        />
        {errors.name ? (
          <p className="text-celtas-red text-xs">{errors.name.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="item-description">Descripción</Label>
        <Textarea
          id="item-description"
          placeholder="Ej. Doble carne, queso cheddar y papas"
          rows={2}
          {...register('description')}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="item-price">Precio (S/)</Label>
          <Input
            id="item-price"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            placeholder="24.90"
            aria-invalid={Boolean(errors.price)}
            {...register('price')}
          />
          {errors.price ? (
            <p className="text-celtas-red text-xs">{errors.price.message}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="item-category">Categoría</Label>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <Select
                value={field.value || undefined}
                onValueChange={field.onChange}
                disabled={categoriesQuery.isLoading}
              >
                <SelectTrigger
                  id="item-category"
                  className="w-full"
                  aria-invalid={Boolean(errors.categoryId)}
                >
                  <SelectValue
                    placeholder={
                      categoriesQuery.isLoading
                        ? 'Cargando categorías…'
                        : 'Selecciona una categoría'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.categoryId ? (
            <p className="text-celtas-red text-xs">{errors.categoryId.message}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">Disponible</span>
        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="available"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-label="Producto disponible para pedir"
              />
            )}
          />
          <span className="text-muted-foreground text-sm">
            Se muestra en la app
          </span>
        </div>
      </div>

      <ImageUpload
        existingImage={item?.image}
        onChange={(file) => {
          // Al elegir un archivo nuevo se limpia el error de una subida previa.
          setImageError(null)
          setSelectedFile(file)
        }}
        serverError={imageError}
        disabled={isSubmitting}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || categoriesQuery.isLoading || categoriesQuery.isError}
        >
          {isSubmitting
            ? 'Guardando…'
            : isEditing
              ? 'Guardar cambios'
              : 'Crear producto'}
        </Button>
      </div>
    </form>
  )
}