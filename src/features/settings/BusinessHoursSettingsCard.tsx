import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, Clock } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { getApiMessage } from '@/lib/api-errors'
import { DAY_LABELS } from '../banners/banner-utils'
import { useSettings, useUpsertSetting } from './hooks'
import {
  BUSINESS_HOURS_SCHEDULE_DESCRIPTION,
  BUSINESS_HOURS_SCHEDULE_KEY,
  BUSINESS_MANUAL_CLOSED_DESCRIPTION,
  BUSINESS_MANUAL_CLOSED_KEY,
  BUSINESS_MANUAL_CLOSED_REASON_DESCRIPTION,
  BUSINESS_MANUAL_CLOSED_REASON_KEY,
  parseSchedule,
  resolveManualClosedReason,
  serializeSchedule,
} from './settings-utils'
import type { DaySchedule } from './types'

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Un día NO cerrado exige `open`/`close` con formato HH:mm válidos y
 * `open !== close` (ventana de duración cero, error real de captura).
 * `close <= open` (cruce de medianoche) es válido y NO se rechaza — es el
 * motivo por el que el horario es por día (ej. viernes/sábado hasta la 01:00).
 */
const dayScheduleSchema = z
  .object({
    closed: z.boolean(),
    open: z.string(),
    close: z.string(),
  })
  .superRefine((day, ctx) => {
    if (day.closed) return
    if (!TIME_REGEX.test(day.open)) {
      ctx.addIssue({
        code: 'custom',
        path: ['open'],
        message: 'Hora de apertura obligatoria (HH:mm)',
      })
    }
    if (!TIME_REGEX.test(day.close)) {
      ctx.addIssue({
        code: 'custom',
        path: ['close'],
        message: 'Hora de cierre obligatoria (HH:mm)',
      })
    }
    if (
      TIME_REGEX.test(day.open) &&
      TIME_REGEX.test(day.close) &&
      day.open === day.close
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['close'],
        message: 'La hora de cierre no puede ser igual a la de apertura',
      })
    }
  })

const businessHoursSchema = z.object({
  days: z.array(dayScheduleSchema).length(7),
  manualClosed: z.boolean(),
  manualClosedReason: z.string(),
})

type BusinessHoursFormValues = z.output<typeof businessHoursSchema>

const DEFAULT_DAY: DaySchedule = { closed: false, open: '11:00', close: '23:00' }

function scheduleToDays(value: string | undefined): DaySchedule[] {
  const schedule = parseSchedule(value)
  return [0, 1, 2, 3, 4, 5, 6].map((i) => schedule[String(i)] ?? DEFAULT_DAY)
}

function daysToSchedule(days: DaySchedule[]) {
  return Object.fromEntries(days.map((day, i) => [String(i), day]))
}

/**
 * Horario de atención (`business_hours_schedule`, JSON) + interruptor manual
 * "cerrado temporalmente" (`business_manual_closed` +
 * `business_manual_closed_reason`). Mismo patrón que `WhatsappSettingsCard`:
 * upsert por key vía `useUpsertSetting`, sin id en el body.
 */
