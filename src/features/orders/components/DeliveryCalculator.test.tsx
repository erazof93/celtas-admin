import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { DeliveryCalculator, type DeliveryLocation } from './DeliveryCalculator'
import type { Setting } from '../../settings/types'

/**
 * Leaflet no renderiza en jsdom: se mockea react-leaflet capturando los
 * handlers de click del mapa y dragend del pin para dispararlos a mano.
 * La API se mockea en `get` de api-client (los hooks reales corren): así el
 * test verifica URL y params exactos contra el contrato del backend.
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

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('@/lib/api-client', () => ({
  get: getMock,
  patch: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
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

const STORE = { lat: -12.1631, lng: -76.97 }
const GEOCODED: [number, number] = [-12.16, -76.968]

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

type Params = { address?: string; latitude?: number; longitude?: number }

/** Respuestas por URL; cada test puede sobreescribir una. */
let geocodeImpl: (params: Params) => Promise<unknown>
let estimateImpl: (params: Params) => Promise<unknown>

function renderCalculator(onChange?: (location: DeliveryLocation) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <DeliveryCalculator onChange={onChange} />
    </QueryClientProvider>,
  )
}

async function search(user: ReturnType<typeof userEvent.setup>, address: string) {
  await user.type(screen.getByLabelText('Dirección'), address)
  await user.click(screen.getByRole('button', { name: 'Buscar' }))
}

function estimateCalls() {
  return getMock.mock.calls.filter(([url]) => url === '/delivery/estimate')
}

beforeEach(() => {
  settingsState.data = [
    setting('store_location', JSON.stringify({ latitude: STORE.lat, longitude: STORE.lng })),
  ]
  settingsState.isLoading = false
  settingsState.isError = false
  settingsState.refetch = vi.fn()
  leaflet.click = null
  leaflet.dragend = null
  leaflet.map.setView.mockClear()

  geocodeImpl = () => Promise.resolve(GEOCODED)
  estimateImpl = () =>
    Promise.resolve({ deliveryFee: 4, isFarOrder: false, distanceMeters: 350 })
  getMock.mockReset()
  getMock.mockImplementation((url: string, config?: { params?: Params }) => {
    const params = config?.params ?? {}
    if (url === '/orders/geocode') return geocodeImpl(params)
    if (url === '/delivery/estimate') return estimateImpl(params)
    return Promise.reject(new Error(`URL inesperada: ${url}`))
  })
})

