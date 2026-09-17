import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { getApiMessage, isConflict } from '@/lib/api-errors'
import { useMenuItems } from '../items/hooks'
import { useCreateBeverage, useUpdateBeverage } from './hooks'
import type { Beverage } from '../types'

/**
 * Reglas espejo del CreateBeverageDto del backend: nombre obligatorio, precio
 * > 0 con máximo 2 decimales, sortOrder entero >= 0. includeFreeTo es un
 * array de ids de MenuItem (combos) — igual que sauceIds/beverageIds en
 * ItemForm, se normaliza siempre a array, nunca undefined.
 */
const beverageSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  price: z
    .coerce.number()
    .refine((v) => Number.isFinite(v), 'El precio debe ser un número')
    .refine((v) => v >= 0.01, 'El precio debe ser mayor a cero')
    .refine((v) => Math.round(v * 100) / 100 === v, 'Máximo 2 decimales'),
  includeFreeTo: z.array(z.string()).default([]),
  sortOrder: z.coerce
    .number()
    .int('El orden debe ser un número entero')
    .min(0, 'El orden no puede ser negativo'),
  active: z.boolean(),
})

type BeverageFormValues = z.output<typeof beverageSchema>
type BeverageFormInputValues = z.input<typeof beverageSchema>

interface BeverageFormProps {
  /** Si se pasa, edita; si no, crea. */
  beverage?: Beverage
  onClose: () => void
}

/**
 * Formulario crear/editar bebida del catálogo. Mapea el 409 de nombre
 * duplicado al campo "name" (mensaje del backend tal cual, en español) —
 * mismo patrón que SauceForm/CategoryForm/ItemForm.
 */
export function BeverageForm({ beverage, onClose }: BeverageFormProps) {
  const menuItemsQuery = useMenuItems()
  const createMutation = useCreateBeverage()
  const updateMutation = useUpdateBeverage()
  const isEditing = Boolean(beverage)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BeverageFormInputValues, unknown, BeverageFormValues>({
    resolver: zodResolver(beverageSchema),
    defaultValues: {
      name: beverage?.name ?? '',
      price: beverage?.price ?? '',
      includeFreeTo: beverage?.includeFreeTo ?? [],
      sortOrder: beverage?.sortOrder ?? 0,
      active: beverage?.active ?? true,
    },
  })

  const includeFreeTo = useWatch({ control, name: 'includeFreeTo' })

  async function onSubmit(values: BeverageFormValues) {
    setServerError(null)
    const payload = {
      name: values.name.trim(),
      price: values.price,
      includeFreeTo: values.includeFreeTo,
      sortOrder: values.sortOrder,
      active: values.active,
    }

    try {
      if (isEditing && beverage) {
        await updateMutation.mutateAsync({ id: beverage.id, ...payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
      onClose()
    } catch (error) {
      if (isConflict(error)) {
        const message = getApiMessage(error)
        // 409 de nombre duplicado → error en el campo, no genérico.
        if (/nombre/i.test(message)) {
          setError('name', { message })
        } else {
          setServerError(message)
        }
      } else {
        setServerError(getApiMessage(error, 'No se pudo guardar la bebida'))
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="space-y-4"
    >
      {serverError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo guardar</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="beverage-name">Nombre</Label>
        <Input
          id="beverage-name"
          placeholder="Ej. Coca-Cola 500ml"
          aria-invalid={Boolean(errors.name)}
          {...register('name')}
        />
        {errors.name ? (
          <p className="text-celtas-red-light text-xs">{errors.name.message}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="beverage-price">Precio (S/)</Label>
          <Input
            id="beverage-price"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            placeholder="5.00"
            aria-invalid={Boolean(errors.price)}
            {...register('price')}
          />
          {errors.price ? (
            <p className="text-celtas-red-light text-xs">
              {errors.price.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="beverage-sort-order">Orden</Label>
          <Input
            id="beverage-sort-order"
            type="number"
            inputMode="numeric"
            min={0}
            aria-invalid={Boolean(errors.sortOrder)}
            {...register('sortOrder')}
          />
          {errors.sortOrder ? (
            <p className="text-celtas-red-light text-xs">
              {errors.sortOrder.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5 pt-2">
        <Label className="text-sm font-medium">Incluida GRATIS en combos</Label>
        <p className="text-muted-foreground mb-1 text-xs">
          Productos en los que esta bebida va gratis al elegirla. Solo tiene
          efecto en productos que además tengan esta bebida asignada como
          opción (pestaña "Bebidas" del producto) — marcarla acá sola no la
          agrega como opción.
        </p>
        {menuItemsQuery.isLoading ? (
          <p className="text-muted-foreground text-xs">Cargando productos…</p>
        ) : menuItemsQuery.isError ? (
          <Alert variant="destructive">
            <AlertTitle>No se pudieron cargar los productos</AlertTitle>
            <AlertDescription>
              Esta bebida se puede guardar igual, pero no vas a poder
              asignarle combos hasta que recargues la página.
            </AlertDescription>
          </Alert>
        ) : menuItemsQuery.data && menuItemsQuery.data.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Todavía no hay productos en el catálogo. Créalos primero en la
            pestaña "Productos" del Menú.
          </p>
        ) : (
          <div className="max-h-[200px] space-y-1.5 overflow-y-auto rounded border p-2">
            {(menuItemsQuery.data ?? []).map((menuItem) => {
              // Sin esto, el checklist no avisa que marcar el combo acá no
              // alcanza si el producto no tiene esta bebida como opción propia
              // (menu.service.ts solo aplica precio 0 sobre MenuItem.beverages).
              const isAssigned = beverage
                ? menuItem.beverages.some((b) => b.id === beverage.id)
                : false
              return (
                <label
                  key={menuItem.id}
                  className="flex items-center gap-1.5 text-sm"
                >
                  <Checkbox
                    checked={includeFreeTo?.includes(menuItem.id) ?? false}
                    onCheckedChange={(isChecked) => {
                      const current = includeFreeTo ?? []
                      setValue(
                        'includeFreeTo',
                        isChecked
                          ? [...current, menuItem.id]
                          : current.filter((id) => id !== menuItem.id),
                      )
                    }}
                  />
                  <span
                    className={menuItem.available ? '' : 'text-muted-foreground'}
                  >
                    {menuItem.name}
                    {!menuItem.available ? ' (no disponible)' : ''}
                    {!isAssigned ? ' (bebida no asignada como opción)' : ''}
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">Activa</span>
        <div className="flex items-center gap-2 pt-0.5">
          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-label="Bebida disponible para asignarse a productos"
              />
            )}
          />
          <span className="text-muted-foreground text-sm">
            Disponible para productos
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
              : 'Crear bebida'}
        </Button>
      </div>
    </form>
  )
}
