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
import { DatePicker } from '@/components/ui/DatePicker'
import { ImageUpload } from '@/components/ui/ImageUpload'
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
import { getApiMessage } from '@/lib/api-errors'
import { limaDateToUtc, utcToLimaDateInput } from '@/lib/dates'
import { useCategories } from '../menu/categories/hooks'
import { useMenuItems } from '../menu/items/hooks'
import { isValidBannerDateRange } from './banner-utils'
import { useCreateBanner, useUpdateBanner, useUploadBannerImage } from './hooks'
import type { Banner, BannerActionType } from './types'

/** Días de la semana abreviados (0=domingo ... 6=sábado), igual que el backend. */
const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

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
 * Reglas espejo del CreateBannerDto del backend: título obligatorio,
 * actionValue obligatorio si actionType no es none, y startDate < endDate
 * cuando vienen ambas (validado en el cliente para evitar el submit inútil).
 * daysOfWeek es un array opcional de enteros 0-6.
 */
const bannerSchema = z
  .object({
    title: z.string().min(1, 'El título es obligatorio'),
    actionType: z.enum(['none', 'category', 'menuItem', 'external_url']),
    actionValue: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    active: z.boolean(),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.actionType !== 'none' && !data.actionValue?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['actionValue'],
        message: 'actionValue es obligatorio cuando actionType no es none',
      })
    }
    if (
      data.startDate &&
      data.endDate &&
      !isValidBannerDateRange(data.startDate, data.endDate)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'startDate debe ser anterior a endDate',
      })
    }
  })

type BannerFormValues = z.output<typeof bannerSchema>
type BannerFormInputValues = z.input<typeof bannerSchema>

interface BannerFormProps {
  /** Si se pasa, edita; si no, crea. */
  banner?: Banner | null
  onClose: () => void
}

/**
 * Formulario crear/editar banner. La imagen se sube en 2 pasos (flujo real del
 * backend): primero se crea/actualiza el banner y luego POST /banners/:id/image.
 */
