import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/ErrorState'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/LoadingState'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getApiMessage } from '@/lib/api-errors'
import { useMenuItems } from '../../menu/items/hooks'
import { useUserAddresses } from '../../users/hooks'
import type { MenuItem } from '../../menu/types'
import type { AdminUser } from '../../users/types'
import { AddItemDialog } from '../components/AddItemDialog'
import { CustomerPicker } from '../components/CustomerPicker'
import type { DeliveryLocation } from '../components/DeliveryCalculator'
import type { DeliveryEstimate } from '../delivery-estimate'
import { useCreateAdminOrder } from '../hooks'
import {
  buildCreateOrderAdminPayload,
  COMMENT_MAX_LENGTH,
  CUSTOMER_NAME_MAX_LENGTH,
  lineSubtotal,
  manualOrderSubtotal,
  MAX_QUANTITY,
  normalizePeruMobile,
  round2,
  type ManualOrderLine,
} from '../manual-order'

// Lazy: Leaflet (~150 KB) solo se descarga al abrir esta página.
const DeliveryCalculator = lazy(() =>
  import('../components/DeliveryCalculator').then((m) => ({
    default: m.DeliveryCalculator,
  })),
)

/**
 * Reglas espejo de CreateOrderAdminDto / CreateOrderDto del backend:
 * - Cliente registrado (customerId) O sin cuenta con nombre (máx. 100) +
 *   celular peruano (IsPeruMobile). Nunca ambos.
 * - Al menos un ítem, cantidad entera 1..99, comentario máx. 140 por ítem.
 * - Dirección de texto obligatoria (addressSnapshot no vacío); coordenadas
 *   opcionales (sin ellas el backend cobra delivery 0).
 */
const lineSchema = z.object({
  key: z.string(),
  menuItemId: z.string(),
  quantity: z
    .number({ message: 'Cantidad inválida' })
    .int('La cantidad debe ser un número entero')
    .min(1, 'La cantidad mínima es 1')
    .max(MAX_QUANTITY, `La cantidad máxima es ${MAX_QUANTITY}`),
  sauceIds: z.array(z.string()),
  beverageIds: z.array(z.string()),
  extraPortionIds: z.array(z.string()),
  friesTypeIds: z.array(z.string()),
  comment: z.string().max(COMMENT_MAX_LENGTH),
})

const manualOrderSchema = z.object({
  customer: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('registered'), customer: z.custom<AdminUser>() }),
    z.object({
      mode: z.literal('anonymous'),
      customerName: z
        .string()
        .trim()
        .min(1, 'El nombre es obligatorio si el cliente no tiene cuenta')
        .max(CUSTOMER_NAME_MAX_LENGTH, `Máximo ${CUSTOMER_NAME_MAX_LENGTH} caracteres`),
      customerPhone: z
        .string()
        .refine(
          (v) => normalizePeruMobile(v) !== null,
          'Celular peruano de 9 dígitos (ej. 987 654 321)',
        ),
    }),
  ]),
  lines: z.array(lineSchema).min(1, 'Agrega al menos un producto'),
  address: z.object({
    fullAddress: z.string().trim().min(1, 'Escribe la dirección de entrega'),
    reference: z.string().max(200, 'Máximo 200 caracteres'),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
  }),
})

type ManualOrderFormValues = z.infer<typeof manualOrderSchema>

function formatPrice(value: number) {
  return `S/ ${value.toFixed(2)}`
}

/** Nombres de las opciones elegidas de una línea, para la columna "Opciones". */
function optionsLabel(menuItem: MenuItem | undefined, line: ManualOrderLine): string {
  if (!menuItem) return '—'
  const pick = <T extends { id: string; name: string }>(all: T[], ids: string[]) =>
    all.filter((o) => ids.includes(o.id)).map((o) => o.name)
  const names = [
    ...pick(menuItem.sauces, line.sauceIds),
    ...pick(menuItem.beverages, line.beverageIds),
    ...pick(menuItem.extraPortions, line.extraPortionIds),
    ...pick(menuItem.friesTypes, line.friesTypeIds),
  ]
  return names.length > 0 ? names.join(', ') : '—'
}

