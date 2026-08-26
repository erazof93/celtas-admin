import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, Star } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { useSettings, useUpsertSetting } from './hooks'
import {
  ESTRELLAS_POR_PREMIO_DESCRIPTION,
  ESTRELLAS_POR_PREMIO_KEY,
  parseEstrellasPorPremio,
  parseSolesPorEstrella,
  SOLES_POR_ESTRELLA_DESCRIPTION,
  SOLES_POR_ESTRELLA_KEY,
} from './settings-utils'

const estrellasSchema = z.object({
  solesPorEstrella: z.coerce
    .number('Debe ser un número')
    .positive('Debe ser mayor a 0'),
  estrellasPorPremio: z.coerce
    .number('Debe ser un número')
    .positive('Debe ser mayor a 0'),
})

type EstrellasFormValues = z.output<typeof estrellasSchema>
type EstrellasFormInputValues = z.input<typeof estrellasSchema>

/**
 * Umbrales del programa de "Estrellas": soles por estrella y estrellas por
 * premio. Mismo patrón genérico GET/PATCH /settings que WhatsApp/Delivery —
 * dos keys independientes, cada una con su propio upsert.
 */
export function EstrellasSettingsCard() {
  const settingsQuery = useSettings()
  const upsertMutation = useUpsertSetting()
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const solesPorEstrellaValue = settingsQuery.data?.find(
    (s) => s.key === SOLES_POR_ESTRELLA_KEY,
  )?.value
  const estrellasPorPremioValue = settingsQuery.data?.find(
    (s) => s.key === ESTRELLAS_POR_PREMIO_KEY,
  )?.value

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EstrellasFormInputValues, unknown, EstrellasFormValues>({
    resolver: zodResolver(estrellasSchema),
    values: {
      solesPorEstrella: parseSolesPorEstrella(solesPorEstrellaValue),
      estrellasPorPremio: parseEstrellasPorPremio(estrellasPorPremioValue),
    },
  })

  async function onSubmit(values: EstrellasFormValues) {
    setServerError(null)
    setSaved(false)
    try {
      await upsertMutation.mutateAsync({
        key: SOLES_POR_ESTRELLA_KEY,
        value: String(values.solesPorEstrella),
        description: SOLES_POR_ESTRELLA_DESCRIPTION,
      })
      await upsertMutation.mutateAsync({
        key: ESTRELLAS_POR_PREMIO_KEY,
        value: String(values.estrellasPorPremio),
        description: ESTRELLAS_POR_PREMIO_DESCRIPTION,
      })
      setSaved(true)
    } catch (error) {
      setServerError(
        getApiMessage(error, 'No se pudo guardar la configuración de estrellas'),
      )
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="text-celtas-gold size-4" />
          Programa de estrellas
        </CardTitle>
        <CardDescription>
          Umbrales de acumulación y canje del programa de fidelización.
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
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {saved ? (
              <Alert className="border-emerald-400/40 bg-emerald-400/10">
                <CheckCircle2 className="text-emerald-400" />
                <AlertTitle>Configuración guardada</AlertTitle>
                <AlertDescription>
                  Los umbrales del programa de estrellas se actualizaron
                  correctamente.
                </AlertDescription>
              </Alert>
            ) : null}

            {serverError ? (
              <Alert variant="destructive">
                <AlertTitle>No se pudo guardar</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="soles-por-estrella">Soles por estrella</Label>
              <Input
                id="soles-por-estrella"
                type="number"
                step="0.01"
                aria-invalid={Boolean(errors.solesPorEstrella)}
                {...register('solesPorEstrella')}
              />
              {errors.solesPorEstrella ? (
                <p className="text-celtas-red-light text-xs">
                  {errors.solesPorEstrella.message}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {SOLES_POR_ESTRELLA_DESCRIPTION}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="estrellas-por-premio">
                Estrellas por premio
              </Label>
              <Input
                id="estrellas-por-premio"
                type="number"
                step="1"
                aria-invalid={Boolean(errors.estrellasPorPremio)}
                {...register('estrellasPorPremio')}
              />
              {errors.estrellasPorPremio ? (
                <p className="text-celtas-red-light text-xs">
                  {errors.estrellasPorPremio.message}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {ESTRELLAS_POR_PREMIO_DESCRIPTION}
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
