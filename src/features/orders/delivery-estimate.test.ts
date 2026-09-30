import { describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import {
  deliveryErrorMessage,
  storeLocationFromSettings,
  wrapLatLng,
} from './delivery-estimate'
import type { Setting } from '../settings/types'

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

function httpError(status: number, message?: string) {
  const headers = new AxiosHeaders()
  return new AxiosError('HTTP error', String(status), { headers }, null, {
    status,
    statusText: '',
    headers: {},
    config: { headers },
    data: message ? { statusCode: status, message } : {},
  })
}

describe('storeLocationFromSettings', () => {
  it('lee store_location de settings', () => {
    expect(
      storeLocationFromSettings([
        setting('store_location', '{"latitude":-12.1,"longitude":-76.9}'),
      ]),
    ).toEqual({ latitude: -12.1, longitude: -76.9 })
  })

  it('sin store_location configurada → null (nunca inventa coordenadas)', () => {
    expect(storeLocationFromSettings([setting('store_location', '')])).toBeNull()
    expect(storeLocationFromSettings(undefined)).toBeNull()
  })
})

describe('deliveryErrorMessage', () => {
  it('400 del geocoding → mensaje del backend tal cual', () => {
    expect(
      deliveryErrorMessage(
        httpError(400, 'Dirección no encontrada: "Av. X"'),
        'geocode',
      ),
    ).toBe('Dirección no encontrada: "Av. X"')
  })

  it('400 sin mensaje → fallback según el tipo', () => {
    expect(deliveryErrorMessage(httpError(400), 'geocode')).toBe(
      'Dirección no encontrada',
    )
    expect(deliveryErrorMessage(httpError(400), 'estimate')).toBe(
      'No se pudo cotizar',
    )
  })

  it('404 de la cotización (store_location sin configurar) → mensaje del backend', () => {
    expect(
      deliveryErrorMessage(
        httpError(404, 'La ubicación del local no está configurada'),
        'estimate',
      ),
    ).toBe('La ubicación del local no está configurada')
  })

  it('401 → sesión expirada', () => {
    expect(deliveryErrorMessage(httpError(401), 'geocode')).toMatch(
      /sesión expiró/,
    )
  })

  it('429 → pide esperar un minuto', () => {
    expect(deliveryErrorMessage(httpError(429), 'geocode')).toMatch(
      /Espera un minuto/,
    )
  })

  it('503 → servicio de mapas no disponible', () => {
    expect(deliveryErrorMessage(httpError(503), 'geocode')).toMatch(
      /servicio de mapas no está disponible/,
    )
  })

  it('500 → genérico, sin filtrar el mensaje interno', () => {
    expect(
      deliveryErrorMessage(httpError(500, 'Internal server error'), 'estimate'),
    ).toBe('No se pudo calcular el delivery. Intenta de nuevo.')
  })

  it('sin respuesta (red caída) → revisa tu conexión', () => {
    expect(deliveryErrorMessage(new Error('Network Error'), 'geocode')).toMatch(
      /Revisa tu conexión/,
    )
  })
})

describe('wrapLatLng', () => {
  it('deja intacta una longitud ya en rango', () => {
    expect(wrapLatLng({ lat: -12.16, lng: -76.97 })).toEqual({ lat: -12.16, lng: -76.97 })
  })

  it('una copia del mundo a la derecha/izquierda vuelve a [-180, 180)', () => {
    expect(wrapLatLng({ lat: -12.16, lng: 283.03 }).lng).toBeCloseTo(-76.97, 9)
    expect(wrapLatLng({ lat: -12.16, lng: -436.97 }).lng).toBeCloseTo(-76.97, 9)
    expect(wrapLatLng({ lat: 0, lng: 180 }).lng).toBe(-180)
  })
})
