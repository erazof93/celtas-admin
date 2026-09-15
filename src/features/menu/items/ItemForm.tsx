import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useBeverages } from '../beverages/hooks'
import { useExtraPortions } from '../extra-portions/hooks'
import { useSauces } from '../sauces/hooks'
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
 * sauceIds/beverageIds/extraPortionIds son opcionales en el backend
 * (undefined/[] = sin selector en la app, ej. arroz chaufa) — acá se
 * normalizan siempre a array, nunca undefined, para no tener que distinguir
 * "no tocado" de "vacío" en un formulario de UI. Los *GroupMaxSelectable son
 * enteros >= 1 (default 1) y *GroupRequired son booleanos (default false) —
 * ambos sin efecto si el catálogo elegido queda vacío (confirmado contra
 * create-menu-item.dto.ts del backend).
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
  sauceIds: z.array(z.string()).default([]),
  sauceGroupRequired: z.boolean(),
  sauceGroupMaxSelectable: z.coerce
    .number()
    .int('Debe ser un número entero')
    .min(1, 'Debe ser al menos 1'),
  beverageIds: z.array(z.string()).default([]),
  beverageGroupRequired: z.boolean(),
  beverageGroupMaxSelectable: z.coerce
    .number()
    .int('Debe ser un número entero')
    .min(1, 'Debe ser al menos 1'),
  extraPortionIds: z.array(z.string()).default([]),
  extraPortionsGroupRequired: z.boolean(),
  extraPortionsGroupMaxSelectable: z.coerce
    .number()
    .int('Debe ser un número entero')
    .min(1, 'Debe ser al menos 1'),
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
  const saucesQuery = useSauces()
  const beveragesQuery = useBeverages()
  const extraPortionsQuery = useExtraPortions()
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
    setValue,
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
      sauceIds: item?.sauces.map((sauce) => sauce.id) ?? [],
      sauceGroupRequired: item?.sauceGroupRequired ?? false,
      sauceGroupMaxSelectable: item?.sauceGroupMaxSelectable ?? 1,
      beverageIds: item?.beverages.map((beverage) => beverage.id) ?? [],
      beverageGroupRequired: item?.beverageGroupRequired ?? false,
      beverageGroupMaxSelectable: item?.beverageGroupMaxSelectable ?? 1,
      extraPortionIds:
        item?.extraPortions.map((extraPortion) => extraPortion.id) ?? [],
      extraPortionsGroupRequired: item?.extraPortionsGroupRequired ?? false,
      extraPortionsGroupMaxSelectable:
        item?.extraPortionsGroupMaxSelectable ?? 1,
    },
  })

  const sauceIds = useWatch({ control, name: 'sauceIds' })
  const beverageIds = useWatch({ control, name: 'beverageIds' })
  const extraPortionIds = useWatch({ control, name: 'extraPortionIds' })

  function buildPayload(values: ItemFormValues) {
    return {
      name: values.name.trim(),
      ...(values.description?.trim()
        ? { description: values.description.trim() }
        : {}),
      price: values.price,
      categoryId: values.categoryId,
      available: values.available,
      sauceIds: values.sauceIds,
      sauceGroupRequired: values.sauceGroupRequired,
      sauceGroupMaxSelectable: values.sauceGroupMaxSelectable,
      beverageIds: values.beverageIds,
      beverageGroupRequired: values.beverageGroupRequired,
      beverageGroupMaxSelectable: values.beverageGroupMaxSelectable,
      extraPortionIds: values.extraPortionIds,
      extraPortionsGroupRequired: values.extraPortionsGroupRequired,
      extraPortionsGroupMaxSelectable: values.extraPortionsGroupMaxSelectable,
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
          <p className="text-celtas-red-light text-xs">{errors.name.message}</p>
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
            <p className="text-celtas-red-light text-xs">{errors.price.message}</p>
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
            <p className="text-celtas-red-light text-xs">{errors.categoryId.message}</p>
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

      <div className="space-y-1.5 pt-2">
        <Label className="text-sm font-medium">Salsas y cremas</Label>
        <p className="text-muted-foreground mb-1 text-xs">
          Qué puede elegir el cliente al agregar este producto al carrito. Sin
          selección = el producto no muestra selector de salsas en la app (ej.
          arroz chaufa).
        </p>
        {saucesQuery.isLoading ? (
          <p className="text-muted-foreground text-xs">Cargando salsas…</p>
        ) : saucesQuery.isError ? (
          <Alert variant="destructive">
            <AlertTitle>No se pudieron cargar las salsas</AlertTitle>
            <AlertDescription>
              Este producto se puede guardar igual, pero no vas a poder
              asignarle salsas hasta que recargues la página.
            </AlertDescription>
          </Alert>
        ) : saucesQuery.data && saucesQuery.data.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Todavía no hay salsas en el catálogo. Créalas primero en la
            pestaña "Salsas" del Menú.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {(saucesQuery.data ?? []).map((sauce) => (
                <label
                  key={sauce.id}
                  className="flex items-center gap-1.5 text-sm"
                >
                  <Checkbox
                    checked={sauceIds?.includes(sauce.id) ?? false}
                    onCheckedChange={(isChecked) => {
                      const current = sauceIds ?? []
                      setValue(
                        'sauceIds',
                        isChecked
                          ? [...current, sauce.id]
                          : current.filter((id) => id !== sauce.id),
                      )
                    }}
                  />
                  <span className={sauce.active ? '' : 'text-muted-foreground'}>
                    {sauce.name}
                    {!sauce.active ? ' (oculta)' : ''}
                  </span>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="item-sauce-max">Máximo a elegir</Label>
                <Input
                  id="item-sauce-max"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  aria-invalid={Boolean(errors.sauceGroupMaxSelectable)}
                  {...register('sauceGroupMaxSelectable')}
                />
                {errors.sauceGroupMaxSelectable ? (
                  <p className="text-celtas-red-light text-xs">
                    {errors.sauceGroupMaxSelectable.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <span className="text-sm font-medium">Obligatorio</span>
                <div className="flex items-center gap-2 pt-0.5">
                  <Controller
                    control={control}
                    name="sauceGroupRequired"
                    render={({ field }) => (
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        aria-label="El cliente debe elegir una salsa"
                      />
                    )}
                  />
                  <span className="text-muted-foreground text-sm">
                    El cliente debe elegir una
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="space-y-1.5 pt-2">
        <Label className="text-sm font-medium">Bebidas</Label>
        <p className="text-muted-foreground mb-1 text-xs">
          Qué puede elegir el cliente al agregar este producto al carrito. Sin
          selección = el producto no muestra selector de bebidas en la app.
        </p>
        {beveragesQuery.isLoading ? (
          <p className="text-muted-foreground text-xs">Cargando bebidas…</p>
        ) : beveragesQuery.isError ? (
          <Alert variant="destructive">
            <AlertTitle>No se pudieron cargar las bebidas</AlertTitle>
            <AlertDescription>
              Este producto se puede guardar igual, pero no vas a poder
              asignarle bebidas hasta que recargues la página.
            </AlertDescription>
          </Alert>
        ) : beveragesQuery.data && beveragesQuery.data.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Todavía no hay bebidas en el catálogo. Créalas primero en la
            pestaña "Bebidas" del Menú.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {(beveragesQuery.data ?? []).map((beverage) => (
                <label
                  key={beverage.id}
                  className="flex items-center gap-1.5 text-sm"
                >
                  <Checkbox
                    checked={beverageIds?.includes(beverage.id) ?? false}
                    onCheckedChange={(isChecked) => {
                      const current = beverageIds ?? []
                      setValue(
                        'beverageIds',
                        isChecked
                          ? [...current, beverage.id]
                          : current.filter((id) => id !== beverage.id),
                      )
                    }}
                  />
                  <span
                    className={beverage.active ? '' : 'text-muted-foreground'}
                  >
                    {beverage.name}
                    {!beverage.active ? ' (oculta)' : ''}
                  </span>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="item-beverage-max">Máximo a elegir</Label>
                <Input
                  id="item-beverage-max"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  aria-invalid={Boolean(errors.beverageGroupMaxSelectable)}
                  {...register('beverageGroupMaxSelectable')}
                />
                {errors.beverageGroupMaxSelectable ? (
                  <p className="text-celtas-red-light text-xs">
                    {errors.beverageGroupMaxSelectable.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <span className="text-sm font-medium">Obligatorio</span>
                <div className="flex items-center gap-2 pt-0.5">
                  <Controller
                    control={control}
                    name="beverageGroupRequired"
                    render={({ field }) => (
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        aria-label="El cliente debe elegir una bebida"
                      />
                    )}
                  />
                  <span className="text-muted-foreground text-sm">
                    El cliente debe elegir una
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="space-y-1.5 pt-2">
        <Label className="text-sm font-medium">Porciones extras</Label>
        <p className="text-muted-foreground mb-1 text-xs">
          Qué puede elegir el cliente al agregar este producto al carrito. Sin
          selección = el producto no muestra selector de porciones extras en
          la app.
        </p>
        {extraPortionsQuery.isLoading ? (
          <p className="text-muted-foreground text-xs">
            Cargando porciones extras…
          </p>
        ) : extraPortionsQuery.isError ? (
          <Alert variant="destructive">
            <AlertTitle>
              No se pudieron cargar las porciones extras
            </AlertTitle>
            <AlertDescription>
              Este producto se puede guardar igual, pero no vas a poder
              asignarle porciones extras hasta que recargues la página.
            </AlertDescription>
          </Alert>
        ) : extraPortionsQuery.data && extraPortionsQuery.data.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Todavía no hay porciones extras en el catálogo. Créalas primero en
            la pestaña "Porciones Extras" del Menú.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {(extraPortionsQuery.data ?? []).map((extraPortion) => (
                <label
                  key={extraPortion.id}
                  className="flex items-center gap-1.5 text-sm"
                >
                  <Checkbox
                    checked={
                      extraPortionIds?.includes(extraPortion.id) ?? false
                    }
                    onCheckedChange={(isChecked) => {
                      const current = extraPortionIds ?? []
                      setValue(
                        'extraPortionIds',
                        isChecked
                          ? [...current, extraPortion.id]
                          : current.filter((id) => id !== extraPortion.id),
                      )
                    }}
                  />
                  <span
                    className={
                      extraPortion.active ? '' : 'text-muted-foreground'
                    }
                  >
                    {extraPortion.name}
                    {!extraPortion.active ? ' (oculta)' : ''}
                  </span>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="item-extra-portion-max">
                  Máximo a elegir
                </Label>
                <Input
                  id="item-extra-portion-max"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  aria-invalid={Boolean(
                    errors.extraPortionsGroupMaxSelectable,
                  )}
                  {...register('extraPortionsGroupMaxSelectable')}
                />
                {errors.extraPortionsGroupMaxSelectable ? (
                  <p className="text-celtas-red-light text-xs">
                    {errors.extraPortionsGroupMaxSelectable.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <span className="text-sm font-medium">Obligatorio</span>
                <div className="flex items-center gap-2 pt-0.5">
                  <Controller
                    control={control}
                    name="extraPortionsGroupRequired"
                    render={({ field }) => (
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        aria-label="El cliente debe elegir una porción extra"
                      />
                    )}
                  />
                  <span className="text-muted-foreground text-sm">
                    El cliente debe elegir una
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
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