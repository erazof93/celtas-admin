import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { UseQueryResult } from '@tanstack/react-query'
import { UserAddressesSection } from './UserAddressesSection'
import type { UserAddress } from './types'

/**
 * Mapa de solo lectura (Geoapify Static Maps API) debajo de cada tarjeta de
 * dirección, SOLO cuando latitude/longitude no son null. Muchas direcciones
 * siguen sin coordenadas (creadas antes de esa columna, o editadas sin tocar
 * el mapa/autocompletado) — es un estado válido, sin placeholder de "sin
 * mapa" para esas.
 */

function makeAddress(overrides: Partial<UserAddress> = {}): UserAddress {
  return {
    id: 'addr-1',
    alias: 'Casa',
    fullAddress: 'Av. Los Héroes 123',
    reference: null,
    district: 'San Juan de Miraflores',
    isDefault: true,
    latitude: null,
    longitude: null,
    userId: 'user-1',
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  }
}

function makeQuery(
  data: UserAddress[],
): UseQueryResult<UserAddress[], Error> {
  return {
    isLoading: false,
    isError: false,
    data,
    refetch: vi.fn(),
  } as unknown as UseQueryResult<UserAddress[], Error>
}

describe('UserAddressesSection — mapa de solo lectura', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('dirección CON coordenadas: renderiza el mapa con la URL correcta', () => {
    const address = makeAddress({ latitude: -12.164, longitude: -76.9721 })
    render(<UserAddressesSection query={makeQuery([address])} />)

    const img = screen.getByRole('img', { name: 'Mapa de Casa' })
    expect(img).toHaveAttribute(
      'src',
      'https://maps.geoapify.com/v1/staticmap?style=osm-carto&width=400&height=200' +
        '&center=lonlat:-76.9721,-12.164&zoom=15' +
        '&marker=lonlat:-76.9721,-12.164;color:%23ff0000&apiKey=test-key',
    )
  })

  it('dirección SIN coordenadas: no renderiza ningún mapa, sin romper el resto de la tarjeta', () => {
    const address = makeAddress({ latitude: null, longitude: null })
    render(<UserAddressesSection query={makeQuery([address])} />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    // El resto de la tarjeta se renderiza normalmente.
    expect(screen.getByText('Casa')).toBeInTheDocument()
    expect(screen.getByText('Av. Los Héroes 123')).toBeInTheDocument()
    expect(screen.getByText('San Juan de Miraflores')).toBeInTheDocument()
  })

  it('el mapa es un link a Google Maps con las coordenadas correctas, en pestaña nueva', () => {
    const address = makeAddress({ latitude: -12.164, longitude: -76.9721 })
    render(<UserAddressesSection query={makeQuery([address])} />)

    const link = screen.getByRole('link', { name: 'Abrir en Google Maps' })
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=-12.164,-76.9721',
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    // El <img> del mapa vive dentro del link (todo el mapa es clickeable).
    expect(link).toContainElement(screen.getByRole('img', { name: 'Mapa de Casa' }))
  })
})
