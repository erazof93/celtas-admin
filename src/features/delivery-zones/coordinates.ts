import type { DeliveryPolygon, Position } from './types'

export function leafletToPosition(point: {
  lat: number
  lng: number
}): Position {
  const longitude =
    point.lng >= -180 && point.lng <= 180
      ? point.lng
      : ((((point.lng + 180) % 360) + 360) % 360) - 180
  return [longitude, point.lat]
}

export function positionToLeaflet(position: Position): [number, number] {
  return [position[1], position[0]]
}

export function closeRing(positions: Position[]): Position[] {
  if (!positions.length) return []
  const ring = positions.map((point): Position => [...point])
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] === last[0] && first[1] === last[1]) ring.pop()
  return [...ring, [...first]]
}

/** Leaflet exports a Feature. Keep only its Polygon geometry, without rounding. */
export function polygonFromLeaflet(layer: {
  toGeoJSON: (precision: false) => {
    geometry: { type: string; coordinates: unknown }
  }
}): DeliveryPolygon {
  const geometry = layer.toGeoJSON(false).geometry
  if (
    geometry.type !== 'Polygon' ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length !== 1
  ) {
    throw new Error('Solo se permite un Polygon sin huecos')
  }
  const ring = (geometry.coordinates[0] as Position[]).map((position) =>
    leafletToPosition({ lng: position[0], lat: position[1] }),
  )
  return { type: 'Polygon', coordinates: [closeRing(ring)] }
}
