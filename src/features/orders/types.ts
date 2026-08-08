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
  /** unitPrice * quantity, calculado en el backend. */
  subtotal: number
  createdAt: string
  updatedAt: string
}

export interface Order {
  id: string
  userId: string
  status: OrderStatus
  /** Dirección al momento del pedido (JSON string, no referencia viva). */
  addressSnapshot: string
  /** Total en soles (number). */
  total: number
  /** Link de WhatsApp generado al crear el pedido. */
  whatsappUrl: string
  /** Solo se setea al pasar a "entregado". */
  deliveredAt: string | null
  items: OrderItem[]
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

/** Snapshot de dirección guardado en el pedido (JSON string en addressSnapshot). */
export interface AddressSnapshot {
  alias?: string
  fullAddress?: string
  reference?: string | null
  district?: string
}