import type { CouponDiscountType, CouponStatus } from './types'

const DAY_MS = 1000 * 60 * 60 * 24

/**
 * Formatea el valor del descuento según su tipo: "10%" o "S/ 15.00".
 * Espejo de describeDiscount del backend (coupons.service.ts).
 */
export function formatCouponDiscount(
  discountType: CouponDiscountType,
  discountValue: number,
): string {
  if (discountType === 'percentage') {
    return `${discountValue}%`
  }
  return `S/ ${discountValue.toFixed(2)}`
}

/**
 * Texto del monto mínimo de compra para las tablas de cupones: "Mín. S/ 50.00".
 * Devuelve null si no hay mínimo (null/undefined/0 — 0 es funcionalmente "sin
 * mínimo" en el backend) — en ese caso la UI omite la info por completo, no
 * muestra "Sin mínimo".
 */
export function formatMinPurchaseAmount(
  minPurchaseAmount: number | null | undefined,
): string | null {
  if (minPurchaseAmount === null || minPurchaseAmount === undefined) {
    return null
  }
  if (minPurchaseAmount === 0) {
    return null
  }
  return `Mín. ${formatCouponDiscount('fixed_amount', minPurchaseAmount)}`
}

/**
 * Días restantes hasta la expiración (redondeado hacia arriba: si expira en
 * 12 horas, quedan "1 día"). Devuelve 0 si ya expiró (nunca negativo).
 */
export function getDaysUntilExpiry(
  expiresAt: string | Date,
  now: Date,
): number {
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt)
  const diffMs = expiry.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diffMs / DAY_MS))
}

/** True si la fecha de expiración ya pasó (comparación directa de timestamps). */
export function isExpired(expiresAt: string | Date, now: Date): boolean {
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt)
  return expiry.getTime() <= now.getTime()
}

/**
 * Estado EFECTIVO para mostrar en el panel.
 *
 * El backend marca los cupones como 'expired' con un cron diario a la 1 AM;
 * entre la expiración real y la corrida del cron, un cupón 'active' puede
 * tener `expiresAt` en el pasado. Para el admin es más correcto mostrarlo
 * como expirado (el backend ya lo rechaza al usarlo: assertUsable).
 */
export function getEffectiveStatus(
  status: CouponStatus,
  expiresAt: string | Date,
  now: Date,
): CouponStatus {
  if (status === 'active' && isExpired(expiresAt, now)) {
    return 'expired'
  }
  return status
}