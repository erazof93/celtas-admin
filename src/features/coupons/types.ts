/**
 * Tipos del módulo coupons — espejo del contrato real del backend.
 * Confirmados contra la fuente: src/modules/coupons/{entities,dto} del backend.
 */

export type CouponStatus = 'active' | 'used' | 'expired'

export type CouponDiscountType = 'percentage' | 'fixed_amount'

/** Origen del cupón: automático (umbral de gasto) o manual (campaña del admin). */
export type CouponOrigin = 'auto' | 'manual'

export interface Coupon {
  id: string
  userId: string
  /** Código único (8 caracteres hex en mayúsculas, generado con crypto). */
  code: string
  discountType: CouponDiscountType
  /** % si es percentage, soles si es fixed_amount (decimal transformado a number). */
  discountValue: number
  /**
   * Monto mínimo de compra (subtotal del pedido) para poder usar el cupón.
   * null = sin mínimo. Confirmado en GenerateCouponDto del Swagger.
   */
  minPurchaseAmount: number | null
  status: CouponStatus
  origin: CouponOrigin
  /** Calculado por el backend al generar (default: hoy + 15 días). */
  expiresAt: string
  usedAt: string | null
  usedInOrderId: string | null
  createdAt: string
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginatedCoupons {
  items: Coupon[]
  meta: PaginationMeta
}

/** Body de POST /coupons/generate (GenerateCouponDto). NO incluye expiresAt. */
export interface GenerateCouponInput {
  userId: string
  discountType: CouponDiscountType
  discountValue: number
  /**
   * Opcional: monto mínimo de compra (subtotal) para usar el cupón.
   * Omitido o null = sin mínimo (espejo de GenerateCouponDto).
   */
  minPurchaseAmount?: number | null
}

/**
 * Body de POST /coupons/generate-bulk (GenerateBulkCouponDto). A diferencia
 * de GenerateCouponInput, SÍ acepta expiresAt (opcional — omitido = el
 * backend calcula el default automático) y requiere campaignName. Confirmado
 * contra generate-bulk-coupon.dto.ts del backend.
 */
export interface GenerateBulkCouponInput {
  discountType: CouponDiscountType
  discountValue: number
  /** Etiqueta de campaña para agrupar/filtrar los cupones generados en masa. */
  campaignName: string
  minPurchaseAmount?: number | null
  /** ISO 8601. Omitido = el backend calcula hoy + días configurados. */
  expiresAt?: string
}

/**
 * Respuesta de POST /coupons/generate-bulk. El Swagger la documenta como
 * `unknown` (sin DTO de respuesta) — confirmado contra el código real:
 * CouponsService.generateBulk() en coupons.service.ts devuelve
 * `Promise<{ count: number }>`, un cupón por cada usuario con role cliente.
 */
export interface BulkCouponResult {
  count: number
}
