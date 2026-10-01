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
/**
 * Pedidos CREADOS en el período (todos los estados), separados por canal, y
 * ventas ENTREGADAS en el período. Canal: `source = admin` → teléfono
 * (pedido manual del panel); el resto → app. El backend NO separa los
 * ingresos por canal, solo la cantidad de pedidos.
 */
export interface PeriodMetrics {
  orders: number
  /** Suma del total de pedidos entregados en el período (por deliveredAt). */
  revenue: number
  ordersApp: number
  ordersPhone: number
}

/**
 * GET /admin/dashboard/metrics. Swagger no declara el schema de respuesta
 * (`content?: never`): tipado contra `admin-dashboard.service.ts` real.
 * Períodos en Lima: hoy, semana calendario (desde el lunes) y mes calendario
 * (desde el día 1). Sin comparación con el período anterior.
 */
export interface DashboardMetrics {
  today: PeriodMetrics
  week: PeriodMetrics
  month: PeriodMetrics & { newCustomers: number }
}

/**
 * Un día de GET /admin/dashboard/revenue-trend?days=N: los últimos N días
 * (incluye hoy y los días sin movimiento en 0), ascendente. `date` es el día
 * calendario en Lima (YYYY-MM-DD), no un instante.
 */
export interface RevenueTrendDay {
  date: string
  revenue: number
  ordersApp: number
  ordersPhone: number
}
