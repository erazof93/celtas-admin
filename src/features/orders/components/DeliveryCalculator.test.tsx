import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
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
        district: null,
      }),
    )

    // El pin ya no representa la dirección escrita → point/estimate en null.
    await user.type(screen.getByLabelText('Dirección'), ' 2do piso')
    expect(onChange).toHaveBeenLastCalledWith({
      address: 'Jr. Carabaya 250, Lima 2do piso',
      point: null,
      estimate: null,
      estimateFailed: false,
      district: null,
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
        district: null,
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

describe('DeliveryCalculator - autocompletado', () => {
  const geoFeature = {
    properties: {
      lat: -12.158,
      lon: -76.972,
      formatted: 'Avenida Los Héroes 1080, San Juan de Miraflores, Lima, Perú',
      street: 'Avenida Los Héroes',
      housenumber: '1080',
      city: 'San Juan de Miraflores',
    },
  }
  let fetchMock: ReturnType<typeof vi.fn>

  function renderAuto(props: Partial<Parameters<typeof DeliveryCalculator>[0]> = {}) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <DeliveryCalculator enableAutocomplete {...props} />
      </QueryClientProvider>,
    )
  }

  beforeEach(() => {
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-key')
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [geoFeature] }) })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('muestra direcciones guardadas que coinciden con lo escrito; elegir una avisa al padre', async () => {
    const user = userEvent.setup()
    const onPickSaved = vi.fn()
    renderAuto({
      onPickSaved,
      savedSuggestions: [
        { id: 'casa', label: 'Casa - Av. Los Álamos 123', fullAddress: 'Av. Los Álamos 123' },
        { id: 'trabajo', label: 'Trabajo - Jr. Lima 450', fullAddress: 'Jr. Lima 450' },
      ],
    })

    await user.type(screen.getByLabelText('Dirección'), 'álamos')
    const list = await screen.findByRole('listbox', { name: 'Sugerencias de dirección' })
    expect(within(list).getByText('Casa - Av. Los Álamos 123')).toBeInTheDocument()
    expect(within(list).queryByText('Trabajo - Jr. Lima 450')).not.toBeInTheDocument()
    expect(within(list).getByLabelText('Guardada')).toBeInTheDocument()

    await user.click(within(list).getByRole('option', { name: /Casa - Av. Los Álamos 123/ }))
    expect(onPickSaved).toHaveBeenCalledWith('casa')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('muestra sugerencias de Geoapify (con debounce, desde 4 caracteres)', async () => {
    const user = userEvent.setup()
    renderAuto()

    await user.type(screen.getByLabelText('Dirección'), 'Av.')
    await new Promise((r) => setTimeout(r, 500))
    expect(fetchMock).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Dirección'), ' Los Héroes')
    const list = await screen.findByRole('listbox', { name: 'Sugerencias de dirección' })
    expect(within(list).getByText('Avenida Los Héroes 1080, San Juan de Miraflores')).toBeInTheDocument()
    expect(within(list).getByLabelText('Geoapify')).toBeInTheDocument()
    expect(screen.getByText('Verifica el pin en el mapa y agrega una referencia.')).toBeInTheDocument()
    // Una sola consulta con el texto final (debounce), no una por tecla.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get('text')).toBe('Av. Los Héroes')
  })

  it('click en una sugerencia de Geoapify carga sus coordenadas en el mapa y cotiza ese punto', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderAuto({ onChange })

    await user.type(screen.getByLabelText('Dirección'), 'Los Héroes')
    await user.click(
      await screen.findByRole('option', { name: /Avenida Los Héroes 1080, San Juan de Miraflores/ }),
    )

    expect(screen.getByLabelText('Dirección')).toHaveValue('Avenida Los Héroes 1080, San Juan de Miraflores')
    expect(screen.getByTestId('marker-Cliente')).toHaveAttribute('data-position', '-12.158,-76.972')
    expect(getMock).toHaveBeenCalledWith('/delivery/estimate', {
      params: { latitude: -12.158, longitude: -76.972 },
    })
    // No pasa por el geocoding del backend.
    expect(getMock).not.toHaveBeenCalledWith('/orders/geocode', expect.anything())
    expect(await screen.findByText('Delivery: S/ 4.00')).toBeInTheDocument()
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          address: 'Avenida Los Héroes 1080, San Juan de Miraflores',
          point: { lat: -12.158, lng: -76.972 },
          district: 'San Juan de Miraflores',
        }),
      ),
    )
  })

  it('si Geoapify falla no muestra sugerencias y "Buscar" (backend) sigue funcionando', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({ ok: false, status: 429 })
    renderAuto()

    await search(user, 'Jr. Carabaya 250, Lima')
    await new Promise((r) => setTimeout(r, 500))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(await screen.findByText('Delivery: S/ 4.00')).toBeInTheDocument()
  })

  it('sin key de Geoapify no consulta el autocompletado', async () => {
    const user = userEvent.setup()
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', '')
    renderAuto()
    await user.type(screen.getByLabelText('Dirección'), 'Los Héroes 1080')
    await new Promise((r) => setTimeout(r, 500))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('DeliveryCalculator - pin manual (allowManualPin)', () => {
  it('muestra el mapa sin buscar; un click marca el pin, cotiza y lo notifica aunque no haya texto', async () => {
    const onChange = vi.fn()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <DeliveryCalculator allowManualPin onChange={onChange} />
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('map')).toBeInTheDocument()
    expect(screen.queryByTestId('marker-Cliente')).not.toBeInTheDocument()
    expect(screen.getByText('Haz click en el mapa para marcar la ubicación del cliente.')).toBeInTheDocument()

    act(() => leaflet.click?.({ latlng: { lat: -12.17, lng: -76.98 } }))

    expect(screen.getByTestId('marker-Cliente')).toHaveAttribute('data-position', '-12.17,-76.98')
    expect(await screen.findByText('Delivery: S/ 4.00')).toBeInTheDocument()
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ address: '', point: { lat: -12.17, lng: -76.98 } }),
      ),
    )
  })

  it('sin allowManualPin el mapa sigue apareciendo solo tras buscar', () => {
    renderCalculator()
    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
  })
})

