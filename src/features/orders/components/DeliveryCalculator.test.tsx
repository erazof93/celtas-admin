import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeliveryCalculator } from './DeliveryCalculator'
import type { Setting } from '../../settings/types'

/**
 * Leaflet no renderiza en jsdom: se mockea react-leaflet capturando los
 * handlers de click del mapa y dragend del pin para dispararlos a mano.
 */
const leaflet = vi.hoisted(() => ({
  click: null as null | ((e: { latlng: { lat: number; lng: number } }) => void),
  dragend: null as null | ((e: { target: unknown }) => void),
  map: { setView: vi.fn(), getZoom: () => 15 },
}))

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="map">{children}</div>
  ),
  TileLayer: () => null,
  Popup: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Marker: ({
    title,
    position,
    eventHandlers,
  }: {
    title: string
    position: [number, number]
    eventHandlers?: { dragend?: (e: { target: unknown }) => void }
  }) => {
    if (eventHandlers?.dragend) leaflet.dragend = eventHandlers.dragend
    return <div data-testid={`marker-${title}`} data-position={position.join(',')} />
  },
  useMap: () => leaflet.map,
  useMapEvents: (handlers: { click: typeof leaflet.click }) => {
    leaflet.click = handlers.click
    return null
  },
}))

const settingsState: {
  data: Setting[] | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
} = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() }

vi.mock('../../settings/hooks', () => ({
  useSettings: () => settingsState,
}))

const METERS_PER_DEG_LAT = (Math.PI / 180) * 6_371_000
const STORE = { lat: -12.1631, lng: -76.97 }

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

const configuredSettings = [
  setting('store_location', JSON.stringify({ latitude: STORE.lat, longitude: STORE.lng })),
  setting(
    'delivery_fee_tiers',
    JSON.stringify([
      { maxMeters: 100, fee: 2 },
      { maxMeters: 400, fee: 4 },
      { maxMeters: 1000, fee: 6 },
      { maxMeters: null, fee: 8 },
    ]),
  ),
  setting('delivery_alert_radius_meters', '2500'),
]

async function search(user: ReturnType<typeof userEvent.setup>, address: string) {
  await user.type(screen.getByLabelText('Dirección'), address)
  await user.click(screen.getByRole('button', { name: 'Buscar' }))
}

beforeEach(() => {
  settingsState.data = configuredSettings
  settingsState.isLoading = false
  settingsState.isError = false
  settingsState.refetch = vi.fn()
  leaflet.click = null
  leaflet.dragend = null
  leaflet.map.setView.mockClear()
})

describe('DeliveryCalculator (mocks)', () => {
  it('"Jr. Carabaya 250" + Buscar → mapa con pin del cliente y del local, y cotización', async () => {
    const user = userEvent.setup()
    render(<DeliveryCalculator />)

    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
    await search(user, 'Jr. Carabaya 250')

    expect(screen.getByTestId('map')).toBeInTheDocument()
    expect(screen.getByTestId('marker-Cliente')).toHaveAttribute(
      'data-position',
      `${STORE.lat},${STORE.lng}`,
    )
    expect(screen.getByTestId('marker-Local')).toBeInTheDocument()
    expect(screen.getByText('Distancia aprox.: 0 m')).toBeInTheDocument()
    expect(screen.getByText('Delivery: S/ 2.00')).toBeInTheDocument()
    expect(screen.queryByText('Fuera de zona habitual')).not.toBeInTheDocument()
  })

  it('click en el mapa → mueve el pin y recalcula con los tramos reales', async () => {
    const user = userEvent.setup()
    render(<DeliveryCalculator />)
    await search(user, 'Jr. Carabaya 250')

    const point = { lat: STORE.lat + 300 / METERS_PER_DEG_LAT, lng: STORE.lng }
    act(() => leaflet.click?.({ latlng: point }))

    expect(screen.getByTestId('marker-Cliente')).toHaveAttribute(
      'data-position',
      `${point.lat},${point.lng}`,
    )
    expect(screen.getByText('Distancia aprox.: 300 m')).toBeInTheDocument()
    expect(screen.getByText('Delivery: S/ 4.00')).toBeInTheDocument()
  })

  it('arrastrar el pin lejos → recalcula y avisa "Fuera de zona habitual"', async () => {
    const user = userEvent.setup()
    render(<DeliveryCalculator />)
    await search(user, 'Jr. Carabaya 250')

    const far = { lat: STORE.lat + 3000 / METERS_PER_DEG_LAT, lng: STORE.lng }
    act(() => leaflet.dragend?.({ target: { getLatLng: () => far } }))

    expect(screen.getByText('Delivery: S/ 8.00')).toBeInTheDocument()
    expect(screen.getByText('Fuera de zona habitual')).toBeInTheDocument()
  })

  it('dirección inválida → error inline "Dirección no encontrada", sin mapa', async () => {
    const user = userEvent.setup()
    render(<DeliveryCalculator />)
    await search(user, 'Av. Inexistente 999')

    expect(screen.getByText('Dirección no encontrada')).toBeInTheDocument()
    expect(screen.getByLabelText('Dirección')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
  })

  it('búsqueda vacía → pide escribir una dirección', async () => {
    const user = userEvent.setup()
    render(<DeliveryCalculator />)
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(screen.getByText('Escribe una dirección')).toBeInTheDocument()
  })

  it('sin store_location configurada → indica configurarla, sin buscador', () => {
    settingsState.data = [setting('store_location', '')]
    render(<DeliveryCalculator />)

    expect(screen.getByText(/Configura la ubicación del local/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Dirección')).not.toBeInTheDocument()
  })

  it('error cargando settings → ErrorState con reintento', async () => {
    const user = userEvent.setup()
    settingsState.isError = true
    render(<DeliveryCalculator />)

    expect(
      screen.getByText('No se pudo cargar la configuración de delivery'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /reintentar/i }))
    expect(settingsState.refetch).toHaveBeenCalledTimes(1)
  })

  it('buscar de nuevo la misma dirección vuelve a recentrar el mapa', async () => {
    const user = userEvent.setup()
    render(<DeliveryCalculator />)
    await search(user, 'Jr. Carabaya 250')
    const callsAfterFirst = leaflet.map.setView.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(leaflet.map.setView.mock.calls.length).toBeGreaterThan(callsAfterFirst)
    expect(leaflet.map.setView).toHaveBeenLastCalledWith([STORE.lat, STORE.lng], 15)
  })

  it('muestra el aviso de modo simulado', () => {
    render(<DeliveryCalculator />)
    expect(screen.getByText(/Modo simulado/)).toBeInTheDocument()
  })
})
