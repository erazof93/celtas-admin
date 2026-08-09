import type { CouponOrigin, CouponStatus } from './types'

export const COUPON_STATUS_LABELS: Record<CouponStatus, string> = {
  active: 'Activo',
  used: 'Usado',
  expired: 'Expirado',
}

export const COUPON_STATUS_BADGE: Record<CouponStatus, string> = {
  active: 'bg-emerald-400/15 text-emerald-400',
  used: 'bg-sky-400/15 text-sky-400',
  expired: 'bg-celtas-red/15 text-celtas-red-light',
}

export const COUPON_ORIGIN_LABELS: Record<CouponOrigin, string> = {
  auto: 'Automático',
  manual: 'Campaña',
}