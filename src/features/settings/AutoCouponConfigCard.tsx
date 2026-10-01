import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, TicketPercent } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getApiMessage, getApiStatus } from '@/lib/api-errors'
import { mapAutoConfigErrors } from '@/features/coupons/coupon-utils'
import {
  useAutoCouponConfig,
  useUpdateAutoCouponConfig,
} from '@/features/coupons/hooks'
import type { CouponDiscountType } from '@/features/coupons/types'

/** Tope de decimal(10,2) — MAX_COUPON_AMOUNT en coupon.entity.ts del backend. */
const MAX_COUPON_AMOUNT = 99_999_999.99
/** MAX_AUTO_COUPON_EXPIRATION_DAYS en coupon.entity.ts del backend. */
const MAX_EXPIRATION_DAYS = 365

const hasMaxTwoDecimals = (value: number) =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-6

const amount = (label: string) =>
  z.coerce
    .number(`${label} debe ser un número`)
    .positive(`${label} debe ser mayor a 0`)
    .max(MAX_COUPON_AMOUNT, `${label} no puede superar S/ 99,999,999.99`)
    .refine(hasMaxTwoDecimals, `${label} admite hasta 2 decimales`)

/**
 * Espejo de UpdateAutoCouponConfigDto del backend: los 4 campos obligatorios
 * (PUT reemplaza todo), valores > 0 con hasta 2 decimales, % ≤ 100 y días
 * enteros entre 1 y 365.
 */
const autoCouponSchema = z
  .object({
    discountType: z.enum(['percentage', 'fixed_amount'], {
      message: 'Selecciona un tipo de descuento',
    }),
    discountValue: amount('El descuento'),
    thresholdAmount: amount('El umbral'),
    expirationDays: z.coerce
      .number('Los días deben ser un número')
      .int('Los días deben ser un número entero')
      .min(1, 'Mínimo 1 día')
      .max(MAX_EXPIRATION_DAYS, `Máximo ${MAX_EXPIRATION_DAYS} días`),
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

type AutoCouponFormValues = z.output<typeof autoCouponSchema>
type AutoCouponFormInputValues = z.input<typeof autoCouponSchema>

/**
 * Cupones automáticos (GET/PUT /coupons/auto-config): umbral de gasto,
 * descuento y vigencia del cupón que se genera al alcanzar el umbral. Los
 * cambios solo afectan a cupones nuevos.
 */
export function AutoCouponConfigCard() {
  const configQuery = useAutoCouponConfig()
  const updateMutation = useUpdateAutoCouponConfig()
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AutoCouponFormInputValues, unknown, AutoCouponFormValues>({
    resolver: zodResolver(autoCouponSchema),
    values: configQuery.data,
  })

  const isPercentage =
    useWatch({ control, name: 'discountType' }) === 'percentage'

  async function onSubmit(values: AutoCouponFormValues) {
    setServerError(null)
    setSaved(false)
    try {
      await updateMutation.mutateAsync(values)
      setSaved(true)
    } catch (error) {
      const fallback = 'No se pudo guardar la configuración de cupones'
      if (getApiStatus(error) !== 400) {
        setServerError(getApiMessage(error, fallback))
        return
      }
      const { fields, unmapped } = mapAutoConfigErrors(getApiMessage(error, ''))
      for (const [field, message] of Object.entries(fields)) {
        setError(field as keyof AutoCouponFormValues, { message })
      }
      if (unmapped.length > 0) {
        setServerError(unmapped.join(', '))
      } else if (Object.keys(fields).length === 0) {
        setServerError(fallback)
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TicketPercent className="text-celtas-orange size-4" />
          Cupones automáticos
        </CardTitle>
        <CardDescription>
          Cuando un cliente acumula este gasto en pedidos entregados, se le
          genera un cupón. Los cambios aplican solo a los cupones nuevos: los
          ya emitidos conservan su descuento y vencimiento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {configQuery.isLoading ? (
          <LoadingState label="Cargando configuración…" />
        ) : configQuery.isError ? (
          <ErrorState
            title="No se pudo cargar la configuración"
            description="Revisa tu conexión y vuelve a intentar."
            onRetry={() => configQuery.refetch()}
          />
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-4"
          >
            {saved ? (
              <Alert className="border-emerald-400/40 bg-emerald-400/10">
                <CheckCircle2 className="text-emerald-400" />
                <AlertTitle>Configuración guardada</AlertTitle>
                <AlertDescription>
                  Los próximos cupones automáticos usarán estos valores.
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
              <Label htmlFor="auto-coupon-threshold">
                Umbral de gasto (S/)
              </Label>
              <Input
                id="auto-coupon-threshold"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0.01}
                aria-invalid={Boolean(errors.thresholdAmount)}
                {...register('thresholdAmount')}
              />
              {errors.thresholdAmount ? (
                <p className="text-celtas-red-light text-xs">
                  {errors.thresholdAmount.message}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Soles gastados en pedidos entregados (desde el último cupón)
                  para generar uno nuevo.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="auto-coupon-discount-type">
                  Tipo de descuento
                </Label>
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
                        id="auto-coupon-discount-type"
                        aria-invalid={Boolean(errors.discountType)}
                      >
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                        <SelectItem value="fixed_amount">
                          Monto fijo (S/)
                        </SelectItem>
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
                <Label htmlFor="auto-coupon-discount-value">
                  {isPercentage ? 'Descuento (%)' : 'Descuento (S/)'}
                </Label>
                <Input
                  id="auto-coupon-discount-value"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0.01}
                  max={isPercentage ? 100 : undefined}
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
              <Label htmlFor="auto-coupon-expiration-days">
                Días de vigencia
              </Label>
              <Input
                id="auto-coupon-expiration-days"
                type="number"
                inputMode="numeric"
                step="1"
                min={1}
                max={MAX_EXPIRATION_DAYS}
                aria-invalid={Boolean(errors.expirationDays)}
                {...register('expirationDays')}
              />
              {errors.expirationDays ? (
                <p className="text-celtas-red-light text-xs">
                  {errors.expirationDays.message}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Entre 1 y {MAX_EXPIRATION_DAYS} días desde que se genera el
                  cupón.
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