/** Valor del Select para "escribir una dirección nueva" (no es un id real). */
const NEW_ADDRESS = 'new'

let lineCounter = 0
function nextLineKey() {
  lineCounter += 1
  return `line-${lineCounter}`
}

/**
 * Pedido manual (teléfono/WhatsApp) — POST /orders/admin.
 *
 * El backend es la fuente de verdad del precio: calcula subtotales, delivery
 * (con las coordenadas del addressSnapshot) y total. Lo que se muestra acá es
 * una vista previa con las mismas reglas; al crear, se abre el detalle del
 * pedido real en Pedidos.
 */
export default function CreateManualOrderPage() {
  const navigate = useNavigate()
  const menuQuery = useMenuItems()
  const createMutation = useCreateAdminOrder()
  const [addOpen, setAddOpen] = useState(false)
  const [estimate, setEstimate] = useState<DeliveryEstimate | null>(null)
  const [estimateFailed, setEstimateFailed] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<ManualOrderFormValues>({
    resolver: zodResolver(manualOrderSchema),
    defaultValues: {
      customer: { mode: 'anonymous', customerName: '', customerPhone: '' },
      lines: [],
      address: { fullAddress: '', reference: '', latitude: null, longitude: null },
    },
  })

  const lines = useWatch({ control, name: 'lines' })
  const address = useWatch({ control, name: 'address' })
  const customer = useWatch({ control, name: 'customer' })

  // Direcciones guardadas del cliente registrado (GET /users/:id/addresses,
  // principal primero). `savedChoice` null = "automático": la principal si la
  // hay; se vuelve a null al cambiar de cliente.
  const customerId = customer.mode === 'registered' ? customer.customer.id : undefined
  const addressesQuery = useUserAddresses(customerId)
  const savedAddresses = customerId ? (addressesQuery.data ?? []) : []
  const [savedChoice, setSavedChoice] = useState<string | null>(null)
  const effectiveChoice =
    savedChoice ?? savedAddresses.find((a) => a.isDefault)?.id ?? NEW_ADDRESS
  const selectedSaved = savedAddresses.find((a) => a.id === effectiveChoice) ?? null
  // Remonta el calculador solo cuando cambia la dirección elegida (initialLocation
  // se lee al montar). "Nueva dirección" usa siempre la misma key: lo que el
  // admin escribió antes de elegir un cliente sin direcciones guardadas no se
  // pierde al elegirlo.
  const calculatorKey = selectedSaved?.id ?? NEW_ADDRESS
  const appliedKeyRef = useRef<string | null>(null)

  const menuById = useMemo(
    () => new Map((menuQuery.data ?? []).map((item) => [item.id, item])),
    [menuQuery.data],
  )
  const subtotal = manualOrderSubtotal(lines, menuById)
  const located = address.latitude !== null && address.longitude !== null
  const deliveryFee = located ? (estimate?.deliveryFee ?? null) : 0
  const total = deliveryFee === null ? null : round2(subtotal + deliveryFee)

  function handleLocationChange(location: DeliveryLocation) {
    // Primera notificación de un calculador recién montado: precarga la
    // referencia de la dirección guardada elegida (o la limpia si es nueva).
    const firstForKey = appliedKeyRef.current !== calculatorKey
    appliedKeyRef.current = calculatorKey
    setValue(
      'address',
      {
        ...getValues('address'),
        ...(firstForKey ? { reference: selectedSaved?.reference ?? '' } : {}),
        fullAddress: location.address,
        latitude: location.point?.lat ?? null,
        longitude: location.point?.lng ?? null,
      },
      // Antes del primer submit no se muestran errores mientras escribe.
      { shouldValidate: isSubmitted },
    )
    setEstimate(location.estimate)
    setEstimateFailed(location.estimateFailed)
  }

  function updateLines(next: ManualOrderLine[]) {
    setValue('lines', next, { shouldValidate: true })
  }

  async function onSubmit(values: ManualOrderFormValues) {
    setServerError(null)
    const payload = buildCreateOrderAdminPayload({
      customer:
        values.customer.mode === 'registered'
          ? { mode: 'registered', customerId: values.customer.customer.id }
          : values.customer,
      lines: values.lines,
      menuById,
      address: {
        ...values.address,
        // Alias/distrito solo si sigue siendo la dirección guardada (sin editar el texto).
        ...(selectedSaved && values.address.fullAddress.trim() === selectedSaved.fullAddress.trim()
          ? { alias: selectedSaved.alias, district: selectedSaved.district }
          : {}),
      },
    })
    try {
      const created = await createMutation.mutateAsync(payload)
      navigate(`/orders?order=${created.id}`)
    } catch (error) {
      // Los 400/404/409 del backend traen el motivo en español (producto no
      // disponible, grupo obligatorio, cliente no encontrado...): tal cual.
      setServerError(getApiMessage(error, 'No se pudo crear el pedido'))
    }
  }

  const customerErrors = errors.customer as
    | { customerName?: { message?: string }; customerPhone?: { message?: string } }
    | undefined

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/orders">
            <ArrowLeft className="size-4" />
            Pedidos
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Crear pedido manual</h1>
        <p className="text-muted-foreground text-sm">
          Para pedidos tomados por teléfono o WhatsApp. Precios, delivery y
          total los confirma el servidor al crear el pedido.
        </p>
      </header>

      {serverError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo crear el pedido</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="space-y-4 p-5">
        <h2 className="text-lg font-semibold">1. Cliente</h2>
        <Controller
          control={control}
          name="customer"
          render={({ field }) => (
            <CustomerPicker
              value={field.value}
              onChange={(next) => {
                // Otro cliente → vuelve a preseleccionar su dirección principal.
                setSavedChoice(null)
                field.onChange(next)
              }}
              nameError={customerErrors?.customerName?.message}
              phoneError={customerErrors?.customerPhone?.message}
            />
          )}
        />
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">2. Productos</h2>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAddOpen(true)}
            disabled={!menuQuery.data}
          >
            <Plus className="size-4" />
            Agregar producto
          </Button>
        </div>

        {menuQuery.isLoading ? (
          <LoadingState label="Cargando menú…" />
        ) : menuQuery.isError ? (
          <ErrorState
            title="No se pudo cargar el menú"
            description="Sin el menú no se pueden agregar productos."
            onRetry={() => menuQuery.refetch()}
          />
        ) : lines.length === 0 ? (
          <p className="text-muted-foreground text-sm">Todavía no agregaste productos.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="w-24">Cantidad</TableHead>
                <TableHead>Opciones</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, index) => {
                const menuItem = menuById.get(line.menuItemId)
                const qtyError = errors.lines?.[index]?.quantity?.message
                return (
                  <TableRow key={line.key}>
                    <TableCell className="font-medium">
                      {menuItem?.name ?? 'Producto no disponible'}
                      {line.comment.trim() ? (
                        <p className="text-muted-foreground text-xs font-normal">
                          “{line.comment.trim()}”
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_QUANTITY}
                        aria-label={`Cantidad de ${menuItem?.name ?? 'producto'}`}
                        aria-invalid={Boolean(qtyError)}
                        value={Number.isNaN(line.quantity) ? '' : line.quantity}
                        onChange={(e) =>
                          updateLines(
                            lines.map((l) =>
                              l.key === line.key
                                ? { ...l, quantity: e.target.value === '' ? NaN : Number(e.target.value) }
                                : l,
                            ),
                          )
                        }
                      />
                      {qtyError ? (
                        <p className="text-celtas-red-light mt-1 text-xs">{qtyError}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-56 text-sm whitespace-normal">
                      {optionsLabel(menuItem, line)}
                    </TableCell>
                    <TableCell className="text-right">
                      {menuItem && !Number.isNaN(line.quantity)
                        ? formatPrice(lineSubtotal(menuItem, line))
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Eliminar ${menuItem?.name ?? 'producto'}`}
                        className="text-celtas-red-light hover:bg-celtas-red/10 hover:text-celtas-red-light"
                        onClick={() => updateLines(lines.filter((l) => l.key !== line.key))}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
        {errors.lines?.message ? (
          <p className="text-celtas-red-light text-sm">{errors.lines.message}</p>
        ) : null}
        <p className="text-right text-sm">
          Subtotal: <span className="font-semibold">{formatPrice(subtotal)}</span>
        </p>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-lg font-semibold">3. Dirección de entrega</h2>
        {customerId && addressesQuery.isLoading ? (
          <p className="text-muted-foreground text-xs">Cargando direcciones guardadas…</p>
        ) : customerId && addressesQuery.isError ? (
          <p className="text-muted-foreground text-xs">
            No se pudieron cargar las direcciones guardadas del cliente. Escribe
            una dirección nueva.
          </p>
        ) : savedAddresses.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="saved-address">Direcciones guardadas</Label>
            <Select value={effectiveChoice} onValueChange={setSavedChoice}>
              <SelectTrigger id="saved-address" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_ADDRESS}>+ Nueva dirección</SelectItem>
                {savedAddresses.map((saved) => (
                  <SelectItem key={saved.id} value={saved.id}>
                    {saved.alias} - {saved.fullAddress}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSaved && (selectedSaved.latitude === null || selectedSaved.longitude === null) ? (
              <p className="text-celtas-gold text-xs">
                Esta dirección no tiene ubicación guardada: pulsa "Buscar" para
                ubicarla y calcular el delivery.
              </p>
            ) : null}
          </div>
        ) : null}
        <Suspense fallback={<LoadingState label="Cargando mapa…" />}>
          <DeliveryCalculator
            key={calculatorKey}
            onChange={handleLocationChange}
            initialLocation={
              selectedSaved
                ? {
                    address: selectedSaved.fullAddress,
                    point:
                      selectedSaved.latitude !== null && selectedSaved.longitude !== null
                        ? { lat: selectedSaved.latitude, lng: selectedSaved.longitude }
                        : null,
                  }
                : undefined
            }
          />
        </Suspense>
        {errors.address?.fullAddress?.message ? (
          <p className="text-celtas-red-light text-sm">{errors.address.fullAddress.message}</p>
        ) : null}
        {address.fullAddress.trim() && !located ? (
          <p className="text-celtas-gold flex items-start gap-1.5 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Sin ubicar en el mapa el servidor cobra delivery S/ 0.00. Pulsa
            "Buscar" para calcularlo.
          </p>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="address-reference">Referencia (opcional)</Label>
          <Controller
            control={control}
            name="address.reference"
            render={({ field }) => (
              <Input
                id="address-reference"
                maxLength={200}
                placeholder="Ej. Portón verde, frente al parque"
                {...field}
              />
            )}
          />
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-semibold">4. Resumen</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Delivery</dt>
            <dd>
              {deliveryFee !== null
                ? formatPrice(deliveryFee)
                : estimateFailed
                  ? 'No se pudo calcular'
                  : 'Calculando…'}
            </dd>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd>{total === null ? '—' : formatPrice(total)}</dd>
          </div>
        </dl>
        {estimateFailed && located ? (
          <p className="text-muted-foreground text-xs">
            El delivery no se pudo cotizar ahora (usa "Reintentar" en el mapa).
            Igual puedes crear el pedido: el servidor lo calcula al crearlo.
          </p>
        ) : null}
        {estimate?.isFarOrder && located ? (
          <p className="text-celtas-red-light flex items-center gap-1 text-sm">
            <TriangleAlert className="size-4" />
            Dirección fuera de la zona habitual de reparto.
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button asChild type="button" variant="outline">
            <Link to="/orders">Cancelar</Link>
          </Button>
          <Button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting || !menuQuery.data}
          >
            {isSubmitting ? 'Creando…' : 'Crear pedido'}
          </Button>
        </div>
      </Card>

      <AddItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        menuItems={menuQuery.data ?? []}
        onAdd={(line) => updateLines([...lines, { key: nextLineKey(), ...line }])}
      />
    </div>
  )
}
