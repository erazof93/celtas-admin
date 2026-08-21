/**
 * Distancia en línea recta (Haversine) — espejo EXACTO de
 * `src/common/utils/geo.util.ts` en backend-celtas. El backend NO expone
 * `distanceMeters` en la respuesta de un pedido (solo lo usa internamente
 * para calcular `deliveryFee` y decidir el push de "pedido lejano" al
 * crear el pedido) — el panel recalcula la distancia del lado del cliente
 * con la misma fórmula para poder mostrar el badge de "fuera de zona" en
 * el detalle sin depender de ese push.
 */

const EARTH_RADIUS_METERS = 6371000

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_METERS * c
}
