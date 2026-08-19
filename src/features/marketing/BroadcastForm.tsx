import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertTriangle, CheckCircle2, Send } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getApiMessage } from '@/lib/api-errors'
import { useSendBroadcast } from './hooks'
import type { BroadcastResult } from './types'

/**
 * Reglas espejo del BroadcastNotificationDto del backend: title/body
 * requeridos y no vacíos (class-validator: @IsString + @IsNotEmpty, sin
 * límite de longitud declarado — no inventamos uno acá).
 */
const broadcastSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio'),
  body: z.string().trim().min(1, 'El cuerpo es obligatorio'),
})

type BroadcastFormValues = z.infer<typeof broadcastSchema>

/**
 * Formulario de envío de notificación de marketing/fidelización — MÓDULO
 * Marketing. Envía a TODOS los usuarios con fcmToken, sin segmentación
 * (v1, ver plan). Acción de impacto real e inmediata (sin scheduler): el
 * submit del formulario NO dispara la mutación directamente, primero
 * muestra un panel de confirmación explícito con el título/cuerpo a enviar;
 * solo el botón "Sí, enviar ahora" llama a la API. Mismo patrón que
 * GenerateBulkCouponForm (features/coupons).
 */
export function BroadcastForm() {
  const broadcastMutation = useSendBroadcast()
  const [serverError, setServerError] = useState<string | null>(null)
  const [pendingValues, setPendingValues] = useState<BroadcastFormValues | null>(
    null,
  )
  const [result, setResult] = useState<BroadcastResult | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BroadcastFormValues>({
    resolver: zodResolver(broadcastSchema),
    defaultValues: { title: '', body: '' },
  })

  // El submit del form solo pasa a modo confirmación — la API se llama desde
  // handleConfirm, tras el clic explícito del admin.
  function onValidated(values: BroadcastFormValues) {
    setServerError(null)
    setResult(null)
    setPendingValues(values)
  }

  async function handleConfirm() {
    if (!pendingValues) return
    setServerError(null)
    try {
      const sent = await broadcastMutation.mutateAsync(pendingValues)
      setResult(sent)
      setPendingValues(null)
      reset({ title: '', body: '' })
    } catch (error) {
      setServerError(getApiMessage(error, 'No se pudo enviar la notificación'))
      setPendingValues(null)
    }
  }

  const isSending = broadcastMutation.isPending

  // ── Panel de confirmación explícita (reemplaza el formulario mientras está activo) ──
  if (pendingValues) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="text-celtas-red" />
          <AlertTitle>¿Confirmas enviar esta notificación a todos los clientes?</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Se envía de inmediato a todos los usuarios con notificaciones
              activadas — no hay forma de deshacerlo ni de programarlo.
            </p>
            <div className="bg-background/40 border-border mt-2 space-y-1 rounded-md border p-3">
              <p className="text-foreground text-sm font-semibold">
                {pendingValues.title}
              </p>
              <p className="text-muted-foreground text-sm">
                {pendingValues.body}
              </p>
            </div>
          </AlertDescription>
        </Alert>

        {serverError ? (
          <Alert variant="destructive">
            <AlertTitle>No se pudo enviar la notificación</AlertTitle>
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPendingValues(null)}
            disabled={isSending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isSending}
          >
            {isSending ? 'Enviando…' : 'Sí, enviar ahora'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onValidated)} className="space-y-4">
      {result ? (
        <Alert className="border-emerald-400/40 bg-emerald-400/10">
          <CheckCircle2 className="text-emerald-400" />
          <AlertTitle>Notificación enviada</AlertTitle>
          <AlertDescription>
            La recibieron{' '}
            <span className="font-semibold">{result.sent}</span> de{' '}
            <span className="font-semibold">{result.total}</span>{' '}
            dispositivo{result.total === 1 ? '' : 's'} con notificaciones
            activadas.
          </AlertDescription>
        </Alert>
      ) : null}

      {serverError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo enviar la notificación</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="broadcast-title">Título</Label>
        <Input
          id="broadcast-title"
          placeholder="Ej. A pocos días del día del padre y Celtas lo sabe"
          aria-invalid={Boolean(errors.title)}
          {...register('title')}
        />
        {errors.title ? (
          <p className="text-celtas-red-light text-xs">{errors.title.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="broadcast-body">Cuerpo</Label>
        <Textarea
          id="broadcast-body"
          rows={3}
          placeholder="Ej. Aprovecha nuestras promos especiales antes de que se acaben."
          aria-invalid={Boolean(errors.body)}
          {...register('body')}
        />
        {errors.body ? (
          <p className="text-celtas-red-light text-xs">{errors.body.message}</p>
        ) : null}
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit">
          <Send />
          Enviar ahora
        </Button>
      </div>
    </form>
  )
}