describe('DeliveryCalculator - auditoría QA (pin adopta texto, distrito, teclado)', () => {
  const geoFeature = {
    properties: {
      lat: -12.158,
      lon: -76.972,
      formatted: 'Avenida Los Héroes 1080, San Juan de Miraflores, Lima, Perú',
      street: 'Avenida Los Héroes',
      housenumber: '1080',
      city: 'San Juan de Miraflores',
    },
  }

  function renderQa(props: Partial<Parameters<typeof DeliveryCalculator>[0]> = {}) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <DeliveryCalculator enableAutocomplete {...props} />
      </QueryClientProvider>,
    )
  }

  beforeEach(() => {
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-key')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [geoFeature] }) }),
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('arrastrar el pin tras editar el texto adopta el texto nuevo (vuelve a haber punto)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderQa({ onChange })
    await search(user, 'Jr. Carabaya 250, Lima')
    await screen.findByText('Delivery: S/ 4.00')

    await user.type(screen.getByLabelText('Dirección'), ' 2do piso')
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ point: null }))

    act(() => leaflet.dragend?.({ target: { getLatLng: () => ({ lat: -12.15, lng: -76.96 }) } }))

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          address: 'Jr. Carabaya 250, Lima 2do piso',
          point: { lat: -12.15, lng: -76.96 },
        }),
      ),
    )
  })

  it('el distrito de Geoapify se pierde al editar el texto y no revive al mover el pin', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderQa({ onChange })
    await user.type(screen.getByLabelText('Dirección'), 'Los Héroes')
    await user.click(
      await screen.findByRole('option', { name: /Avenida Los Héroes 1080, San Juan de Miraflores/ }),
    )
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ district: 'San Juan de Miraflores' }),
      ),
    )

    // Mover el pin sin tocar el texto: el distrito sigue.
    act(() => leaflet.click?.({ latlng: { lat: -12.159, lng: -76.973 } }))
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ point: { lat: -12.159, lng: -76.973 }, district: 'San Juan de Miraflores' }),
      ),
    )

    // Editar el texto y luego mover el pin: el distrito ya no aplica.
    await user.type(screen.getByLabelText('Dirección'), ' Mz B')
    // Texto editado sin re-ubicar: ni punto ni distrito de la sugerencia.
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ point: null, district: null }),
    )
    act(() => leaflet.dragend?.({ target: { getLatLng: () => ({ lat: -12.16, lng: -76.97 }) } }))
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          address: 'Avenida Los Héroes 1080, San Juan de Miraflores Mz B',
          point: { lat: -12.16, lng: -76.97 },
          district: null,
        }),
      ),
    )
  })

  it('Escape cierra la lista de sugerencias', async () => {
    const user = userEvent.setup()
    renderQa()
    await user.type(screen.getByLabelText('Dirección'), 'Los Héroes')
    await screen.findByRole('listbox', { name: 'Sugerencias de dirección' })
    expect(screen.getByLabelText('Dirección')).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Dirección')).toHaveAttribute('aria-expanded', 'false')
  })

  it('perder el foco cierra la lista de sugerencias', async () => {
    const user = userEvent.setup()
    renderQa()
    await user.type(screen.getByLabelText('Dirección'), 'Los Héroes')
    await screen.findByRole('listbox', { name: 'Sugerencias de dirección' })

    await user.click(document.body)
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  })
})

