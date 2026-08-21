import { useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, Plus, Trash2, Truck } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ErrorState } from '@/components/ui/ErrorState'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/LoadingState'
import { getApiMessage } from '@/lib/api-errors'
import { buildAddressMapUrl, buildGoogleMapsUrl } from '../users/users-utils'
import { useSettings, useUpsertSetting } from './hooks'
import {
  DELIVERY_ALERT_RADIUS_METERS_DESCRIPTION,
  DELIVERY_ALERT_RADIUS_METERS_KEY,
  DELIVERY_FEE_TIERS_DESCRIPTION,
  DELIVERY_FEE_TIERS_KEY,
  parseDeliveryAlertRadiusMeters,
  parseDeliveryFeeTiers,
  parseStoreLocation,
  serializeDeliveryFeeTiers,
  serializeStoreLocation,
  STORE_LOCATION_DESCRIPTION,
  STORE_LOCATION_KEY,
  validateDeliveryFeeTiers,
} from './settings-utils'
import type { DeliveryFeeTier } from './types'

/**
 * Un tramo en el formulario: `maxMeters` es texto ('' = sin límite, solo
 * válido en el último tramo) para poder representar el campo vacío mientras
 * se edita sin pelear con `z.coerce.number()`.
 */
const tierRowSchema = z.object({
  maxMeters: z.string(),
  fee: z.coerce.number('La tarifa debe ser un número'),
})

const deliverySchema = z
  .object({
    latitude: z.coerce
      .number('La latitud debe ser un número')
      .min(-90, 'La latitud debe estar entre -90 y 90')
      .max(90, 'La latitud debe estar entre -90 y 90'),
    longitude: z.coerce
      .number('La longitud debe ser un número')
      .min(-180, 'La longitud debe estar entre -180 y 180')
      .max(180, 'La longitud debe estar entre -180 y 180'),
    tiers: z.array(tierRowSchema).min(1, 'Agrega al menos un tramo'),
    alertRadiusMeters: z.coerce
      .number('El radio debe ser un número')
      .positive('El radio debe ser mayor a 0'),
  })
  .superRefine((data, ctx) => {
    const tiers: DeliveryFeeTier[] = data.tiers.map((row) => ({
      maxMeters: row.maxMeters.trim() === '' ? null : Number(row.maxMeters),
      fee: row.fee,
    }))
    // Un maxMeters no numérico (texto suelto) no es "sin límite": se marca
    // inválido en su propio campo antes de correr la validación de orden.
    data.tiers.forEach((row, i) => {
      if (row.maxMeters.trim() !== '' && !Number.isFinite(Number(row.maxMeters))) {
        ctx.addIssue({
          code: 'custom',
          path: ['tiers', i, 'maxMeters'],
          message: 'Debe ser un número o quedar vacío (solo el último tramo)',
        })
      }
    })
    const error = validateDeliveryFeeTiers(tiers)
    if (error) {
      ctx.addIssue({
        code: 'custom',
        path: error.index === -1 ? ['tiers'] : ['tiers', error.index, 'maxMeters'],
        message: error.message,
      })
    }
  })

type DeliveryFormValues = z.output<typeof deliverySchema>
type DeliveryFormInputValues = z.input<typeof deliverySchema>

function tiersToRows(tiers: DeliveryFeeTier[]): DeliveryFormInputValues['tiers'] {
  return tiers.map((tier) => ({
    maxMeters: tier.maxMeters === null ? '' : String(tier.maxMeters),
    fee: tier.fee,
  }))
}

/**
 * Configuración de delivery por distancia: ubicación del local (con preview
 * de mapa de solo lectura, mismo patrón que `UserAddressesSection`), tabla de
 * tramos de tarifa y el radio de aviso interno de "pedido lejano". Primera
 * vez que se carga `store_location` desde el panel — hasta que se guarde acá,
 * el backend rechaza pedidos porque `SettingsService.getStoreLocation()`
 * lanza `NotFoundException` (ver settings.service.ts).
 */
