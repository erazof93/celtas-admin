/**
 * Tipos del módulo orders — espejo del contrato real del backend.
 * Confirmados contra la fuente: src/modules/orders/{entities,dto} del backend.
 * Swagger no documenta los schemas de respuesta (content?: never).
 */

export type OrderStatus =
  | 'pendiente'
  | 'confirmado'
  | 'en_camino'
  | 'entregado'
  | 'cancelado'

export interface OrderItem {
  id: string
  orderId: string
  /** Solo referencia: el precio/nombre reales viven en el snapshot (unitPrice/name). */
  menuItemId: string | null
  /** Nombre copiado al crear el pedido (snapshot, no el del menú actual). */
  name: string
  /** Precio unitario copiado al crear el pedido (snapshot). */
  unitPrice: number
  quantity: number
  /**
   * Salsas/cremas elegidas, snapshot al crear el pedido. Tri-state real — no
   * tratar como truthy check, los 3 casos son distintos en la UI:
   * - `null`: no aplica (el producto no ofrece salsas, o pedido anterior a
   *   esta feature).
   * - `[]`: el cliente vio el selector y eligió explícitamente "Sin salsas".
   * - `string[]` con nombres: las salsas elegidas.
   */
  selectedSauces: string[] | null
  /**
   * Comentario libre del cliente para este ítem (ej. "sin cebolla", "bien
   * cocida"), snapshot al crear el pedido. Se aplica a las `quantity`
   * unidades del ítem, no una nota por unidad individual. `null` = sin
   * comentario.
   */
  comment: string | null
  /** unitPrice * quantity, calculado en el backend. */
  subtotal: number
  createdAt: string
  updatedAt: string
}

/**
 * Cliente dueño del pedido (relación `user` cargada en `findAll`/`findOne` de
 * OrdersService — confirmado contra order.entity.ts/orders.service.ts reales:
 * `user: User`, objeto anidado completo salvo `password` con `@Exclude()`,
 * NO aplanado sobre Order). Solo se tipan los campos que usa el panel.
 * `phone` es nullable en la entidad (columna `nullable: true`), aunque el
 * tipo de TypeORM la declare `string` — el dato real puede venir `null`.
 */
export interface OrderUser {
  id: string
  fullName: string
  email: string
  phone: string | null
}

export interface Order {
  id: string
  userId: string
  status: OrderStatus
  /** Dirección al momento del pedido (JSON string, no referencia viva). */
  addressSnapshot: string
  /** Total en soles (number), YA incluye `deliveryFee`. */
  total: number
  /**
   * Costo de delivery por distancia (Haversine contra `store_location`),
   * calculado por el backend al crear el pedido. `0` si la dirección del
   * pedido no tenía coordenadas al momento de crear el pedido (dato viejo).
   */
  deliveryFee: number
  /** Link de WhatsApp generado al crear el pedido. */
  whatsappUrl: string
  /** Solo se setea al pasar a "entregado". */
  deliveredAt: string | null
  /**
   * Motivo de la cancelación. El backend lo exige solo en la transición
   * `en_camino` → `cancelado` (obligatorio); en pendiente/confirmado →
   * `cancelado` es opcional. `null` en pedidos no cancelados o cancelados
   * sin motivo registrado.
   */
  cancelReason: string | null
  items: OrderItem[]
  /**
   * Cliente dueño del pedido. Igual que `items`: el PATCH /orders/:id/status
   * devuelve el pedido SIN relaciones (ver merge.ts) — este campo se
   * considera siempre presente en el tipo por consistencia con el resto del
   * módulo, pero el merge conserva el `user` del detalle ya abierto.
   */
  user: OrderUser
  createdAt: string
  updatedAt: string
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginatedOrders {
  items: Order[]
  meta: PaginationMeta
}

/**
 * Snapshot de dirección guardado en el pedido (JSON string en
 * addressSnapshot). `latitude`/`longitude` confirmados contra
 * `resolveAddressSnapshot()` real de orders.service.ts (copia
 * `address.latitude`/`address.longitude` al crear el pedido) — ausentes en
 * direcciones creadas como texto libre (`dto.addressSnapshot` sin
 * `addressId`) o pedidos anteriores a esta feature.
 */
export interface AddressSnapshot {
  alias?: string
  fullAddress?: string
  reference?: string | null
  district?: string
  latitude?: number | null
  longitude?: number | null
}