describe('DeliveryCalculator (backend real)', () => {
  it('Buscar → GET /orders/geocode con la dirección, pin en las coords devueltas y cotización de GET /delivery/estimate', async () => {
    const user = userEvent.setup()
    renderCalculator()

    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
    await search(user, '  Jr. Carabaya 250, Lima  ')

    expect(getMock).toHaveBeenCalledWith('/orders/geocode', {
      params: { address: 'Jr. Carabaya 250, Lima' },
    })
    expect(await screen.findByText('Delivery: S/ 4.00')).toBeInTheDocument()
    expect(screen.getByText('Distancia aprox.: 350 m')).toBeInTheDocument()
    expect(screen.getByTestId('marker-Cliente')).toHaveAttribute(
      'data-position',
      GEOCODED.join(','),
    )
    expect(screen.getByTestId('marker-Local')).toHaveAttribute(
      'data-position',
      `${STORE.lat},${STORE.lng}`,
    )
    expect(getMock).toHaveBeenCalledWith('/delivery/estimate', {
      params: { latitude: GEOCODED[0], longitude: GEOCODED[1] },
    })
    expect(screen.queryByText('Fuera de zona habitual')).not.toBeInTheDocument()
  })

  it('click en el mapa → re-cotiza en tiempo real con las coords nuevas', async () => {
    const user = userEvent.setup()
    estimateImpl = (params) =>
      Promise.resolve(
        params.latitude === GEOCODED[0]
          ? { deliveryFee: 4, isFarOrder: false, distanceMeters: 350 }
          : { deliveryFee: 6, isFarOrder: false, distanceMeters: 800 },
      )
    renderCalculator()
    await search(user, 'Jr. Carabaya 250, Lima')
    await screen.findByText('Delivery: S/ 4.00')

    const point = { lat: -12.155, lng: -76.97 }
    act(() => leaflet.click?.({ latlng: point }))

    expect(await screen.findByText('Delivery: S/ 6.00')).toBeInTheDocument()
    expect(screen.getByText('Distancia aprox.: 800 m')).toBeInTheDocument()
    expect(screen.getByTestId('marker-Cliente')).toHaveAttribute(
      'data-position',
      `${point.lat},${point.lng}`,
    )
    expect(getMock).toHaveBeenLastCalledWith('/delivery/estimate', {
      params: { latitude: point.lat, longitude: point.lng },
    })
  })

  it('arrastrar el pin lejos → re-cotiza y avisa "Fuera de zona habitual" (isFarOrder del backend)', async () => {
    const user = userEvent.setup()
    renderCalculator()
    await search(user, 'Jr. Carabaya 250, Lima')
    await screen.findByText('Delivery: S/ 4.00')

    estimateImpl = () =>
      Promise.resolve({ deliveryFee: 8, isFarOrder: true, distanceMeters: 3000 })
    const far = { lat: -12.136, lng: -76.97 }
    act(() => leaflet.dragend?.({ target: { getLatLng: () => far } }))

    expect(await screen.findByText('Delivery: S/ 8.00')).toBeInTheDocument()
    expect(screen.getByText('Fuera de zona habitual')).toBeInTheDocument()
  })

  it('distanceMeters null → muestra "—"', async () => {
    const user = userEvent.setup()
    estimateImpl = () =>
      Promise.resolve({ deliveryFee: 0, isFarOrder: false, distanceMeters: null })
    renderCalculator()
    await search(user, 'Jr. Carabaya 250, Lima')

    expect(await screen.findByText('Distancia aprox.: — m')).toBeInTheDocument()
  })

  it('400 del geocoding → mensaje del backend inline, sin mapa ni cotización', async () => {
    const user = userEvent.setup()
    geocodeImpl = () =>
      Promise.reject(httpError(400, 'Dirección no encontrada: "Av. Inexistente 999"'))
    renderCalculator()
    await search(user, 'Av. Inexistente 999')

    expect(
      await screen.findByText('Dirección no encontrada: "Av. Inexistente 999"'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Dirección')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
    expect(estimateCalls()).toHaveLength(0)
  })

  it('429 del geocoding → pide esperar un minuto', async () => {
    const user = userEvent.setup()
    geocodeImpl = () => Promise.reject(httpError(429))
    renderCalculator()
    await search(user, 'Jr. Carabaya 250, Lima')

    expect(await screen.findByText(/Espera un minuto/)).toBeInTheDocument()
  })

  it('503 del geocoding → servicio de mapas no disponible', async () => {
    const user = userEvent.setup()
    geocodeImpl = () => Promise.reject(httpError(503))
    renderCalculator()
    await search(user, 'Jr. Carabaya 250, Lima')

    expect(
      await screen.findByText(/servicio de mapas no está disponible/),
    ).toBeInTheDocument()
  })

  it('401 del geocoding (refresh también falló) → sesión expirada', async () => {
    const user = userEvent.setup()
    geocodeImpl = () => Promise.reject(httpError(401))
    renderCalculator()
    await search(user, 'Jr. Carabaya 250, Lima')

    expect(await screen.findByText(/sesión expiró/)).toBeInTheDocument()
  })

  it('500 de la cotización → error genérico con Reintentar, que vuelve a consultar', async () => {
    const user = userEvent.setup()
    estimateImpl = () => Promise.reject(httpError(500, 'Internal server error'))
    renderCalculator()
    await search(user, 'Jr. Carabaya 250, Lima')

    expect(
      await screen.findByText('No se pudo calcular el delivery. Intenta de nuevo.'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('map')).toBeInTheDocument()

    estimateImpl = () =>
      Promise.resolve({ deliveryFee: 4, isFarOrder: false, distanceMeters: 350 })
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Delivery: S/ 4.00')).toBeInTheDocument()
  })

  it('mientras cotiza muestra "Calculando delivery…"', async () => {
    const user = userEvent.setup()
    let resolve: (v: unknown) => void = () => {}
    estimateImpl = () => new Promise((r) => (resolve = r))
    renderCalculator()
    await search(user, 'Jr. Carabaya 250, Lima')

    expect(await screen.findByText('Calculando delivery…')).toBeInTheDocument()
    act(() => resolve({ deliveryFee: 4, isFarOrder: false, distanceMeters: 350 }))
    expect(await screen.findByText('Delivery: S/ 4.00')).toBeInTheDocument()
  })

  it('búsqueda vacía → pide escribir una dirección, sin llamar al backend', async () => {
    const user = userEvent.setup()
    renderCalculator()
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(screen.getByText('Escribe una dirección')).toBeInTheDocument()
    expect(getMock).not.toHaveBeenCalled()
  })

  it('sin store_location configurada → indica configurarla, sin buscador', () => {
    settingsState.data = [setting('store_location', '')]
    renderCalculator()

    expect(screen.getByText(/Configura la ubicación del local/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Dirección')).not.toBeInTheDocument()
  })

  it('error cargando settings → ErrorState con reintento', async () => {
    const user = userEvent.setup()
    settingsState.isError = true
    renderCalculator()

    expect(
      screen.getByText('No se pudo cargar la configuración de delivery'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /reintentar/i }))
    expect(settingsState.refetch).toHaveBeenCalledTimes(1)
  })

  it('buscar de nuevo la misma dirección vuelve a recentrar el mapa', async () => {
    const user = userEvent.setup()
    renderCalculator()
    await search(user, 'Jr. Carabaya 250, Lima')
    await screen.findByTestId('map')
    const callsAfterFirst = leaflet.map.setView.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    await waitFor(() =>
      expect(leaflet.map.setView.mock.calls.length).toBeGreaterThan(callsAfterFirst),
    )
    expect(leaflet.map.setView).toHaveBeenLastCalledWith(GEOCODED, 15)
  })

  it('(tester) mientras geocodifica: botón "Buscando…" deshabilitado', async () => {
    const user = userEvent.setup()
    let resolve: (v: unknown) => void = () => {}
    geocodeImpl = () => new Promise((r) => (resolve = r))
    renderCalculator()
    await search(user, 'Jr. Carabaya 250, Lima')

    expect(await screen.findByRole('button', { name: 'Buscando…' })).toBeDisabled()
    act(() => resolve(GEOCODED))
    expect(await screen.findByRole('button', { name: 'Buscar' })).toBeEnabled()
  })

  it('(tester) red caída en la cotización → "Revisa tu conexión" con Reintentar', async () => {
    const user = userEvent.setup()
    estimateImpl = () => Promise.reject(new AxiosError('Network Error', 'ERR_NETWORK'))
    renderCalculator()
    await search(user, 'Jr. Carabaya 250, Lima')

    expect(await screen.findByText(/Revisa tu conexión/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('ya no muestra el aviso de modo simulado', () => {
    renderCalculator()
    expect(screen.queryByText(/Modo simulado/)).not.toBeInTheDocument()
  })
})

describe('DeliveryCalculator - mapa desplazado a otra copia del mundo', () => {
  it('click con longitud fuera de rango → se normaliza antes de cotizar (evita 400 del backend)', async () => {
    const user = userEvent.setup()
    renderCalculator()
    await search(user, 'Jr. Carabaya 250, Lima')
    await screen.findByText('Delivery: S/ 4.00')

    act(() => leaflet.click?.({ latlng: { lat: -12.155, lng: 283.03 } }))

    await waitFor(() => {
      const [, config] = estimateCalls().at(-1) as [string, { params: Params }]
      expect(config.params.latitude).toBe(-12.155)
      expect(config.params.longitude).toBeCloseTo(-76.97, 9)
    })
  })
})

describe('DeliveryCalculator - onChange (reutilizado en pedido manual)', () => {
  it('notifica texto, punto ubicado y cotización; editar el texto invalida el punto', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderCalculator(onChange)

    await search(user, 'Jr. Carabaya 250, Lima')
    await screen.findByText('Delivery: S/ 4.00')

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        address: 'Jr. Carabaya 250, Lima',
        point: { lat: GEOCODED[0], lng: GEOCODED[1] },
        estimate: { deliveryFee: 4, isFarOrder: false, distanceMeters: 350 },
        estimateFailed: false,
      }),
    )

    // El pin ya no representa la dirección escrita → point/estimate en null.
    await user.type(screen.getByLabelText('Dirección'), ' 2do piso')
    expect(onChange).toHaveBeenLastCalledWith({
      address: 'Jr. Carabaya 250, Lima 2do piso',
      point: null,
      estimate: null,
      estimateFailed: false,
    })
  })

  it('mover el pin notifica el punto nuevo con su cotización', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    estimateImpl = (params) =>
      Promise.resolve(
        params.latitude === GEOCODED[0]
          ? { deliveryFee: 4, isFarOrder: false, distanceMeters: 350 }
          : { deliveryFee: 7, isFarOrder: true, distanceMeters: 2800 },
      )
    renderCalculator(onChange)
    await search(user, 'Jr. Carabaya 250, Lima')
    await screen.findByText('Delivery: S/ 4.00')

    act(() => leaflet.click?.({ latlng: { lat: -12.14, lng: -76.97 } }))

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        address: 'Jr. Carabaya 250, Lima',
        point: { lat: -12.14, lng: -76.97 },
        estimate: { deliveryFee: 7, isFarOrder: true, distanceMeters: 2800 },
        estimateFailed: false,
      }),
    )
  })
})

