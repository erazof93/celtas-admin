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
import { isValidBannerDateRange } from './banner-utils'
import { useCreateBanner, useUpdateBanner, useUploadBannerImage } from './hooks'
import type { Banner, BannerActionType } from './types'

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
 */
const bannerSchema = z
  .object({
    title: z.string().min(1, 'El título es obligatorio'),
    actionType: z.enum(['none', 'category', 'menuItem', 'external_url']),
    actionValue: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    active: z.boolean(),
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
  const isEditing = Boolean(banner)
  const [serverError, setServerError] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)

  const {
    register,
    handleSubmit,
    control,
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
    },
  })

  // useWatch en vez de watch(): la regla react-hooks/incompatible-library
  // marca watch() como no memoizable por el compilador de React.
  const actionType = useWatch({ control, name: 'actionType' })
  const startDate = useWatch({ control, name: 'startDate' })
  const endDate = useWatch({ control, name: 'endDate' })

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
                onValueChange={(value) =>
                  field.onChange(value as BannerActionType)
                }
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
          <Input
            id="banner-action-value"
            placeholder={
              actionType === 'category'
                ? 'Slug de la categoría (ej. burgers)'
                : actionType === 'menuItem'
                  ? 'ID del producto'
                  : actionType === 'external_url'
                    ? 'https://…'
                    : '—'
            }
            disabled={actionType === 'none'}
            aria-invalid={Boolean(errors.actionValue)}
            {...register('actionValue')}
          />
          {errors.actionValue ? (
            <p className="text-celtas-red-light text-xs">
              {errors.actionValue.message}
            </p>
          ) : null}
        </div>
      </div>

      <p className="text-muted-foreground -mt-1 text-xs">
        {actionType === 'category'
          ? 'El slug de categoría se escribe a mano por ahora (el selector real llega con el módulo de Usuarios/Menú).'
          : actionType === 'menuItem'
            ? 'El ID del producto se escribe a mano por ahora (el selector real llega con el módulo de Usuarios/Menú).'
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