/**
 * Tipos del módulo dashboard — espejo del contrato real del backend.
 * Swagger no documenta los schemas de respuesta (content?: never en el
 * Swagger), así que estos tipos se confirman contra la fuente real del
 * backend: src/modules/admin/admin-dashboard.service.ts.
 *
 * - summary:      { ordersCount, ordersByStatus: [{status, count}], revenue }
 * - top-products: { items: [{menuItemId, name, quantity, revenue}], limit }
 */

/** Valores del enum OrderStatus del backend. */
export type OrderStatus =
  | 'pendiente'
  | 'confirmado'
  | 'en_camino'
  | 'entregado'
  | 'cancelado'

export interface DashboardSummary {
  /** Pedidos CREADOS en el rango (todos los estados). */
  ordersCount: number
  /** Conteo por estado (solo los estados presentes en el rango). */
  ordersByStatus: { status: OrderStatus; count: number }[]
  /** Suma del total de pedidos ENTREGADOS en el rango (por deliveredAt), en soles. */
  revenue: number
}

export interface TopProduct {
  /** Puede ser null si el producto se borró después del pedido. */
  menuItemId: string | null
  /** Nombre del snapshot del pedido (no el del menú actual). */
  name: string
  quantity: number
  revenue: number
}

export interface TopProductsResult {
  items: TopProduct[]
  limit: number
}