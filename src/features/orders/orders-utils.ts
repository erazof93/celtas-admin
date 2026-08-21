import { haversineDistanceMeters } from '@/lib/geo'
import type { StoreLocation } from '../settings/types'
import type { AddressSnapshot, Order } from './types'

/** Suma de los subtotales de los items — el desglose que se muestra ANTES de sumar el envío. */
export function orderSubtotal(order: Order): number {
  return order.items.reduce((sum, item) => sum + item.subtotal, 0)
}

/**
 * wa.me solo acepta dígitos — mismo criterio de normalización que
 * `normalizeWhatsappNumber` en settings-utils, duplicado acá a propósito
 * para no acoplar el módulo orders al de settings por una función de una
 * línea sin relación de dominio real.
 */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * Distancia (metros) entre el local y la dirección del pedido, o `null` si
 * falta cualquiera de las dos coordenadas — el backend NO expone
 * `distanceMeters` en la respuesta del pedido (solo lo calcula
 * internamente al crearlo, ver resolveDelivery() en orders.service.ts), así
 * que el panel lo recalcula del lado del cliente con la misma fórmula.
 */
export function orderDistanceMeters(
  address: AddressSnapshot | null,
  storeLocation: StoreLocation | null,
): number | null {
  if (
    !address ||
    !storeLocation ||
    typeof address.latitude !== 'number' ||
    typeof address.longitude !== 'number'
  ) {
    return null
  }
  return haversineDistanceMeters(
    storeLocation.latitude,
    storeLocation.longitude,
    address.latitude,
    address.longitude,
  )
}

/**
 * `true` si el pedido cae fuera del radio de aviso interno — mismo criterio
 * que `resolveDelivery()` del backend (`distanceMeters > alertRadiusMeters`).
 * `null` de distancia (sin coordenadas) o de `alertRadiusMeters` (settings
 * sin cargar todavía) → nunca se marca como lejano por falta de datos.
 */
export function isFarOrder(
  distanceMeters: number | null,
  alertRadiusMeters: number | null,
): boolean {
  if (distanceMeters === null || alertRadiusMeters === null) return false
  return distanceMeters > alertRadiusMeters
}
