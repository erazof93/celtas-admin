import {
  parseDeliveryAlertRadiusMeters,
  parseDeliveryFeeTiers,
  parseStoreLocation,
  DELIVERY_ALERT_RADIUS_METERS_KEY,
  DELIVERY_FEE_TIERS_KEY,
  STORE_LOCATION_KEY,
} from '../settings/settings-utils'
import type { DeliveryFeeTier, Setting, StoreLocation } from '../settings/types'

/**
 * Cotizador de delivery — capa MOCK temporal.
 *
 * El endpoint real es `GET /delivery/estimate?latitude=&longitude=` (JWT),
 * confirmado contra delivery.controller.ts + estimate-delivery-by-coords.dto.ts
 * de backend-celtas (commit be84b73). Todavía NO está desplegado (producción
 * responde 404), así que no está en api.d.ts.
 *
 * TODO(deploy /delivery/estimate): correr `pnpm run generate:types`, reemplazar
 * `DeliveryEstimate` por el tipo generado y `estimateDeliveryLocally` por un
 * hook de React Query contra `get('/delivery/estimate', { params })`.
 * TODO(geocoding): `mockGeocode` es una tabla fija — reemplazar por
 * geocodificación real (el backend no expone un endpoint de geocoding).
 */

/** Espejo del retorno de `estimateDeliveryByCoords` en orders.service.ts. */
export interface DeliveryEstimate {
  deliveryFee: number
  isFarOrder: boolean
  /** Redondeado a múltiplos de 50 m (la tarifa usa la distancia exacta). */
  distanceMeters: number | null
}

export interface DeliveryConfig {
  store: StoreLocation
  tiers: DeliveryFeeTier[]
  alertRadiusMeters: number
}

export interface LatLng {
  lat: number
  lng: number
}

/** Espejo de `DISTANCE_ROUNDING_METERS` en orders.service.ts. */
const DISTANCE_ROUNDING_METERS = 50
const EARTH_RADIUS_METERS = 6_371_000

const MOCK_ADDRESSES: Record<string, LatLng> = {
  'jr. carabaya 250': { lat: -12.1631, lng: -76.97 },
  'av. arequipa 500': { lat: -12.0656, lng: -76.9736 },
  'jr. lima 100': { lat: -12.0656, lng: -76.9836 },
  'calle default': { lat: -12.1631, lng: -76.97 },
}

/** MOCK: busca la dirección en una tabla fija; `null` = no encontrada. */
export function mockGeocode(address: string): LatLng | null {
  const normalized = address.trim().toLowerCase()
  if (!normalized) return null
  for (const [key, coords] of Object.entries(MOCK_ADDRESSES)) {
    if (normalized.includes(key)) return coords
  }
  return null
}

/**
 * Config real del cálculo, leída de GET /settings (las mismas claves que usa
 * el backend). Sin `store_location` configurada → `null` (el backend
 * respondería 404: nunca se inventan coordenadas del local).
 */
export function deliveryConfigFromSettings(
  settings: Setting[] | undefined,
): DeliveryConfig | null {
  const valueOf = (key: string) => settings?.find((s) => s.key === key)?.value
  const store = parseStoreLocation(valueOf(STORE_LOCATION_KEY))
  if (!store) return null
  return {
    store,
    tiers: parseDeliveryFeeTiers(valueOf(DELIVERY_FEE_TIERS_KEY)),
    alertRadiusMeters: parseDeliveryAlertRadiusMeters(
      valueOf(DELIVERY_ALERT_RADIUS_METERS_KEY),
    ),
  }
}

/** Espejo de `haversineDistanceMeters` (common/utils/geo.util.ts del backend). */
export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const toRadians = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/** Espejo de `feeForDistance`: primer tramo con `distance <= maxMeters`. */
export function feeForDistance(
  distanceMeters: number,
  tiers: DeliveryFeeTier[],
): number {
  for (const tier of tiers) {
    if (tier.maxMeters === null || distanceMeters <= tier.maxMeters)
      return tier.fee
  }
  return tiers[tiers.length - 1]?.fee ?? 0
}

/**
 * MOCK de `GET /delivery/estimate`: mismo cálculo que `computeDelivery` del
 * backend, con la config real de settings. Tarifa y aviso con la distancia
 * EXACTA; solo la distancia expuesta se redondea a 50 m.
 */
export function estimateDeliveryLocally(
  point: LatLng,
  config: DeliveryConfig,
): DeliveryEstimate {
  const exact = haversineDistanceMeters(
    { lat: config.store.latitude, lng: config.store.longitude },
    point,
  )
  return {
    deliveryFee: feeForDistance(exact, config.tiers),
    isFarOrder: exact > config.alertRadiusMeters,
    distanceMeters:
      Math.round(exact / DISTANCE_ROUNDING_METERS) * DISTANCE_ROUNDING_METERS,
  }
}
