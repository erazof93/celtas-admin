import { haversineDistanceMeters } from '@/lib/geo'
import type { StoreLocation } from '../settings/types'
import type { AddressSnapshot, Order } from './types'

/** Suma de los subtotales de los items — el desglose que se muestra ANTES de sumar el envío. */
export function orderSubtotal(order: Order): number {
  return order.items.reduce((sum, item) => sum + item.subtotal, 0)
}

/**
 * Descuento aplicado por cupón, derivado del mismo despeje que usa el
 * backend para calcular `total` (`total = (subtotal - descuento) +
 * deliveryFee`) — el Order no expone el descuento ni el código del cupón
 * directamente. Redondeado a 2 decimales para no arrastrar basura de punto
 * flotante (mismo criterio que la validación de precios en ItemForm.tsx).
 */
export function orderDiscount(order: Order): number {
  const raw = orderSubtotal(order) - order.total + order.deliveryFee
  return Math.round(raw * 100) / 100
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

export interface OrderCustomer {
  /** Pedido manual del admin sin cuenta de cliente (`userId === null`). */
  isAnonymous: boolean
  /** Para la columna "Cliente" de la lista: 8 chars del userId, o "Sin cuenta". */
  shortLabel: string
  /** Nombre a mostrar; `null` si el pedido no trae la relación `user` cargada. */
  name: string | null
  /** Dígitos para `wa.me/<dígitos>`, o `null` si no hay teléfono. */
  phoneDigits: string | null
}

/**
 * Datos de contacto del pedido, con o sin cuenta. Único punto que lee
 * `userId`/`user`/`customerName`/`customerPhone`: un pedido anónimo trae
 * `userId` y `user` en `null` y el contacto en `customerName`/`customerPhone`
 * — leer `order.userId.slice()` o `order.user.phone` directo crasheaba la lista
 * y el detalle de Pedidos (TypeError) apenas existía un pedido anónimo.
 */
export function orderCustomer(order: Order): OrderCustomer {
  if (order.userId === null) {
    return {
      isAnonymous: true,
      shortLabel: 'Sin cuenta',
      name: order.customerName,
      phoneDigits: order.customerPhone ? digitsOnly(order.customerPhone) : null,
    }
  }
  return {
    isAnonymous: false,
    shortLabel: order.userId.slice(0, 8).toUpperCase(),
    name: order.user?.fullName ?? null,
    phoneDigits: order.user?.phone ? digitsOnly(order.user.phone) : null,
  }
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
