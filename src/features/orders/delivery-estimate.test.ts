import { describe, expect, it } from 'vitest'
import {
  deliveryConfigFromSettings,
  estimateDeliveryLocally,
  feeForDistance,
  haversineDistanceMeters,
  mockGeocode,
  type DeliveryConfig,
} from './delivery-estimate'
import type { Setting } from '../settings/types'

/** Metros por grado de latitud con R = 6 371 000 m (mismo radio que el backend). */
const METERS_PER_DEG_LAT = (Math.PI / 180) * 6_371_000

const config: DeliveryConfig = {
  store: { latitude: -12.1631, longitude: -76.97 },
  tiers: [
    { maxMeters: 100, fee: 2 },
    { maxMeters: 400, fee: 4 },
    { maxMeters: 1000, fee: 6 },
    { maxMeters: null, fee: 8 },
  ],
  alertRadiusMeters: 2500,
}

/** Punto a `meters` al norte del local (distancia exacta conocida). */
function northOfStore(meters: number) {
  return {
    lat: config.store.latitude + meters / METERS_PER_DEG_LAT,
    lng: config.store.longitude,
  }
}

function setting(key: string, value: string): Setting {
  return {
    id: key,
    key,
    value,
    description: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }
}

describe('haversineDistanceMeters', () => {
  it('1° de latitud ≈ 111 195 m', () => {
    expect(
      haversineDistanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }),
    ).toBeCloseTo(METERS_PER_DEG_LAT, 3)
  })

  it('mismo punto → 0', () => {
    expect(haversineDistanceMeters(northOfStore(0), northOfStore(0))).toBe(0)
  })
})

describe('feeForDistance (espejo del backend)', () => {
  it('toma el primer tramo con distance <= maxMeters, bordes inclusivos', () => {
    expect(feeForDistance(100, config.tiers)).toBe(2)
    expect(feeForDistance(100.01, config.tiers)).toBe(4)
    expect(feeForDistance(1000, config.tiers)).toBe(6)
    expect(feeForDistance(50_000, config.tiers)).toBe(8)
  })

  it('sin tramo final null usa el último tramo; sin tramos → 0', () => {
    expect(feeForDistance(5000, [{ maxMeters: 100, fee: 3 }])).toBe(3)
    expect(feeForDistance(5000, [])).toBe(0)
  })
})

describe('estimateDeliveryLocally (mock de GET /delivery/estimate)', () => {
  it('tarifa con distancia EXACTA, distancia expuesta redondeada a 50 m', () => {
    // 120 m exactos: tramo S/4 aunque la distancia mostrada redondee a 100.
    const estimate = estimateDeliveryLocally(northOfStore(120), config)
    expect(estimate).toEqual({
      deliveryFee: 4,
      isFarOrder: false,
      distanceMeters: 100,
    })
  })

  it('isFarOrder solo al superar el radio de aviso (nunca bloquea)', () => {
    expect(estimateDeliveryLocally(northOfStore(2499), config).isFarOrder).toBe(
      false,
    )
    const far = estimateDeliveryLocally(northOfStore(2600), config)
    expect(far.isFarOrder).toBe(true)
    expect(far.deliveryFee).toBe(8)
  })

  it('isFarOrder usa > estricto: distancia exacta == radio → false (igual que el backend)', () => {
    const point = northOfStore(1800)
    const exact = haversineDistanceMeters(
      { lat: config.store.latitude, lng: config.store.longitude },
      point,
    )
    expect(
      estimateDeliveryLocally(point, { ...config, alertRadiusMeters: exact })
        .isFarOrder,
    ).toBe(false)
  })

  it('valores consistentes: mismo punto → mismo resultado', () => {
    const point = northOfStore(350)
    expect(estimateDeliveryLocally(point, config)).toEqual(
      estimateDeliveryLocally(point, config),
    )
  })
})

describe('mockGeocode', () => {
  it('reconoce direcciones de prueba sin importar mayúsculas ni texto extra', () => {
    expect(mockGeocode('JR. CARABAYA 250, Lima')).toEqual({
      lat: -12.1631,
      lng: -76.97,
    })
    expect(mockGeocode('  Av. Arequipa 500 ')).toEqual({
      lat: -12.0656,
      lng: -76.9736,
    })
  })

  it('dirección desconocida o vacía → null', () => {
    expect(mockGeocode('Av. Inexistente 999')).toBeNull()
    expect(mockGeocode('   ')).toBeNull()
  })
})

describe('deliveryConfigFromSettings', () => {
  it('lee las 3 claves reales de settings', () => {
    const result = deliveryConfigFromSettings([
      setting('store_location', '{"latitude":-12.1,"longitude":-76.9}'),
      setting('delivery_fee_tiers', '[{"maxMeters":null,"fee":5}]'),
      setting('delivery_alert_radius_meters', '3000'),
    ])
    expect(result).toEqual({
      store: { latitude: -12.1, longitude: -76.9 },
      tiers: [{ maxMeters: null, fee: 5 }],
      alertRadiusMeters: 3000,
    })
  })

  it('sin store_location configurada → null (nunca inventa coordenadas)', () => {
    expect(deliveryConfigFromSettings([setting('store_location', '')])).toBeNull()
    expect(deliveryConfigFromSettings(undefined)).toBeNull()
  })
})