export function BannerForm({ banner, onClose }: BannerFormProps) {
  const createMutation = useCreateBanner()
  const updateMutation = useUpdateBanner()
  const uploadMutation = useUploadBannerImage()
  // Opciones reales para el selector de acción: categorías (por id) y
  // productos (por id). Se cargan aunque actionType sea none/external_url
  // para que el cache esté listo si el admin cambia de tipo.
  const categoriesQuery = useCategories()
  const itemsQuery = useMenuItems()
  const isEditing = Boolean(banner)
  const [serverError, setServerError] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BannerFormInputValues, unknown, BannerFormValues>({
    resolver: zodResolver(bannerSchema),
    defaultValues: {
      title: banner?.title ?? '',
      actionType: banner?.actionType ?? 'none',
      actionValue: banner?.actionValue ?? '',
      startDate: banner?.startDate ? utcToLimaDateInput(banner.startDate) : '',
      endDate: banner?.endDate ? utcToLimaDateInput(banner.endDate) : '',
      active: banner?.active ?? true,
      // null del backend → [] en el formulario (más fácil de manejar con checkboxes)
      daysOfWeek: banner?.daysOfWeek ?? [],
    },
  })

  // useWatch en vez de watch(): la regla react-hooks/incompatible-library
  // marca watch() como no memoizable por el compilador de React.
  const actionType = useWatch({ control, name: 'actionType' })
  const startDate = useWatch({ control, name: 'startDate' })
  const endDate = useWatch({ control, name: 'endDate' })
  const daysOfWeek = useWatch({ control, name: 'daysOfWeek' })

  async function onSubmit(values: BannerFormValues) {
    setServerError(null)
    setImageError(null)

    const payload = {
      title: values.title.trim(),
      actionType: values.actionType,
      ...(values.actionType !== 'none' && values.actionValue?.trim()
        ? { actionValue: values.actionValue.trim() }
        : {}),
      // Fechas en zona Lima: startDate inicia a las 00:00 y endDate termina a
      // las 23:59:59 de ese día (el día completo cuenta como vigente).
      ...(values.startDate
        ? { startDate: limaDateToUtc(values.startDate).toISOString() }
        : {}),
      ...(values.endDate
        ? { endDate: limaDateToUtc(values.endDate, true).toISOString() }
        : {}),
      active: values.active,
      // Array vacío → null (todos los días, igual que el backend).
      daysOfWeek:
        values.daysOfWeek && values.daysOfWeek.length > 0
          ? values.daysOfWeek
          : null,
    }

    try {
      let saved: Banner
      if (isEditing && banner) {
        saved = await updateMutation.mutateAsync({ id: banner.id, ...payload })
      } else {
        saved = await createMutation.mutateAsync(payload)
      }

      // Paso 2: subir la imagen si el admin eligió una.
      if (imageFile) {
        try {
          await uploadMutation.mutateAsync({ id: saved.id, file: imageFile })
        } catch (uploadError) {
          // El banner ya quedó creado; el error de imagen no debe perderlo.
          setImageError(
            getApiMessage(uploadError, 'No se pudo subir la imagen'),
          )
          return
        }
      }
      onClose()
    } catch (error) {
      const message = getApiMessage(error, 'No se pudo guardar el banner')
      if (/startDate|endDate|fecha/i.test(message)) {
        setError('endDate', { message })
      } else if (/actionValue/i.test(message)) {
        setError('actionValue', { message })
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
        <Label htmlFor="banner-title">Título</Label>
        <Input
          id="banner-title"
          placeholder="Ej. 2x1 en burgers"
          aria-invalid={Boolean(errors.title)}
          {...register('title')}
        />
        {errors.title ? (
          <p className="text-celtas-red-light text-xs">{errors.title.message}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="banner-action-type">Acción al tocar</Label>
          <Controller
            control={control}
            name="actionType"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => {
                  const next = value as BannerActionType
                  // Al cambiar el tipo de acción, el valor anterior no aplica
                  // (un id de categoría no sirve como id de producto ni como
                  // URL). Se limpia para no guardar un actionValue huérfano.
                  if (next !== field.value) {
                    setValue('actionValue', '')
                  }
                  field.onChange(next)
                }}
              >
                <SelectTrigger id="banner-action-type">
                  <SelectValue placeholder="Acción" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin acción</SelectItem>
                  <SelectItem value="category">Categoría</SelectItem>
                  <SelectItem value="menuItem">Producto</SelectItem>
                  <SelectItem value="external_url">URL externa</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="banner-action-value">Valor de la acción</Label>
          {actionType === 'category' ? (
            <Controller
              control={control}
              name="actionValue"
              render={({ field }) => {
                const categories = categoriesQuery.data ?? []
                const hasMatch = categories.some((c) => c.id === field.value)
                return (
                  <Select
                    value={field.value || undefined}
                    onValueChange={field.onChange}
                    disabled={
                      categoriesQuery.isLoading || categoriesQuery.isError
                    }
                  >
                    <SelectTrigger
                      id="banner-action-value"
                      className="w-full"
                      aria-invalid={Boolean(errors.actionValue)}
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
                      {/* Banner creado antes del selector: el valor guardado
                          (slug escrito a mano) no matchea ninguna categoría.
                          Se muestra como opción para no perderlo al guardar. */}
                      {field.value && !hasMatch ? (
                        <SelectItem value={field.value}>
                          {field.value} (sin coincidencia)
                        </SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                )
              }}
            />
          ) : actionType === 'menuItem' ? (
            <Controller
              control={control}
              name="actionValue"
              render={({ field }) => {
                const items = itemsQuery.data ?? []
                const hasMatch = items.some((i) => i.id === field.value)
                return (
                  <Select
                    value={field.value || undefined}
                    onValueChange={field.onChange}
                    disabled={itemsQuery.isLoading || itemsQuery.isError}
                  >
                    <SelectTrigger
                      id="banner-action-value"
                      className="w-full"
                      aria-invalid={Boolean(errors.actionValue)}
                    >
                      <SelectValue
                        placeholder={
                          itemsQuery.isLoading
                            ? 'Cargando productos…'
                            : 'Selecciona un producto'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                      {field.value && !hasMatch ? (
                        <SelectItem value={field.value}>
                          {field.value} (sin coincidencia)
                        </SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                )
              }}
            />
          ) : (
            <Input
              id="banner-action-value"
              placeholder={
                actionType === 'external_url' ? 'https://…' : '—'
              }
              disabled={actionType === 'none'}
              aria-invalid={Boolean(errors.actionValue)}
              {...register('actionValue')}
            />
          )}
          {errors.actionValue ? (
            <p className="text-celtas-red-light text-xs">
              {errors.actionValue.message}
            </p>
          ) : null}
          {actionType === 'category' && categoriesQuery.isError ? (
            <p className="text-celtas-red-light text-xs">
              No se pudieron cargar las categorías. Recarga la página y vuelve
              a intentar.
            </p>
          ) : null}
          {actionType === 'menuItem' && itemsQuery.isError ? (
            <p className="text-celtas-red-light text-xs">
              No se pudieron cargar los productos. Recarga la página y vuelve a
              intentar.
            </p>
          ) : null}
        </div>
      </div>

      <p className="text-muted-foreground -mt-1 text-xs">
        {actionType === 'category'
          ? 'El banner lleva a la categoría seleccionada del menú.'
          : actionType === 'menuItem'
            ? 'El banner lleva al detalle del producto seleccionado.'
            : actionType === 'external_url'
              ? 'URL externa a la que lleva el banner al tocarlo.'
              : 'El banner no lleva a ningún lado al tocarlo.'}
      </p>

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
                placeholder="Sin fecha de inicio"
                toDate={endDate ? parseDateInput(endDate) : undefined}
              />
            )}
          />
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
                placeholder="Sin fecha de fin"
                fromDate={startDate ? parseDateInput(startDate) : undefined}
              />
            )}
          />
          {errors.endDate ? (
            <p className="text-celtas-red-light text-xs">{errors.endDate.message}</p>
          ) : null}
        </div>
      </div>

      <p className="text-muted-foreground -mt-1 text-xs">
        Sin fechas = vigente mientras esté activo. El inicio cuenta desde las
        00:00 y el fin hasta las 23:59 de esas fechas (hora de Lima).
      </p>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">Activo</span>
        <div className="flex items-center gap-2 pt-0.5">
          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-label="Banner activo en la app"
              />
            )}
          />
          <span className="text-muted-foreground text-sm">
            Visible en la app (si está dentro de las fechas)
          </span>
        </div>
      </div>

      <div className="space-y-1.5 pt-2">
        <Label className="text-sm font-medium">Días de la semana</Label>
        <p className="text-xs text-muted-foreground mb-1">
          Sin selección = se muestra todos los días
        </p>
        <div className="grid grid-cols-7 gap-1.5">
          {[0, 1, 2, 3, 4, 5, 6].map((day) => (
            <label key={day} className="flex flex-col items-center gap-0.5 text-xs">
              <Checkbox
                checked={daysOfWeek && daysOfWeek.includes(day)}
                onCheckedChange={(isChecked) => {
                  if (isChecked) {
                    setValue('daysOfWeek', [...(daysOfWeek ?? []), day])
                  } else {
                    setValue(
                      'daysOfWeek',
                      (daysOfWeek ?? []).filter((d) => d !== day),
                    )
                  }
                }}
              />
              <span className="text-caption capitalize">{DAY_LABELS[day]}</span>
            </label>
          ))}
        </div>
      </div>

      <ImageUpload
        existingImage={banner?.imageUrl}
        onChange={setImageFile}
        serverError={imageError}
        label="Imagen del banner"
        altText="Imagen del banner"
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Guardando…'
            : isEditing
              ? 'Guardar cambios'
              : 'Crear banner'}
        </Button>
      </div>
    </form>
  )
}