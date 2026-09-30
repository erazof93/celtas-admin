import type { MenuItem } from '../menu/types'

/**
 * Pedido manual del admin (POST /orders/admin) — lógica pura, sin React.
 *
 * Contrato confirmado contra backend-celtas @ dc35681:
 * - dto/create-order-admin.dto.ts: CreateOrderDto + customerId? | (customerName
 *   + customerPhone), mutuamente excluyentes (400 si se mandan ambos).
 * - dto/create-order.dto.ts: items[{ menuItemId, quantity 1..99, sauceIds?,
 *   beverageIds?, extraPortionIds?, friesTypeIds?, comment? (máx. 140) }],
 *   addressSnapshot (JSON STRING) | addressId. NO hay deliveryFee ni notas a
 *   nivel pedido: el delivery lo calcula el backend con las coordenadas del
 *   snapshot, y el comentario es por ítem.
 * - orders.service.ts buildItems: subtotal = (precio + bebidas + extras) *
 *   cantidad; una bebida es gratis si su `includeFreeTo` incluye el producto.
 *
 * Los precios que calcula el panel son una VISTA PREVIA: el total real lo
 * devuelve el backend en el pedido creado.
 */

export const MAX_QUANTITY = 99
export const COMMENT_MAX_LENGTH = 140
export const CUSTOMER_NAME_MAX_LENGTH = 100

/** Selección de un producto dentro del pedido (una línea de la tabla). */
export interface ManualOrderLine {
  /** Id local de la línea (el mismo producto puede ir en varias líneas con opciones distintas). */
  key: string
  menuItemId: string
  quantity: number
  sauceIds: string[]
  beverageIds: string[]
  extraPortionIds: string[]
  friesTypeIds: string[]
  comment: string
}

export type ManualOrderSelection = Omit<ManualOrderLine, 'key' | 'quantity' | 'comment'>

/** Espejo de round2 del backend. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Espejo de `normalizePeruMobile` (common/utils/phone.util.ts): 9 dígitos que
 * empiezan en 9, con o sin +51/espacios/guiones → "51XXXXXXXXX"; si no, null.
 */
export function normalizePeruMobile(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (/^9\d{8}$/.test(digits)) return `51${digits}`
  if (/^519\d{8}$/.test(digits)) return digits
  return null
}

/** Precio de una bebida para este producto (espejo de resolveBeveragePrices). */
export function beveragePriceFor(
  menuItem: MenuItem,
  beverage: MenuItem['beverages'][number],
): number {
  return beverage.includeFreeTo?.includes(menuItem.id) ? 0 : beverage.price
}

/** Precio unitario de la línea: producto + bebidas + porciones extras elegidas. */
export function lineUnitPrice(menuItem: MenuItem, selection: ManualOrderSelection): number {
  const beverages = menuItem.beverages
    .filter((b) => selection.beverageIds.includes(b.id))
    .reduce((sum, b) => sum + beveragePriceFor(menuItem, b), 0)
  const extras = menuItem.extraPortions
    .filter((e) => selection.extraPortionIds.includes(e.id))
    .reduce((sum, e) => sum + e.price, 0)
  return round2(menuItem.price + round2(beverages + extras))
}

/** Subtotal de la línea (espejo de `(unitPrice + extrasUnitPrice) * quantity`). */
export function lineSubtotal(menuItem: MenuItem, line: ManualOrderLine): number {
  return round2(lineUnitPrice(menuItem, line) * line.quantity)
}

/** Suma de las líneas; ignora las de productos que ya no están en el menú cargado. */
export function manualOrderSubtotal(
  lines: ManualOrderLine[],
  menuById: Map<string, MenuItem>,
): number {
  return round2(
    lines.reduce((sum, line) => {
      const menuItem = menuById.get(line.menuItemId)
      return menuItem ? sum + lineSubtotal(menuItem, line) : sum
    }, 0),
  )
}

interface GroupRule {
  label: { one: string; many: string }
  offered: number
  selected: number
  required: boolean
  /** null = sin límite. */
  max: number | null
}

/**
 * Mismas reglas que `validateGroupSelection` del backend, para avisar antes de
 * enviar: obligatorio sin elegir, o más de `max` elegidos. Grupo no ofrecido
 * → sin reglas. Devuelve los mensajes (vacío = válido).
 */
