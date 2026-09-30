import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { MenuItem } from '../../menu/types'
import {
  activeBeverages,
  activeExtraPortions,
  activeSauces,
  beveragePriceFor,
  blockedRequiredGroups,
  COMMENT_MAX_LENGTH,
  lineUnitPrice,
  MAX_QUANTITY,
  round2,
  selectionErrors,
  type ManualOrderLine,
  type ManualOrderSelection,
} from '../manual-order'

type GroupKey = 'sauceIds' | 'beverageIds' | 'extraPortionIds' | 'friesTypeIds'

interface AddItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Productos del menú; solo se ofrecen los `available` (el backend rechaza el resto). */
  menuItems: MenuItem[]
  onAdd: (line: Omit<ManualOrderLine, 'key'>) => void
}

const EMPTY_SELECTION: Omit<ManualOrderSelection, 'menuItemId'> = {
  sauceIds: [],
  beverageIds: [],
  extraPortionIds: [],
  friesTypeIds: [],
}

function formatPrice(value: number) {
  return `S/ ${value.toFixed(2)}`
}

/** Límite legible de un grupo para el encabezado. */
function groupHint(required: boolean, max: number | null) {
  const parts = [required ? 'Obligatorio' : 'Opcional']
  if (max !== null) parts.push(`máx. ${max}`)
  return parts.join(' · ')
}

export function AddItemDialog({ open, onOpenChange, menuItems, onAdd }: AddItemDialogProps) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MenuItem | null>(null)
  const [selection, setSelection] = useState(EMPTY_SELECTION)
  const [quantity, setQuantity] = useState('1')
  const [comment, setComment] = useState('')

  function reset() {
    setSearch('')
    setSelected(null)
    setSelection(EMPTY_SELECTION)
    setQuantity('1')
    setComment('')
  }

  function close(nextOpen: boolean) {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  const available = menuItems.filter((item) => item.available)
  const q = search.trim().toLowerCase()
  const results = q ? available.filter((item) => item.name.toLowerCase().includes(q)) : available

  const qty = Number(quantity)
  const quantityError =
    !Number.isInteger(qty) || qty < 1 || qty > MAX_QUANTITY
      ? `La cantidad debe ser un entero entre 1 y ${MAX_QUANTITY}`
      : null
  const fullSelection = selected ? { menuItemId: selected.id, ...selection } : null
  const errors = selected && fullSelection ? selectionErrors(selected, fullSelection) : []
  const unitPrice = selected && fullSelection ? lineUnitPrice(selected, fullSelection) : 0

  function toggle(key: GroupKey, id: string, checked: boolean) {
    setSelection((prev) => ({
      ...prev,
      [key]: checked ? [...prev[key], id] : prev[key].filter((x) => x !== id),
    }))
  }

  function renderGroup(
    key: GroupKey,
    title: string,
    options: { id: string; name: string; price?: number }[],
    required: boolean,
    max: number | null,
  ) {
    if (options.length === 0) return null
    const chosen = selection[key]
    const full = max !== null && chosen.length >= max
    return (
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">
          {title}{' '}
          <span className="text-muted-foreground text-xs font-normal">
            ({groupHint(required, max)})
          </span>
        </legend>
        <div className="grid grid-cols-2 gap-1.5">
          {options.map((option) => {
            const checked = chosen.includes(option.id)
            return (
              <label key={option.id} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={checked}
                  // Al llegar al máximo solo se puede desmarcar (mismo límite que valida el backend).
                  disabled={!checked && full}
                  onCheckedChange={(isChecked) => toggle(key, option.id, isChecked === true)}
                />
                <span>
                  {option.name}
                  {option.price !== undefined
                    ? option.price === 0
                      ? ' (gratis)'
                      : ` (+${formatPrice(option.price)})`
                    : ''}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>
    )
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar producto</DialogTitle>
          <DialogDescription>
            Elige el producto, la cantidad y las opciones que pidió el cliente.
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-2">
            <Label htmlFor="product-search">Producto</Label>
            <Input
              id="product-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto…"
              autoComplete="off"
            />
            {results.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {available.length === 0
                  ? 'No hay productos disponibles en el menú.'
                  : 'Ningún producto coincide con la búsqueda.'}
              </p>
            ) : (
              <ul
                aria-label="Productos"
                className="border-border divide-border max-h-72 divide-y overflow-y-auto rounded-lg border"
              >
                {results.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="hover:bg-muted flex w-full justify-between gap-3 px-3 py-2 text-left text-sm"
                      onClick={() => setSelected(item)}
                    >
                      <span>
                        {item.name}
                        {blockedRequiredGroups(item).length > 0 ? (
                          <span className="text-celtas-red-light block text-xs">
                            Sin opciones disponibles para {blockedRequiredGroups(item).join(', ')}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground">{formatPrice(item.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{selected.name}</p>
                <p className="text-muted-foreground text-sm">{formatPrice(selected.price)}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelected(null)
                  setSelection(EMPTY_SELECTION)
                }}
              >
                Cambiar producto
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="line-quantity">Cantidad</Label>
              <Input
                id="line-quantity"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_QUANTITY}
                value={quantity}
                aria-invalid={Boolean(quantityError)}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-28"
              />
              {quantityError ? (
                <p className="text-celtas-red-light text-xs">{quantityError}</p>
              ) : null}
            </div>

            {renderGroup(
              'sauceIds',
              'Salsas',
              activeSauces(selected),
              selected.sauceGroupRequired,
              selected.sauceGroupMaxSelectable,
            )}
            {renderGroup(
              'beverageIds',
              'Bebidas',
              activeBeverages(selected).map((b) => ({
                id: b.id,
                name: b.name,
                price: beveragePriceFor(selected, b),
              })),
              selected.beverageGroupRequired,
              selected.beverageGroupMaxSelectable,
            )}
            {renderGroup(
              'extraPortionIds',
              'Porciones extras',
              activeExtraPortions(selected).map((e) => ({ id: e.id, name: e.name, price: e.price })),
              selected.extraPortionsGroupRequired,
              selected.extraPortionsGroupMaxSelectable,
            )}
            {renderGroup(
              'friesTypeIds',
              'Tipo de papas',
              selected.friesTypes,
              selected.friesTypeGroupRequired,
              selected.friesTypeGroupMaxSelectable,
            )}

            <div className="space-y-1.5">
              <Label htmlFor="line-comment">Comentario</Label>
              <Textarea
                id="line-comment"
                rows={2}
                maxLength={COMMENT_MAX_LENGTH}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ej. Sin cebolla, bien cocida"
              />
              <p className="text-muted-foreground text-right text-xs">
                {comment.length}/{COMMENT_MAX_LENGTH}
              </p>
            </div>

            {errors.length > 0 ? (
              <ul className="text-celtas-red-light list-inside list-disc text-xs" aria-live="polite">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}

            <p className="text-right text-sm">
              Precio:{' '}
              <span className="font-semibold">
                {formatPrice(quantityError ? unitPrice : round2(unitPrice * qty))}
              </span>
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!selected || Boolean(quantityError) || errors.length > 0}
            onClick={() => {
              if (!selected) return
              onAdd({ menuItemId: selected.id, quantity: qty, comment, ...selection })
              close(false)
            }}
          >
            Agregar al pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
