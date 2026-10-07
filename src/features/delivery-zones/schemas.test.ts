import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  closeRing,
  leafletToPosition,
  polygonFromLeaflet,
  positionToLeaflet,
} from './coordinates'
import {
  createDeliveryZoneSchema,
  deliveryPolygonSchema,
  updateDeliveryZoneSchema,
  zoneFormSchema,
} from './schemas'
import type { DeliveryPolygon, Position } from './types'

const polygon: DeliveryPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-77, -12],
      [-76.99, -12],
      [-76.99, -11.99],
      [-77, -12],
    ],
  ],
}
const input = { name: ' Centro ', fee: '0', active: true, polygon }

describe('GeoJSON y validación de zonas', () => {
  it('convierte coordenadas sin redondear y normaliza copias del mundo', () => {
    const point = { lat: -12.123456789012, lng: -76.987654321098 }
    expect(positionToLeaflet(leafletToPosition(point))).toEqual([
      point.lat,
      point.lng,
    ])
    expect(leafletToPosition({ lat: -12, lng: 283 })).toEqual([-77, -12])
    expectTypeOf(leafletToPosition(point)).toEqualTypeOf<Position>()
  })
  it('cierra copiando exactamente el primer punto sin duplicar el cierre', () => {
    const ring: Position[] = [
      [-77.123456789, -12],
      [-77, -12],
      [-77, -11],
    ]
    const closed = closeRing(ring)
    expect(closed).toHaveLength(4)
    expect(closed[3]).toEqual(ring[0])
    expect(closed[3]).not.toBe(ring[0])
    expect(closeRing(closed)).toEqual(closed)
    expect(ring).toHaveLength(3)
  })
  it('extrae solo geometry, manteniendo precisión', () => {
    const layer = {
      toGeoJSON: (precision: false) => {
        expect(precision).toBe(false)
        return {
          type: 'Feature',
          bbox: [],
          properties: { id: 'extra' },
          geometry: polygon,
        }
      },
    }
    expect(polygonFromLeaflet(layer)).toEqual(polygon)
    expect(Object.keys(polygonFromLeaflet(layer))).toEqual([
      'type',
      'coordinates',
    ])
  })
  it('distingue tarifa vacía de cero y normaliza nombre', () => {
    expect(zoneFormSchema.safeParse({ ...input, fee: '' }).success).toBe(false)
    expect(zoneFormSchema.safeParse({ ...input, fee: '   ' }).success).toBe(
      false,
    )
    expect(zoneFormSchema.parse(input)).toMatchObject({
      fee: 0,
      name: 'Centro',
    })
    for (const fee of ['-1', '1.001', '0.000000001', 'Infinity', '100000000'])
      expect(zoneFormSchema.safeParse({ ...input, fee }).success).toBe(false)
    expect(zoneFormSchema.parse({ ...input, fee: '0.29' }).fee).toBe(0.29)
  })
  it('valida nombre, DTO parcial y no admite campos extra o null', () => {
    expect(
      createDeliveryZoneSchema.safeParse({ ...input, fee: 0, name: '  ' })
        .success,
    ).toBe(false)
    expect(
      createDeliveryZoneSchema.safeParse({
        ...input,
        fee: 0,
        name: 'x'.repeat(101),
      }).success,
    ).toBe(false)
    expect(updateDeliveryZoneSchema.parse({ active: false })).toEqual({
      active: false,
    })
    expect(updateDeliveryZoneSchema.safeParse({ fee: null }).success).toBe(
      false,
    )
    expect(updateDeliveryZoneSchema.safeParse({ id: 'extra' }).success).toBe(
      false,
    )
  })
  it('permite 499 vértices más cierre y rechaza 500 más cierre', () => {
    const circle = (count: number): DeliveryPolygon => ({
      type: 'Polygon',
      coordinates: [
        closeRing(
          Array.from({ length: count }, (_, i): Position => [
            -77 + Math.cos((i * 2 * Math.PI) / count) * 0.01,
            -12 + Math.sin((i * 2 * Math.PI) / count) * 0.01,
          ]),
        ),
      ],
    })
    expect(deliveryPolygonSchema.safeParse(circle(499)).success).toBe(true)
    expect(deliveryPolygonSchema.safeParse(circle(500)).success).toBe(false)
  })
  it('rechaza estructura, rangos, cierre y geometrías degeneradas', () => {
    const invalid = [
      { ...polygon, type: 'MultiPolygon' },
      { ...polygon, bbox: [] },
      {
        ...polygon,
        coordinates: [...polygon.coordinates, polygon.coordinates[0]],
      },
      { ...polygon, coordinates: [polygon.coordinates[0].slice(0, -1)] },
      {
        ...polygon,
        coordinates: [
          [
            [181, -12],
            [-77, -12],
            [-77, -11],
            [181, -12],
          ],
        ],
      },
      {
        ...polygon,
        coordinates: [
          [
            [-77, -12, 0],
            [-76, -12],
            [-76, -11],
            [-77, -12, 0],
          ],
        ],
      },
      {
        ...polygon,
        coordinates: [
          [
            [-77, -12],
            [-76, -12],
            [-75, -12],
            [-77, -12],
          ],
        ],
      },
      {
        ...polygon,
        coordinates: [
          [
            [-77, -12],
            [-77, -12],
            [-76, -11],
            [-77, -12],
          ],
        ],
      },
    ]
    invalid.forEach((value) =>
      expect(deliveryPolygonSchema.safeParse(value).success).toBe(false),
    )
    expect(zoneFormSchema.safeParse({ ...input, polygon: null }).success).toBe(
      false,
    )
  })
})