export function selectionErrors(menuItem: MenuItem, selection: ManualOrderSelection): string[] {
  const groups: GroupRule[] = [
    {
      label: { one: 'una salsa', many: 'salsa(s)' },
      offered: activeSauces(menuItem).length,
      selected: selection.sauceIds.length,
      required: menuItem.sauceGroupRequired,
      max: menuItem.sauceGroupMaxSelectable,
    },
    {
      label: { one: 'una bebida', many: 'bebida(s)' },
      offered: activeBeverages(menuItem).length,
      selected: selection.beverageIds.length,
      required: menuItem.beverageGroupRequired,
      max: menuItem.beverageGroupMaxSelectable,
    },
    {
      label: { one: 'una porción extra', many: 'porción extra(s)' },
      offered: activeExtraPortions(menuItem).length,
      selected: selection.extraPortionIds.length,
      required: menuItem.extraPortionsGroupRequired,
      max: menuItem.extraPortionsGroupMaxSelectable,
    },
    {
      label: { one: 'un tipo de papas', many: 'tipo(s) de papas' },
      offered: menuItem.friesTypes.length,
      selected: selection.friesTypeIds.length,
      required: menuItem.friesTypeGroupRequired,
      max: menuItem.friesTypeGroupMaxSelectable,
    },
  ]
  const errors: string[] = []
  for (const group of groups) {
    if (group.offered === 0) continue
    if (group.required && group.selected === 0) {
      errors.push(`Elige al menos ${group.label.one}`)
    }
    if (group.max !== null && group.selected > group.max) {
      errors.push(`Máximo ${group.max} ${group.label.many}`)
    }
  }
  return errors
}

/**
 * Opciones ofrecidas que se muestran al admin: solo las activas (igual que la
 * app cliente). El backend no filtra por `active`, pero una salsa/bebida
 * oculta no debería ofrecerse por teléfono tampoco.
 */
export const activeSauces = (m: MenuItem) => m.sauces.filter((s) => s.active)
export const activeBeverages = (m: MenuItem) => m.beverages.filter((b) => b.active)
export const activeExtraPortions = (m: MenuItem) => m.extraPortions.filter((e) => e.active)

/** Dirección del pedido: texto + coordenadas si se ubicó en el mapa. */
export interface ManualOrderAddress {
  fullAddress: string
  reference: string
  latitude: number | null
  longitude: number | null
}

/**
 * `addressSnapshot` es un JSON STRING (CreateOrderDto). Se arma con las mismas
 * claves que `resolveAddressSnapshot` copia de una dirección guardada, para que
 * OrderDetailDialog lo muestre igual. Sin coordenadas el backend cobra
 * delivery 0 (parseAddressCoords → null), así que solo se incluyen si existen.
 */
export function buildAddressSnapshot(address: ManualOrderAddress): string {
  return JSON.stringify({
    alias: 'Pedido manual',
    fullAddress: address.fullAddress.trim(),
    reference: address.reference.trim() || null,
    ...(address.latitude !== null && address.longitude !== null
      ? { latitude: address.latitude, longitude: address.longitude }
      : {}),
  })
}

export type ManualOrderCustomer =
  | { mode: 'registered'; customerId: string }
  | { mode: 'anonymous'; customerName: string; customerPhone: string }

export interface CreateOrderAdminItemInput {
  menuItemId: string
  quantity: number
  sauceIds?: string[]
  beverageIds?: string[]
  extraPortionIds?: string[]
  friesTypeIds?: string[]
  comment?: string
}

/** Body de POST /orders/admin (espejo de CreateOrderAdminDto). */
export interface CreateOrderAdminInput {
  customerId?: string
  customerName?: string
  customerPhone?: string
  addressSnapshot: string
  items: CreateOrderAdminItemInput[]
}

/**
 * Tri-state de los grupos (resolveSelected* del backend): omitido = "no
 * aplica" (null en el pedido), [] = el cliente eligió "Sin X". Un grupo que el
 * producto ofrece siempre viaja como array; uno que no ofrece se omite.
 */
function groupIds(offered: number, ids: string[]): string[] | undefined {
  return offered > 0 ? ids : undefined
}

export function buildCreateOrderAdminPayload(params: {
  customer: ManualOrderCustomer
  lines: ManualOrderLine[]
  menuById: Map<string, MenuItem>
  address: ManualOrderAddress
}): CreateOrderAdminInput {
  const { customer, lines, menuById, address } = params
  const items = lines.map((line): CreateOrderAdminItemInput => {
    const menuItem = menuById.get(line.menuItemId)
    const comment = line.comment.trim()
    const item: CreateOrderAdminItemInput = {
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      ...(comment ? { comment } : {}),
    }
    if (!menuItem) return item
    const sauceIds = groupIds(activeSauces(menuItem).length, line.sauceIds)
    const beverageIds = groupIds(activeBeverages(menuItem).length, line.beverageIds)
    const extraPortionIds = groupIds(activeExtraPortions(menuItem).length, line.extraPortionIds)
    const friesTypeIds = groupIds(menuItem.friesTypes.length, line.friesTypeIds)
    return {
      ...item,
      ...(sauceIds ? { sauceIds } : {}),
      ...(beverageIds ? { beverageIds } : {}),
      ...(extraPortionIds ? { extraPortionIds } : {}),
      ...(friesTypeIds ? { friesTypeIds } : {}),
    }
  })

  // customerId y customerName/customerPhone son excluyentes en el backend
  // (IsContactExclusiveWithCustomer → 400 si viajan juntos).
  const contact =
    customer.mode === 'registered'
      ? { customerId: customer.customerId }
      : {
          customerName: customer.customerName.trim(),
          customerPhone: customer.customerPhone.trim(),
        }

  return { ...contact, addressSnapshot: buildAddressSnapshot(address), items }
}
