/**
 * Tipos del módulo reportes — espejo del contrato real del backend.
 * Swagger no documenta los schemas de respuesta de /admin/reports/* (solo una
 * descripción en texto), así que estos tipos se confirman contra la fuente
 * real: backend-celtas/src/modules/reports/reports.service.ts y
 * dto/report-query.dto.ts.
 *
 * Base de todos los reportes: pedidos ENTREGADOS en el rango (por deliveredAt,
 * días completos en America/Lima). Canal app = POST /orders; phone = cargado
 * desde el panel (POST /orders/admin).
 */

export type ReportChannel = 'all' | 'app' | 'phone'
export type ReportGroupBy = 'day' | 'week' | 'month'

/**
 * Filtros de la página. Las fechas van como YYYY-MM-DD (día calendario en
 * Lima), NO como Date: `Date.toISOString()` las pasaría a UTC y de noche en
 * Lima correría el día al siguiente.
 */
export interface ReportFilters {
  startDate: string
  endDate: string
  /** Solo lo filtra el backend en top-products; summary trae ambos canales. */
  channel: ReportChannel
  groupBy: ReportGroupBy
}

export interface ChannelMetrics {
  revenue: number
  orders: number
  customers: number
  averageTicket: number
}

/** Un período de GET /admin/reports/summary (incluye los períodos vacíos). */
export interface SummaryRow {
  /** Inicio del período: el día, el lunes (week) o el día 1 (month). */
  period: string
  revenue: number
  revenueApp: number
  revenuePhone: number
  orders: number
  ordersApp: number
  ordersPhone: number
  customers: number
  customersApp: number
  customersPhone: number
  averageTicket: number
  averageTicketApp: number
  averageTicketPhone: number
}

/** GET /admin/reports/summary?startDate&endDate&groupBy */
export interface ReportSummaryData {
  period: { start: string; end: string }
  summary: {
    totalRevenue: number
    totalOrders: number
    /** Un cliente que compró por los dos canales cuenta una vez. */
    totalCustomers: number
    averageTicket: number
  }
  byChannel: { app: ChannelMetrics; phone: ChannelMetrics }
  data: SummaryRow[]
}

interface PeriodTotals {
  /** "YYYY-MM-DD al YYYY-MM-DD" */
  period: string
  revenue: number
  orders: number
  averageTicket: number
}

/**
 * GET /admin/reports/comparison?current=A:B&previous=C:D
 * Cambios como texto con signo y 1 decimal ("+11.6%"); null si el período
 * anterior es 0.
 */
export interface ReportComparison {
  current: PeriodTotals
  previous: PeriodTotals
  comparison: {
    revenueChange: string | null
    ordersChange: string | null
    ticketChange: string | null
  }
  byChannel: Record<
    'app' | 'phone',
    {
      current: { revenue: number; change: string | null }
      previous: { revenue: number }
    }
  >
}

/**
 * Elemento de GET /admin/reports/top-products (array plano). Revenue =
 * unitPrice × quantity (sin delivery ni extras). Orden: quantity desc.
 */
export interface TopProduct {
  /** null si el producto se borró después del pedido. */
  id: string | null
  name: string
  quantity: number
  revenue: number
  /** Sobre el total del canal pedido (no solo del top devuelto). */
  revenuePercentage: number
  quantityPercentage: number
  averagePrice: number
  byChannel: Record<'app' | 'phone', { quantity: number; revenue: number }>
}

/** GET /admin/reports/conversion?startDate&endDate */
export interface ConversionReport {
  /** "YYYY-MM-DD al YYYY-MM-DD" */
  period: string
  phoneOrders: number
  phoneCustomers: number
  convertedToApp: number
  /** Texto con 1 decimal, ej. "25.0%". */
  conversionRate: string
  timeline: {
    phoneOrderDate: string
    appOrderDate: string
    daysDiff: number
  }[]
}