describe('DeliveryCalculator - onChange cuando falla la cotización', () => {
  it('notifica estimateFailed=true y vuelve a false al reintentar con éxito', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    estimateImpl = () => Promise.reject(httpError(500))
    renderCalculator(onChange)
    await search(user, 'Jr. Carabaya 250, Lima')

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ estimate: null, estimateFailed: true }),
      ),
    )

    estimateImpl = () =>
      Promise.resolve({ deliveryFee: 4, isFarOrder: false, distanceMeters: 350 })
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }))
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ estimateFailed: false, estimate: expect.objectContaining({ deliveryFee: 4 }) }),
      ),
    )
  })
})

describe('DeliveryCalculator - initialLocation (dirección guardada)', () => {
  function renderWithInitial(
    initialLocation: { address: string; point: { lat: number; lng: number } | null },
    onChange = vi.fn(),
  ) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <DeliveryCalculator initialLocation={initialLocation} onChange={onChange} />
      </QueryClientProvider>,
    )
    return onChange
  }

  it('con punto: muestra el mapa y cotiza sin buscar ni geocodificar', async () => {
    const onChange = renderWithInitial({
      address: 'Av. Los Álamos 123',
      point: { lat: -12.155, lng: -76.965 },
    })

    expect(screen.getByLabelText('Dirección')).toHaveValue('Av. Los Álamos 123')
    expect(screen.getByTestId('marker-Cliente')).toHaveAttribute('data-position', '-12.155,-76.965')
    expect(await screen.findByText('Delivery: S/ 4.00')).toBeInTheDocument()
    expect(getMock).toHaveBeenCalledWith('/delivery/estimate', {
      params: { latitude: -12.155, longitude: -76.965 },
    })
    expect(getMock).not.toHaveBeenCalledWith('/orders/geocode', expect.anything())
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          address: 'Av. Los Álamos 123',
          point: { lat: -12.155, lng: -76.965 },
          estimate: expect.objectContaining({ deliveryFee: 4 }),
        }),
      ),
    )
  })

  it('sin punto: precarga solo el texto, sin mapa ni cotización', async () => {
    const onChange = renderWithInitial({ address: 'Av. Sin Coords 1', point: null })

    expect(screen.getByLabelText('Dirección')).toHaveValue('Av. Sin Coords 1')
    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
    expect(estimateCalls()).toHaveLength(0)
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ address: 'Av. Sin Coords 1', point: null }),
      ),
    )
  })
})
