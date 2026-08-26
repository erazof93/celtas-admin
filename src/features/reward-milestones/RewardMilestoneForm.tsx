import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { getApiMessage } from '@/lib/api-errors'
import { useCreateRewardMilestone, useUpdateRewardMilestone } from './hooks'
import type { RewardMilestone } from './types'

/**
 * Reglas espejo de CreateRewardMilestoneDto/UpdateRewardMilestoneDto del
 * backend: starsRequired entero positivo, isSpecial booleano (default false).
 * Mucho más simple que StarPromotionForm: sin fechas, sin label.
 */
const rewardMilestoneSchema = z.object({
  starsRequired: z.coerce
    .number('Debe ser un número')
    .int('Debe ser un número entero')
    .positive('Debe ser mayor a 0'),
  isSpecial: z.boolean(),
})

type RewardMilestoneFormValues = z.output<typeof rewardMilestoneSchema>
type RewardMilestoneFormInputValues = z.input<typeof rewardMilestoneSchema>

interface RewardMilestoneFormProps {
  /** Si se pasa, edita; si no, crea. */
  milestone?: RewardMilestone | null
  onClose: () => void
}

export function RewardMilestoneForm({
  milestone,
  onClose,
}: RewardMilestoneFormProps) {
  const createMutation = useCreateRewardMilestone()
  const updateMutation = useUpdateRewardMilestone()
  const isEditing = Boolean(milestone)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<
    RewardMilestoneFormInputValues,
    unknown,
    RewardMilestoneFormValues
  >({
    resolver: zodResolver(rewardMilestoneSchema),
    defaultValues: {
      starsRequired: milestone?.starsRequired ?? 5,
      isSpecial: milestone?.isSpecial ?? false,
    },
  })

  async function onSubmit(values: RewardMilestoneFormValues) {
    setServerError(null)

    const payload = {
      starsRequired: values.starsRequired,
      isSpecial: values.isSpecial,
    }

    try {
      if (isEditing && milestone) {
        await updateMutation.mutateAsync({ id: milestone.id, ...payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
      onClose()
    } catch (error) {
      const message = getApiMessage(error, 'No se pudo guardar el hito')
      if (/premio configurado/i.test(message)) {
        setError('starsRequired', { message })
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
        <Label htmlFor="reward-milestone-stars-required">
          Estrellas requeridas
        </Label>
        <Input
          id="reward-milestone-stars-required"
          type="number"
          step="1"
          placeholder="Ej. 15"
          aria-invalid={Boolean(errors.starsRequired)}
          {...register('starsRequired')}
        />
        {errors.starsRequired ? (
          <p className="text-celtas-red-light text-xs">
            {errors.starsRequired.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">Premio especial</span>
        <div className="flex items-center gap-2 pt-0.5">
          <Controller
            control={control}
            name="isSpecial"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-label="Premio especial"
              />
            )}
          />
          <span className="text-muted-foreground text-sm">
            Entrega el catálogo de premio especial en vez del normal
          </span>
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
              : 'Crear hito'}
        </Button>
      </div>
    </form>
  )
}