export function BusinessHoursSettingsCard() {
  const settingsQuery = useSettings()
  const upsertMutation = useUpsertSetting()
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const scheduleValue = settingsQuery.data?.find(
    (s) => s.key === BUSINESS_HOURS_SCHEDULE_KEY,
  )?.value
  const manualClosedValue = settingsQuery.data?.find(
    (s) => s.key === BUSINESS_MANUAL_CLOSED_KEY,
  )?.value
  const manualClosedReasonValue = settingsQuery.data?.find(
    (s) => s.key === BUSINESS_MANUAL_CLOSED_REASON_KEY,
  )?.value

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BusinessHoursFormValues>({
    resolver: zodResolver(businessHoursSchema),
    values: {
      days: scheduleToDays(scheduleValue),
      manualClosed: manualClosedValue === 'true',
      manualClosedReason: manualClosedReasonValue ?? '',
    },
  })

  // useWatch en vez de watch(): la regla react-hooks/incompatible-library del
  // compilador de React rechaza memoizar componentes que usan watch().
  const days = useWatch({ control, name: 'days' })
  const manualClosed = useWatch({ control, name: 'manualClosed' })

  async function onSubmit(values: BusinessHoursFormValues) {
    setServerError(null)
    setSaved(false)
    try {
      await upsertMutation.mutateAsync({
        key: BUSINESS_HOURS_SCHEDULE_KEY,
        value: serializeSchedule(daysToSchedule(values.days)),
        description: BUSINESS_HOURS_SCHEDULE_DESCRIPTION,
      })
      // El motivo SIEMPRE se guarda antes que el toggle: el backend dispara
      // una notificación push al cliente cuando business_manual_closed
      // cambia de valor, leyendo business_manual_closed_reason de la BD en
      // ese momento (no del mismo request) — si el toggle se guardara
      // primero, la notificación saldría con el motivo viejo (o vacío).
      await upsertMutation.mutateAsync({
        key: BUSINESS_MANUAL_CLOSED_REASON_KEY,
        value: resolveManualClosedReason(values.manualClosedReason),
        description: BUSINESS_MANUAL_CLOSED_REASON_DESCRIPTION,
      })
      await upsertMutation.mutateAsync({
        key: BUSINESS_MANUAL_CLOSED_KEY,
        value: values.manualClosed ? 'true' : 'false',
        description: BUSINESS_MANUAL_CLOSED_DESCRIPTION,
      })
      setSaved(true)
    } catch (error) {
      setServerError(getApiMessage(error, 'No se pudo guardar el horario'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="text-celtas-orange size-4" />
          Horario de atención
        </CardTitle>
        <CardDescription>
          Horario semanal del local y cierre manual temporal.
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
                <AlertTitle>Horario guardado</AlertTitle>
                <AlertDescription>
                  El horario de atención se actualizó correctamente.
                </AlertDescription>
              </Alert>
            ) : null}

            {serverError ? (
              <Alert variant="destructive">
                <AlertTitle>No se pudo guardar</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-3">
              <h3 className="text-sm font-medium">Horario semanal</h3>
              {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
                const dayClosed = days?.[dayIndex]?.closed ?? false
                const dayErrors = errors.days?.[dayIndex]
                return (
                  <div
                    key={dayIndex}
                    className="flex flex-wrap items-center gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0"
                  >
                    <span className="w-10 text-sm font-medium">
                      {DAY_LABELS[dayIndex]}
                    </span>

                    <div className="flex items-center gap-2">
                      <Controller
                        control={control}
                        name={`days.${dayIndex}.closed`}
                        render={({ field }) => (
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            aria-label={`${DAY_LABELS[dayIndex]} cerrado`}
                          />
                        )}
                      />
                      <span className="text-muted-foreground text-xs">
                        Cerrado
                      </span>
                    </div>

                    {!dayClosed ? (
                      <div className="flex flex-1 flex-wrap items-start gap-2">
                        <div className="space-y-1">
                          <Input
                            type="time"
                            className="w-28"
                            aria-label={`${DAY_LABELS[dayIndex]} hora de apertura`}
                            aria-invalid={Boolean(dayErrors?.open)}
                            {...register(`days.${dayIndex}.open`)}
                          />
                          {dayErrors?.open ? (
                            <p className="text-celtas-red-light text-xs">
                              {dayErrors.open.message}
                            </p>
                          ) : null}
                        </div>
                        <span className="text-muted-foreground pt-1 text-xs">
                          a
                        </span>
                        <div className="space-y-1">
                          <Input
                            type="time"
                            className="w-28"
                            aria-label={`${DAY_LABELS[dayIndex]} hora de cierre`}
                            aria-invalid={Boolean(dayErrors?.close)}
                            {...register(`days.${dayIndex}.close`)}
                          />
                          {dayErrors?.close ? (
                            <p className="text-celtas-red-light text-xs">
                              {dayErrors.close.message}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div className="space-y-3 border-t border-border/50 pt-4">
              <h3 className="text-sm font-medium">Cierre manual</h3>
              <div className="flex items-center gap-2">
                <Controller
                  control={control}
                  name="manualClosed"
                  render={({ field }) => (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label="Local cerrado temporalmente ahora"
                    />
                  )}
                />
                <Label>Local cerrado temporalmente ahora</Label>
              </div>

              {manualClosed ? (
                <div className="space-y-1.5">
                  <Label htmlFor="manual-closed-reason">Motivo</Label>
                  <Input
                    id="manual-closed-reason"
                    placeholder="Ej. Mantenimiento de cocina"
                    {...register('manualClosedReason')}
                  />
                  <p className="text-muted-foreground text-xs">
                    Se muestra al cliente. Si lo dejas vacío, se guarda como
                    &quot;Cerrado temporalmente&quot;.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando…' : 'Guardar horario'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
