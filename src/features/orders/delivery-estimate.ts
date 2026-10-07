import { getApiMessage, getApiStatus } from '@/lib/api-errors'
import {
  parseStoreLocation,
  STORE_LOCATION_KEY,
} from '../settings/settings-utils'
import type { Setting, StoreLocation } from '../settings/types'
import type { DeliveryMode, DeliveryZoneSummary } from '../delivery-zones/types'

/**
 * Cotizador de delivery — contrato real, confirmado contra backend-celtas
 * (DTOs y servicios de delivery/orders):
 *
 * - `GET /orders/geocode?address=` (JWT, 10 req/min por usuario) → `[lat, lng]`.
 *   400 vacía/larga/no encontrada, 429 rate limit, 503 Geoapify caído.
 * - `GET /delivery/estimate?latitude=&longitude=` (JWT) →
 *   `{ deliveryFee, isFarOrder, distanceMeters, isCovered, deliveryMode, zone }`.
 *   400 coords inválidas, 404 `store_location` sin configurar.
 *   En ZONES, deliveryFee 0 sin cobertura no representa una cotización.
 *
 * Los motores son independientes: tramos en DISTANCE y catálogo en ZONES.
 * El cálculo vive solo en el backend; el panel no replica pricing ni cobertura.
 */

/** Espejo del retorno de `estimateDeliveryByCoords` en orders.service.ts. */
export interface DeliveryEstimate {
  deliveryFee: number
  isFarOrder: boolean
  /** Redondeado a múltiplos de 50 m (la tarifa usa la distancia exacta). */
  distanceMeters: number | null
  /** Keep older DISTANCE consumers/fixtures compatible; current backend returns all three fields. */
  isCovered?: boolean
  deliveryMode?: DeliveryMode
  zone?: DeliveryZoneSummary | null
}

export function isDeliveryUncovered(
  estimate: DeliveryEstimate | null | undefined,
): boolean {
  return estimate?.deliveryMode === 'ZONES' && estimate.isCovered === false
}

export interface LatLng {
  lat: number
  lng: number
}

/** Máximo de `GeocodeAddressDto.address` en el backend. */
export const GEOCODE_ADDRESS_MAX_LENGTH = 200

/**
 * Ubicación del local desde GET /settings — solo para dibujar su pin en el
 * mapa (la tarifa la calcula el backend). Sin configurar → `null`: nunca se
 * inventan coordenadas del local.
 */
export function storeLocationFromSettings(
  settings: Setting[] | undefined,
): StoreLocation | null {
  const value = settings?.find((s) => s.key === STORE_LOCATION_KEY)?.value
  return parseStoreLocation(value)
}

/**
 * Mensaje para un error de geocoding/cotización. Los 400/404 traen un mensaje
 * del backend en español que se muestra tal cual; 429/503/5xx/red se traducen
 * a algo accionable. El 401 lo maneja el interceptor de api-client (refresh o
 * redirect a /login): si llega acá es porque el refresh también falló.
 */
export function deliveryErrorMessage(
  error: unknown,
  kind: 'geocode' | 'estimate',
): string {
  const status = getApiStatus(error)
  if (status === 400 || status === 404) {
    return getApiMessage(
      error,
      kind === 'geocode' ? 'Dirección no encontrada' : 'No se pudo cotizar',
    )
  }
  if (status === 403)
    return 'Tu cuenta no tiene permisos para consultar el delivery.'
  if (status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.'
  if (status === 429) {
    return 'Demasiadas búsquedas seguidas. Espera un minuto y vuelve a intentar.'
  }
  if (status === 503) {
    return 'El servicio de mapas no está disponible en este momento. Intenta más tarde.'
  }
  if (status === null) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión.'
  }
  return kind === 'geocode'
    ? 'No se pudo buscar la dirección. Intenta de nuevo.'
    : 'No se pudo calcular el delivery. Intenta de nuevo.'
}

/**
 * Normaliza la longitud a [-180, 180). Leaflet repite el mundo al desplazar el
 * mapa horizontalmente: un click en otra "copia" da p. ej. lng 283.03, que el
 * backend rechaza (400, `@IsLongitude`). Equivale a `L.LatLng.wrap()`.
 */
export function wrapLatLng(point: LatLng): LatLng {
  // Solo se transforma si está fuera de rango: la aritmética en punto flotante
  // alteraría una longitud válida (-76.97 → -76.97000000000001).
  if (point.lng >= -180 && point.lng < 180) return point
  const lng = ((((point.lng + 180) % 360) + 360) % 360) - 180
  return { lat: point.lat, lng }
}
