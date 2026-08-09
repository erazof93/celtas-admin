import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, MessageCircle } from 'lucide-react'
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
import { useSettings, useUpsertSetting } from './hooks'
import {
  isValidWhatsappNumber,
  normalizeWhatsappNumber,
  WHATSAPP_NUMBER_DESCRIPTION,
  WHATSAPP_NUMBER_KEY,
} from './settings-utils'

/**
 * Reglas del formulario: el backend solo exige value no vacío (IsString +
 * IsNotEmpty); el rango de 10-15 dígitos es un guard de UX del panel para no
 * guardar números claramente inválidos.
 */
const whatsappSchema = z.object({
  whatsapp: z
    .string()
    .min(1, 'El número es obligatorio')
    .refine(isValidWhatsappNumber, {
      message: 'Ingresa un número válido (10-15 dígitos, formato internacional)',
    }),
})

type WhatsappFormValues = z.output<typeof whatsappSchema>

/**
 * Editor del número de WhatsApp del negocio. La clave es
 * `whatsapp_business_number` (constante del backend) y el valor se guarda en
 * formato internacional sin + (ej. 51999999999). PATCH /settings hace upsert
 * por key — el body es { key, value, description? }, sin id.
 */
export function WhatsappSettingsCard() {
  const settingsQuery = useSettings()
  const upsertMutation = useUpsertSetting()
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const currentValue = settingsQuery.data?.find(
    (s) => s.key === WHATSAPP_NUMBER_KEY,
  )?.value

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WhatsappFormValues>({
    resolver: zodResolver(whatsappSchema),
    values: { whatsapp: currentValue ?? '' },
  })

  async function onSubmit(values: WhatsappFormValues) {
    setServerError(null)
    setSaved(false)
    try {
      await upsertMutation.mutateAsync({
        key: WHATSAPP_NUMBER_KEY,
        value: normalizeWhatsappNumber(values.whatsapp),
        description: WHATSAPP_NUMBER_DESCRIPTION,
      })
      setSaved(true)
    } catch (error) {
      setServerError(getApiMessage(error, 'No se pudo guardar el número'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="text-celtas-orange size-4" />
          WhatsApp del negocio
        </CardTitle>
        <CardDescription>
          El número que recibe los pedidos de la app. Formato internacional sin
          el signo + (ej. 51999999999).
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
                <AlertTitle>Número guardado</AlertTitle>
                <AlertDescription>
                  El WhatsApp del negocio se actualizó correctamente.
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
              <Label htmlFor="whatsapp-number">Número de WhatsApp</Label>
              <Input
                id="whatsapp-number"
                inputMode="tel"
                placeholder="51999999999"
                aria-invalid={Boolean(errors.whatsapp)}
                {...register('whatsapp')}
              />
              {errors.whatsapp ? (
                <p className="text-celtas-red text-xs">
                  {errors.whatsapp.message}
                </p>
              ) : null}
              <p className="text-muted-foreground text-xs">
                Se guarda sin espacios ni el signo +.
              </p>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando…' : 'Guardar número'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}