describe('DeliveryCalculator - correcciones de la auditoría del autocompletado', () => {
  const heroes = {
    properties: {
      lat: -12.158,
      lon: -76.972,
      formatted: 'Avenida Los Héroes 1080, San Juan de Miraflores, Lima, Perú',
      street: 'Avenida Los Héroes',
      housenumber: '1080',
      city: 'San Juan de Miraflores',
    },
  }
  const carabaya = {
    properties: { lat: -12.05, lon: -77.03, formatted: 'Jirón Carabaya 250, Lima, Perú' },
  }
  let fetchMock: ReturnType<typeof vi.fn>

  function renderWith(props: Partial<Parameters<typeof DeliveryCalculator>[0]> = {}) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <DeliveryCalculator {...props} />
      </QueryClientProvider>,
    )
  }

  beforeEach(() => {
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-key')
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [heroes, carabaya] }),
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('sin enableAutocomplete (cotizador de Pedidos) no consulta Geoapify aunque haya key', async () => {
    const user = userEvent.setup()
    renderWith()
    await user.type(screen.getByLabelText('Dirección'), 'Los Héroes 1080')
    await new Promise((r) => setTimeout(r, 500))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('flechas + Enter eligen la sugerencia resaltada (sin disparar "Buscar")', async () => {
    const user = userEvent.setup()
    renderWith({ enableAutocomplete: true })
    const input = screen.getByLabelText('Dirección')

    await user.type(input, 'Avenida')
    await screen.findByRole('listbox', { name: 'Sugerencias de dirección' })
    expect(input).not.toHaveAttribute('aria-activedescendant')

    await user.keyboard('{ArrowDown}{ArrowDown}')
    const second = screen.getByRole('option', { name: /Jirón Carabaya 250/ })
    expect(second).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', second.id)

    await user.keyboard('{Enter}')
    expect(input).toHaveValue('Jirón Carabaya 250, Lima, Perú')
    expect(screen.getByTestId('marker-Cliente')).toHaveAttribute('data-position', '-12.05,-77.03')
    expect(getMock).not.toHaveBeenCalledWith('/orders/geocode', expect.anything())
  })

  it('ArrowUp desde ninguno resalta la última; Escape cierra y limpia el resaltado', async () => {
    const user = userEvent.setup()
    renderWith({ enableAutocomplete: true })
    const input = screen.getByLabelText('Dirección')
    await user.type(input, 'Avenida')
    await screen.findByRole('listbox')

    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('option', { name: /Jirón Carabaya 250/ })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).not.toHaveAttribute('aria-activedescendant')
    expect(input).not.toHaveAttribute('aria-controls')
  })

  it('durante el debounce no muestra sugerencias del texto anterior', async () => {
    const user = userEvent.setup()
    renderWith({ enableAutocomplete: true })
    const input = screen.getByLabelText('Dirección')
    await user.type(input, 'Avenida')
    await screen.findByRole('option', { name: /Avenida Los Héroes 1080/ })

    await user.type(input, ' Pachacútec')
    // Antes de que venza el debounce, las de "Avenida" ya no se ofrecen.
    expect(screen.queryByRole('option', { name: /Avenida Los Héroes 1080/ })).not.toBeInTheDocument()
  })
})

describe('DeliveryCalculator - auditoría QA 2 (teclado del combobox)', () => {
  const features = [
    { properties: { lat: -12.158, lon: -76.972, formatted: 'Avenida Los Héroes 1080, Lima, Perú' } },
    { properties: { lat: -12.05, lon: -77.03, formatted: 'Avenida Carabaya 250, Lima, Perú' } },
  ]

  function renderQa2() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <DeliveryCalculator enableAutocomplete />
      </QueryClientProvider>,
    )
  }

  beforeEach(() => {
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features }) }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('el input se expone como combobox con su label', () => {
    renderQa2()
    expect(screen.getByRole('combobox', { name: 'Dirección' })).toBeInTheDocument()
  })

  it('ArrowDown es circular: tras la última vuelve a la primera', async () => {
    const user = userEvent.setup()
    renderQa2()
    await user.type(screen.getByLabelText('Dirección'), 'Avenida')
    await screen.findByRole('listbox')

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('option', { name: /Los Héroes 1080/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: /Carabaya 250/ })).toHaveAttribute('aria-selected', 'false')
  })

  it('Enter con la lista abierta pero sin resaltar dispara "Buscar" (backend), no una sugerencia', async () => {
    const user = userEvent.setup()
    renderQa2()
    await user.type(screen.getByLabelText('Dirección'), 'Avenida')
    await screen.findByRole('listbox')

    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith('/orders/geocode', { params: { address: 'Avenida' } }),
    )
    expect(screen.getByLabelText('Dirección')).toHaveValue('Avenida')
  })
})
