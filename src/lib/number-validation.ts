import { z } from 'zod'

export const MAX_MONEY = 99_999_999.99

export function hasMaxTwoDecimals(value: number): boolean {
  const [coefficient, exponent = '0'] = value.toString().split('e')
  return (
    Number.isFinite(value) &&
    (coefficient.split('.')[1]?.length ?? 0) - Number(exponent) <= 2
  )
}

/** Reject absent inputs before numeric conversion; explicit zero remains valid. */
export function requiredNumber(message: string) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? NaN : value),
    z.coerce.number(message),
  )
}

export function deliveryFeeError(fee: number): string | null {
  if (!Number.isFinite(fee)) return 'La tarifa debe ser un número finito'
  if (fee < 0) return 'La tarifa no puede ser negativa'
  if (fee > MAX_MONEY) return 'La tarifa excede el máximo permitido'
  if (!hasMaxTwoDecimals(fee))
    return 'La tarifa admite como máximo dos decimales'
  return null
}
