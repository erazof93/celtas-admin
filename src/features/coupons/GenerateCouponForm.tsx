import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2 } from 'lucide-react'
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
import { getApiMessage, isNotFound } from '@/lib/api-errors'
import { formatLima } from '@/lib/dates'
import { useGenerateCoupon } from './hooks'
import type { Coupon, CouponDiscountType } from './types'

/**
 * Reglas espejo del GenerateCouponDto del backend: userId UUID, discountType
 * enum, discountValue > 0, minPurchaseAmount opcional (>= 0, null si se deja
 * vacío — el backend lo acepta como "sin mínimo"). El límite de 100% para
 * percentage se valida en el cliente (superRefine) para evitar el submit
 * inútil — el backend también lo valida (IsPercentageWithinLimit), pero no
 * debe llegar ahí.
 *
 * NOTA de contrato: el backend NO acepta expiresAt en el payload — lo calcula
 * él mismo (hoy + coupons.expirationDays, default 15). Por eso el formulario
 * no tiene campo de expiración.
 */
const generateCouponSchema = z
  .object({
    userId: z.string().uuid('El ID de usuario debe ser un UUID válido'),
    discountType: z.enum(['percentage', 'fixed_amount'], {
      message: 'Selecciona un tipo de descuento',
    }),
    discountValue: z.coerce
      .number('El valor debe ser un número')
      .positive('El valor debe ser mayor a 0'),
    // Opcional: '' / undefined / null / 0 → null (sin mínimo, no 0). Si se
    // ingresa algo distinto de cero, debe ser un número >= 0. z.coerce.number()
    // convierte '' a 0, por eso el preprocess normaliza ANTES de validar.
    minPurchaseAmount: z.preprocess(
      (value) => {
        if (value === '' || value === undefined || value === null) return null
        // 0 (o '0', '0.00') es funcionalmente "sin mínimo" en el backend — se
        // normaliza a null igual que el campo vacío, no se envía ni se muestra.
        const num = typeof value === 'number' ? value : Number(value)
        return num === 0 ? null : value
      },
      z.union([
        z.null(),
        z.coerce
          .number('El monto debe ser un número')
          .nonnegative('El monto mínimo no puede ser negativo'),
      ]),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === 'percentage' && data.discountValue > 100) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountValue'],
        message: 'El porcentaje de descuento no puede superar el 100%',
      })
    }
  })

type GenerateCouponFormValues = z.output<typeof generateCouponSchema>
type GenerateCouponFormInputValues = z.input<typeof generateCouponSchema>

interface GenerateCouponFormProps {
  onClose: () => void
}

/**
 * Formulario de generación manual de cupón (campaña). Mapea el 404 de usuario
 * inexistente al campo userId; el resto de errores como alerta del formulario.
 */
export function GenerateCouponForm({ onClose }: GenerateCouponFormProps) {
  const generateMutation = useGenerateCoupon()
  const [serverError, setServerError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<Coupon | null>(null)

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<GenerateCouponFormInputValues, unknown, GenerateCouponFormValues>(
    {
      resolver: zodResolver(generateCouponSchema),
      defaultValues: {
        userId: '',
        discountType: 'percentage',
        discountValue: undefined,
        minPurchaseAmount: null,
      },
    },
  )

  async function onSubmit(values: GenerateCouponFormValues) {
    setServerError(null)
    try {
      const coupon = await generateMutation.mutateAsync({
        userId: values.userId.trim(),
        discountType: values.discountType,
        discountValue: values.discountValue,
        minPurchaseAmount: values.minPurchaseAmount,
      })
      setGenerated(coupon)
      // Listo para generar otro: se conserva el userId (misma campaña).
      reset({
        userId: values.userId.trim(),
        discountType: 'percentage',
        minPurchaseAmount: null,
      })
    } catch (error) {
      if (isNotFound(error)) {
        setError('userId', {
          message: getApiMessage(error, 'Usuario no encontrado'),
        })
      } else {
        setServerError(
          getApiMessage(error, 'No se pudo generar el cupón'),
        )
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {generated ? (
        <Alert className="border-emerald-400/40 bg-emerald-400/10">
          <CheckCircle2 className="text-emerald-400" />
          <AlertTitle>Cupón generado</AlertTitle>
          <AlertDescription className="space-y-1">
            <p>
              Código:{' '}
              <span className="font-mono font-semibold">{generated.code}</span>
            </p>
            <p className="text-muted-foreground text-xs">
              Expira el {formatLima(generated.expiresAt, 'dd/MM/yyyy')} (lo
              calcula el backend). Comparte el código con el cliente.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {serverError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo generar el cupón</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="coupon-user-id">Usuario (ID)</Label>
        <Input
          id="coupon-user-id"
          placeholder="UUID del usuario (ej. 3fa85f64-5717-4562-b3fc-2c963f66afa6)"
          aria-invalid={Boolean(errors.userId)}
          {...register('userId')}
        />
        {errors.userId ? (
          <p className="text-celtas-red-light text-xs">{errors.userId.message}</p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          El selector de usuarios llega en el módulo Usuarios; por ahora pega el
          UUID del cliente.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="coupon-discount-type">Tipo de descuento</Label>
          <Controller
            control={control}
            name="discountType"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) =>
                  field.onChange(value as CouponDiscountType)
                }
              >
                <SelectTrigger
                  id="coupon-discount-type"
                  aria-invalid={Boolean(errors.discountType)}
                >
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                  <SelectItem value="fixed_amount">Monto fijo (S/)</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {errors.discountType ? (
            <p className="text-celtas-red-light text-xs">
              {errors.discountType.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="coupon-discount-value">Valor</Label>
          <Input
            id="coupon-discount-value"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0.01}
            placeholder={errors.discountType ? '' : 'Ej. 10'}
            aria-invalid={Boolean(errors.discountValue)}
            {...register('discountValue')}
          />
          {errors.discountValue ? (
            <p className="text-celtas-red-light text-xs">
              {errors.discountValue.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="coupon-min-purchase">
          Monto mínimo de compra (S/)
        </Label>
        <Input
          id="coupon-min-purchase"
          type="number"
          inputMode="decimal"
          step="0.01"
          placeholder="Opcional — ej. 50"
          aria-invalid={Boolean(errors.minPurchaseAmount)}
          {...register('minPurchaseAmount')}
        />
        {errors.minPurchaseAmount ? (
          <p className="text-celtas-red-light text-xs">
            {errors.minPurchaseAmount.message}
          </p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          Subtotal mínimo del pedido para poder usar el cupón. Vacío = sin
          mínimo.
        </p>
      </div>

      <p className="text-muted-foreground text-xs">
        La expiración la define el backend al generar (hoy + 15 días por
        defecto) — no se envía en el payload.
      </p>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cerrar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Generando…' : 'Generar cupón'}
        </Button>
      </div>
    </form>
  )
}