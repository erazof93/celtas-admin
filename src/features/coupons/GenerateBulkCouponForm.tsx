import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/DatePicker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getApiMessage } from '@/lib/api-errors'
import { limaDateToUtc } from '@/lib/dates'
import { useGenerateBulkCoupons } from './hooks'
import { formatCouponDiscount } from './coupon-utils'
import type { BulkCouponResult, CouponDiscountType } from './types'

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
 * Reglas espejo del GenerateBulkCouponDto del backend: discountType enum,
 * discountValue > 0 (con el límite de 100% para percentage), campaignName
 * requerido, minPurchaseAmount opcional (>= 0), expiresAt opcional (fecha de
 * calendario en Lima — si se deja vacío el backend calcula el default).
 */
const generateBulkSchema = z
  .object({
    discountType: z.enum(['percentage', 'fixed_amount'], {
      message: 'Selecciona un tipo de descuento',
    }),
    discountValue: z.coerce
      .number('El valor debe ser un número')
      .positive('El valor debe ser mayor a 0'),
    campaignName: z
      .string()
      .trim()
      .min(1, 'El nombre de la campaña es requerido'),
    minPurchaseAmount: z.preprocess(
      (value) => {
        if (value === '' || value === undefined || value === null) return null
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
    expiresAt: z.string().optional(),
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

type GenerateBulkFormValues = z.output<typeof generateBulkSchema>
type GenerateBulkFormInputValues = z.input<typeof generateBulkSchema>

interface GenerateBulkCouponFormProps {
  onClose: () => void
}

/**
 * Campaña masiva de cupones (POST /coupons/generate-bulk): genera un cupón
 * para TODOS los clientes. Acción de impacto real e irreversible — el submit
 * del formulario NO dispara la mutación directamente, primero muestra un
 * panel de confirmación explícito con el resumen de la campaña; solo el
 * botón "Sí, generar cupones" llama a la API.
 */
export function GenerateBulkCouponForm({ onClose }: GenerateBulkCouponFormProps) {
  const bulkMutation = useGenerateBulkCoupons()
  const [serverError, setServerError] = useState<string | null>(null)
  const [pendingValues, setPendingValues] = useState<GenerateBulkFormValues | null>(
    null,
  )
  const [result, setResult] = useState<BulkCouponResult | null>(null)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<GenerateBulkFormInputValues, unknown, GenerateBulkFormValues>({
    resolver: zodResolver(generateBulkSchema),
    defaultValues: {
      discountType: 'percentage',
      discountValue: undefined,
      campaignName: '',
      minPurchaseAmount: null,
      expiresAt: '',
    },
  })

  // El submit del form solo pasa a modo confirmación — la API se llama desde
  // handleConfirm, tras el clic explícito del admin.
  function onValidated(values: GenerateBulkFormValues) {
    setServerError(null)
    setResult(null)
    setPendingValues(values)
  }

  async function handleConfirm() {
    if (!pendingValues) return
    setServerError(null)
    try {
      const generated = await bulkMutation.mutateAsync({
        discountType: pendingValues.discountType,
        discountValue: pendingValues.discountValue,
        campaignName: pendingValues.campaignName,
        minPurchaseAmount: pendingValues.minPurchaseAmount,
        expiresAt: pendingValues.expiresAt
          ? limaDateToUtc(pendingValues.expiresAt, true).toISOString()
          : undefined,
      })
      setResult(generated)
      setPendingValues(null)
      reset({
        discountType: 'percentage',
        campaignName: '',
        minPurchaseAmount: null,
        expiresAt: '',
      })
    } catch (error) {
      setServerError(getApiMessage(error, 'No se pudo generar la campaña'))
      setPendingValues(null)
    }
  }

  const isConfirming = bulkMutation.isPending

  // ── Panel de confirmación explícita (reemplaza el formulario mientras está activo) ──
  if (pendingValues) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="text-celtas-red" />
          <AlertTitle>
            ¿Confirmas generar cupones para todos los clientes?
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <p>Esta acción no se puede deshacer.</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>
                Campaña: <span className="font-semibold text-foreground">{pendingValues.campaignName}</span>
              </li>
              <li>
                Descuento:{' '}
                <span className="font-semibold text-foreground">
                  {formatCouponDiscount(
                    pendingValues.discountType,
                    pendingValues.discountValue,
                  )}
                </span>
              </li>
              <li>
                Expiración:{' '}
                <span className="font-semibold text-foreground">
                  {pendingValues.expiresAt
                    ? pendingValues.expiresAt
                    : 'Calculada por el backend (default automático)'}
                </span>
              </li>
              <li>
                Se creará un cupón individual para cada cliente registrado (los
                admins quedan excluidos).
              </li>
            </ul>
          </AlertDescription>
        </Alert>

        {serverError ? (
          <Alert variant="destructive">
            <AlertTitle>No se pudo generar la campaña</AlertTitle>
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPendingValues(null)}
            disabled={isConfirming}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? 'Generando…' : 'Sí, generar cupones'}
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
          <AlertTitle>Campaña generada</AlertTitle>
          <AlertDescription>
            Se generaron{' '}
            <span className="font-semibold">{result.count}</span>{' '}
            cupón{result.count === 1 ? '' : 'es'} — uno por cada cliente
            registrado.
          </AlertDescription>
        </Alert>
      ) : null}

      {serverError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo generar la campaña</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="bulk-campaign-name">Nombre de campaña</Label>
        <Input
          id="bulk-campaign-name"
          placeholder="Ej. padre2026"
          aria-invalid={Boolean(errors.campaignName)}
          {...register('campaignName')}
        />
        {errors.campaignName ? (
          <p className="text-celtas-red-light text-xs">
            {errors.campaignName.message}
          </p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          Etiqueta para agrupar/filtrar los cupones de esta campaña. No es el
          código del cupón (ese se genera random por cliente).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="bulk-discount-type">Tipo de descuento</Label>
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
                  id="bulk-discount-type"
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
          <Label htmlFor="bulk-discount-value">Valor</Label>
          <Input
            id="bulk-discount-value"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0.01}
            placeholder="Ej. 10"
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="bulk-min-purchase">Monto mínimo de compra (S/)</Label>
          <Input
            id="bulk-min-purchase"
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
        </div>

        <div className="space-y-1.5">
          <Label>Expiración</Label>
          <Controller
            control={control}
            name="expiresAt"
            render={({ field }) => (
              <DatePicker
                value={field.value ? parseDateInput(field.value) : null}
                onChange={(date) => field.onChange(date ? toDateInput(date) : '')}
                placeholder="Automática (backend)"
                clearLabel="Limpiar fecha de expiración"
              />
            )}
          />
          <p className="text-muted-foreground text-xs">
            Vacío = el backend calcula el default automático.
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cerrar
        </Button>
        <Button type="submit">Generar campaña para todos los clientes</Button>
      </div>
    </form>
  )
}
