import { describe, expect, it } from 'vitest'
import {
  buildAddressMapUrl,
  buildGoogleMapsUrl,
  filterUsersByQuery,
  formatTotalSpent,
} from './users-utils'
import type { AdminUser } from './types'

/**
 * Lógica pura del módulo Users (regla de la skill react-celtas). El filtro de
 * búsqueda es en el cliente porque GET /users no soporta búsqueda server-side
 * (QueryUsersDto solo tiene page/limit) — se documenta y se testea.
 */

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'u1',
    email: 'cliente@example.com',
    fullName: 'Juan Pérez',
    provider: 'local',
    googleId: null,
    phone: null,
    fcmToken: null,
    totalSpent: 0,
    role: 'cliente',
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('filterUsersByQuery', () => {
  const users = [
    makeUser({ id: 'u1', fullName: 'Juan Pérez', email: 'juan@example.com' }),
    makeUser({ id: 'u2', fullName: 'María López', email: 'maria@example.com' }),
    makeUser({ id: 'u3', fullName: 'Admin Principal', email: 'admin@celtas.pe' }),
  ]

  it('query vacía devuelve todos', () => {
    expect(filterUsersByQuery(users, '')).toHaveLength(3)
    expect(filterUsersByQuery(users, '   ')).toHaveLength(3)
  })

  it('busca por nombre (case-insensitive, substring)', () => {
    expect(filterUsersByQuery(users, 'juan')).toHaveLength(1)
    expect(filterUsersByQuery(users, 'PÉREZ')).toHaveLength(1)
  })

  it('busca por email', () => {
    expect(filterUsersByQuery(users, 'celtas.pe')).toHaveLength(1)
    expect(filterUsersByQuery(users, 'maria@example.com')).toHaveLength(1)
  })

  it('sin coincidencias devuelve lista vacía', () => {
    expect(filterUsersByQuery(users, 'zzz')).toHaveLength(0)
  })
})

describe('formatTotalSpent', () => {
  it('formatea con dos decimales y S/', () => {
    expect(formatTotalSpent(0)).toBe('S/ 0.00')
    expect(formatTotalSpent(24.9)).toBe('S/ 24.90')
    expect(formatTotalSpent(150)).toBe('S/ 150.00')
  })
})

describe('buildAddressMapUrl', () => {
  it('arma la URL de la Static Maps API de Geoapify con lon,lat (no lat,lon)', () => {
    const url = buildAddressMapUrl(-12.164, -76.9721, 'my-key')
    expect(url).toBe(
      'https://maps.geoapify.com/v1/staticmap?style=osm-carto&width=400&height=200' +
        '&center=lonlat:-76.9721,-12.164&zoom=15' +
        '&marker=lonlat:-76.9721,-12.164;color:%23ff0000&apiKey=my-key',
    )
  })
})

describe('buildGoogleMapsUrl', () => {
  it('arma la URL de búsqueda de Google Maps con lat,lng (no lon,lat)', () => {
    const url = buildGoogleMapsUrl(-12.164, -76.9721)
    expect(url).toBe(
      'https://www.google.com/maps/search/?api=1&query=-12.164,-76.9721',
    )
  })
})