export function DeliverySettingsCard() {
  const settingsQuery = useSettings()
  const upsertMutation = useUpsertSetting()
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const geoapifyApiKey = import.meta.env.VITE_GEOAPIFY_API_KEY as
    | string
    | undefined

  const storeLocationValue = settingsQuery.data?.find(
    (s) => s.key === STORE_LOCATION_KEY,
  )?.value
  const tiersValue = settingsQuery.data?.find(
    (s) => s.key === DELIVERY_FEE_TIERS_KEY,
  )?.value
  const alertRadiusValue = settingsQuery.data?.find(
    (s) => s.key === DELIVERY_ALERT_RADIUS_METERS_KEY,
  )?.value

  const storeLocation = parseStoreLocation(storeLocationValue)

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DeliveryFormInputValues, unknown, DeliveryFormValues>({
    resolver: zodResolver(deliverySchema),
    values: {
      latitude: storeLocation?.latitude ?? '',
      longitude: storeLocation?.longitude ?? '',
      tiers: tiersToRows(parseDeliveryFeeTiers(tiersValue)),
      alertRadiusMeters: parseDeliveryAlertRadiusMeters(alertRadiusValue),
    },
  })

  const { fields, remove, insert } = useFieldArray({ control, name: 'tiers' })

  const latitude = useWatch({ control, name: 'latitude' })
  const longitude = useWatch({ control, name: 'longitude' })
  const previewLat = typeof latitude === 'number' ? latitude : Number(latitude)
  const previewLng = typeof longitude === 'number' ? longitude : Number(longitude)
  const hasValidPreview =
    Number.isFinite(previewLat) &&
    Number.isFinite(previewLng) &&
    previewLat >= -90 &&
    previewLat <= 90 &&
    previewLng >= -180 &&
    previewLng <= 180

  function addTier() {
    // El tramo nuevo se inserta ANTES del último (que siempre queda sin
    // límite, la tarifa plana) — nunca se agrega después de él.
    insert(Math.max(fields.length - 1, 0), { maxMeters: '', fee: 0 })
  }

  async function onSubmit(values: DeliveryFormValues) {
    setServerError(null)
    setSaved(false)
    try {
      await upsertMutation.mutateAsync({
        key: STORE_LOCATION_KEY,
        value: serializeStoreLocation({
          latitude: values.latitude,
          longitude: values.longitude,
        }),
        description: STORE_LOCATION_DESCRIPTION,
      })
      await upsertMutation.mutateAsync({
        key: DELIVERY_FEE_TIERS_KEY,
        value: serializeDeliveryFeeTiers(
          values.tiers.map((row) => ({
            maxMeters: row.maxMeters.trim() === '' ? null : Number(row.maxMeters),
            fee: row.fee,
          })),
        ),
        description: DELIVERY_FEE_TIERS_DESCRIPTION,
      })
      await upsertMutation.mutateAsync({
        key: DELIVERY_ALERT_RADIUS_METERS_KEY,
        value: String(values.alertRadiusMeters),
        description: DELIVERY_ALERT_RADIUS_METERS_DESCRIPTION,
      })
      setSaved(true)
    } catch (error) {
      setServerError(getApiMessage(error, 'No se pudo guardar la configuración de delivery'))
    }
  }

  const tiersRootError = errors.tiers?.root?.message ?? errors.tiers?.message

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="text-celtas-orange size-4" />
          Delivery por distancia
        </CardTitle>
        <CardDescription>
          Ubicación del local, tarifas de envío por tramo de distancia y radio
          de aviso de pedidos lejanos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {settingsQuery.isLoading ? (
          <LoadingState label="Cargando configuración…" />
        ) : settingsQuery.isError ? (
          <ErrorState
            title="No se pudo cargar la configuración"
            description="Revisa tu conexión y vuelve a intentar."
            onRetry={() => settingsQuery.refetch()}
          />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {saved ? (
              <Alert className="border-emerald-400/40 bg-emerald-400/10">
                <CheckCircle2 className="text-emerald-400" />
                <AlertTitle>Configuración guardada</AlertTitle>
                <AlertDescription>
                  La ubicación, las tarifas y el radio de aviso se
                  actualizaron correctamente.
                </AlertDescription>
              </Alert>
            ) : null}

            {serverError ? (
              <Alert variant="destructive">
                <AlertTitle>No se pudo guardar</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}

            {!storeLocation ? (
              <Alert className="border-celtas-gold/40 bg-celtas-gold/10">
                <AlertTitle>Ubicación del local sin configurar</AlertTitle>
                <AlertDescription>
                  Hasta guardar esto, el backend rechaza el cálculo de
                  delivery por distancia en los pedidos nuevos.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-3">
              <h3 className="text-sm font-medium">Ubicación del local</h3>
              <div className="flex flex-wrap gap-3">
                <div className="min-w-40 flex-1 space-y-1.5">
                  <Label htmlFor="store-latitude">Latitud</Label>
                  <Input
                    id="store-latitude"
                    type="number"
                    step="any"
                    placeholder="-12.1631"
                    aria-invalid={Boolean(errors.latitude)}
                    {...register('latitude')}
                  />
                  {errors.latitude ? (
                    <p className="text-celtas-red-light text-xs">
                      {errors.latitude.message}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-40 flex-1 space-y-1.5">
                  <Label htmlFor="store-longitude">Longitud</Label>
                  <Input
                    id="store-longitude"
                    type="number"
                    step="any"
                    placeholder="-76.9700"
                    aria-invalid={Boolean(errors.longitude)}
                    {...register('longitude')}
                  />
                  {errors.longitude ? (
                    <p className="text-celtas-red-light text-xs">
                      {errors.longitude.message}
                    </p>
                  ) : null}
                </div>
              </div>

              {hasValidPreview && geoapifyApiKey ? (
                <a
                  href={buildGoogleMapsUrl(previewLat, previewLng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir en Google Maps"
                  aria-label="Abrir en Google Maps"
                  className="border-border group block max-w-md overflow-hidden rounded-lg border"
                >
                  <img
                    src={buildAddressMapUrl(previewLat, previewLng, geoapifyApiKey)}
                    alt="Mapa del local"
                    className="block w-full cursor-pointer transition-opacity group-hover:opacity-80"
                    width={400}
                    height={200}
                    loading="lazy"
                  />
                </a>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Ingresa una latitud y longitud válidas para ver el mapa de
                  confirmación.
                </p>
              )}
            </div>

            <div className="space-y-3 border-t border-border/50 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Tarifas por distancia</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTier}
                >
                  <Plus />
                  Agregar tramo
                </Button>
              </div>

              {tiersRootError ? (
                <p className="text-celtas-red-light text-xs">{tiersRootError}</p>
              ) : null}

              <div className="space-y-2">
                {fields.map((field, index) => {
                  const isLast = index === fields.length - 1
                  const rowErrors = errors.tiers?.[index]
                  return (
                    <div
                      key={field.id}
                      className="flex flex-wrap items-start gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="min-w-36 flex-1 space-y-1">
                        <Label htmlFor={`tier-max-${index}`}>
                          {isLast ? 'Sin límite (tarifa plana)' : 'Hasta (metros)'}
                        </Label>
                        <Input
                          id={`tier-max-${index}`}
                          type={isLast ? 'text' : 'number'}
                          disabled={isLast}
                          placeholder={isLast ? 'Sin límite' : 'Ej. 400'}
                          aria-invalid={Boolean(rowErrors?.maxMeters)}
                          {...register(`tiers.${index}.maxMeters`)}
                        />
                        {rowErrors?.maxMeters ? (
                          <p className="text-celtas-red-light text-xs">
                            {rowErrors.maxMeters.message}
                          </p>
                        ) : null}
                      </div>
                      <div className="min-w-32 flex-1 space-y-1">
                        <Label htmlFor={`tier-fee-${index}`}>Tarifa (S/)</Label>
                        <Input
                          id={`tier-fee-${index}`}
                          type="number"
                          step="0.01"
                          aria-invalid={Boolean(rowErrors?.fee)}
                          {...register(`tiers.${index}.fee`)}
                        />
                        {rowErrors?.fee ? (
                          <p className="text-celtas-red-light text-xs">
                            {rowErrors.fee.message}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mt-6 text-muted-foreground hover:text-celtas-red-light"
                        aria-label={`Quitar tramo ${index + 1}`}
                        disabled={fields.length <= 1}
                        onClick={() => remove(index)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5 border-t border-border/50 pt-4">
              <Label htmlFor="alert-radius">
                Radio de aviso de pedidos lejanos (metros)
              </Label>
              <Input
                id="alert-radius"
                type="number"
                className="max-w-48"
                aria-invalid={Boolean(errors.alertRadiusMeters)}
                {...register('alertRadiusMeters')}
              />
              {errors.alertRadiusMeters ? (
                <p className="text-celtas-red-light text-xs">
                  {errors.alertRadiusMeters.message}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Un pedido con una dirección a más de esta distancia del
                  local dispara un aviso interno — nunca bloquea el pedido.
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando…' : 'Guardar configuración'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
