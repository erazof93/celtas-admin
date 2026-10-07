import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { DeliveryZonesSection } from './DeliveryZonesSection'
import type { DeliveryZone } from './types'
import type { ZoneMapProps } from './ZoneMap'

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))
vi.mock('@/lib/api-client', () => api)
// Only the rendering engine boundary is replaced. Real form, hooks, query cache,
// dialogs and error handling run; these tests do not assert Leaflet interactions.
vi.mock('./ZoneMap', () => ({
  default: (props: ZoneMapProps) => (
    <div>
      <output data-testid="draft">{JSON.stringify(props.polygon)}</output>
      <output data-testid="selection">{props.selectedId}</output>
      <button onClick={() => props.onPolygon(polygon)}>Cerrar dibujo</button>
      <button onClick={() => props.onPolygon(changedPolygon)}>
        Mover vértice
      </button>
      {props.zones.map((zone) => (
        <button key={zone.id} onClick={() => props.onSelect(zone)}>
          Mapa {zone.name}
        </button>
      ))}
    </div>
  ),
}))
const polygon: DeliveryZone['polygon'] = {
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
const changedPolygon: DeliveryZone['polygon'] = {
  type: 'Polygon',
  coordinates: [
    [
      [-77, -12],
      [-76.98, -12],
      [-76.99, -11.99],
      [-77, -12],
    ],
  ],
}
const zone: DeliveryZone = {
  id: 'a',
  name: 'Centro',
  fee: 3,
  active: true,
  polygon,
  createdAt: '',
  updatedAt: '',
}
const inactive: DeliveryZone = {
  ...zone,
  id: 'b',
  name: 'Norte',
  active: false,
}
let catalog: DeliveryZone[]
let mode: string
function httpError(status: number) {
  return new AxiosError('Error', undefined, undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      message:
        status === 409
          ? 'La zona se solapa con otra zona'
          : 'Geometría inválida',
    },
  })
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <DeliveryZonesSection />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}
async function loaded() {
  await screen.findByRole('button', { name: 'Editar Centro' })
}
beforeEach(() => {
  vi.clearAllMocks()
  catalog = [zone, inactive]
  mode = 'DISTANCE'
  api.get.mockImplementation(async (url: string) => {
    if (url === '/settings')
      return [
        { key: 'delivery_mode', value: mode },
        { key: 'store_location', value: '{"latitude":-12,"longitude":-77}' },
      ]
    if (url === '/delivery/zones') return catalog
    throw new Error(`Unexpected request ${url}`)
  })
  api.post.mockImplementation(async (_url: string, body: object) => ({
    ...zone,
    ...body,
  }))
  api.patch.mockImplementation(async (_url: string, body: object) => ({
    ...zone,
    ...body,
  }))
  api.del.mockResolvedValue({ success: true })
})

describe('administración de zonas', () => {
  it('selección mapa/listado, inactivas visibles y edición explícita', async () => {
    const user = setup()
    await loaded()
    expect(screen.getByText('Inactiva')).toBeInTheDocument()
    expect(screen.getByText('Modo operativo: Distancia')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Mapa Norte' }))
    expect(screen.getByTestId('selection')).toHaveTextContent('b')
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Centro' }))
    expect(screen.getByTestId('selection')).toHaveTextContent('a')
    await user.click(screen.getByRole('button', { name: 'Editar Centro' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Centro')
    expect(screen.getByLabelText('Tarifa (S/)')).toHaveValue(3)
    expect(screen.getByTestId('draft').textContent).toBe(
      JSON.stringify(polygon),
    )
    expect(api.patch).not.toHaveBeenCalled()
  })
  it('crea solo al guardar, rechaza tarifa vacía y permite cero; nunca cambia settings', async () => {
    catalog = []
    const user = setup()
    await user.click(
      await screen.findByRole('button', { name: 'Dibujar primera zona' }),
    )
    await user.click(
      await screen.findByRole('button', { name: 'Cerrar dibujo' }),
    )
    expect(api.post).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Nombre'), ' Nueva ')
    await user.click(screen.getByRole('button', { name: 'Guardar zona' }))
    expect(
      await screen.findByText('La tarifa es obligatoria'),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('Tarifa (S/)'), '0')
    await user.click(screen.getByRole('button', { name: 'Guardar zona' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/delivery/zones', {
        name: 'Nueva',
        fee: 0,
        active: true,
        polygon,
      }),
    )
    expect(api.patch).not.toHaveBeenCalled()
  })
  it('mover vértices es local; cancelar y descartar restaura exactamente geometría persistida', async () => {
    const user = setup()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Editar Centro' }))
    await user.click(screen.getByRole('button', { name: 'Mover vértice' }))
    expect(screen.getByTestId('draft').textContent).toBe(
      JSON.stringify(changedPolygon),
    )
    expect(api.patch).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancelar edición' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByTestId('draft').textContent).toBe(
      JSON.stringify(changedPolygon),
    )
    await user.click(screen.getByRole('button', { name: 'Cancelar edición' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Descartar',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Editar Centro' }))
    expect(screen.getByTestId('draft').textContent).toBe(
      JSON.stringify(polygon),
    )
  })
  it('guarda edición antes de cambiar selección y no envía id en body', async () => {
    const user = setup()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Editar Centro' }))
    await user.click(screen.getByRole('button', { name: 'Mover vértice' }))
    await user.click(screen.getByRole('button', { name: 'Mapa Norte' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Guardar y continuar',
      }),
    )
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/delivery/zones/a', {
        name: 'Centro',
        fee: 3,
        active: true,
        polygon: changedPolygon,
      }),
    )
    await waitFor(() =>
      expect(screen.getByTestId('selection')).toHaveTextContent('b'),
    )
  })
  it.each([400, 409])(
    '%s conserva formulario y geometría para corregir',
    async (status) => {
      api.patch.mockRejectedValue(httpError(status))
      const user = setup()
      await loaded()
      await user.click(screen.getByRole('button', { name: 'Editar Centro' }))
      await user.click(screen.getByRole('button', { name: 'Mover vértice' }))
      await user.clear(screen.getByLabelText('Nombre'))
      await user.type(screen.getByLabelText('Nombre'), 'Editada')
      await user.click(screen.getByRole('button', { name: 'Guardar zona' }))
      await screen.findByText(
        status === 409 ? /se superpone con otra zona/ : 'Geometría inválida',
      )
      expect(screen.getByLabelText('Nombre')).toHaveValue('Editada')
      expect(screen.getByTestId('draft').textContent).toBe(
        JSON.stringify(changedPolygon),
      )
      if (status === 409)
        expect(
          api.get.mock.calls.filter(([url]) => url === '/delivery/zones')
            .length,
        ).toBeGreaterThan(1)
    },
  )
  it('eliminación requiere confirmación con nombre; DELETE no depende del body', async () => {
    const user = setup()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Eliminar Centro' }))
    expect(api.del).not.toHaveBeenCalled()
    expect(
      within(await screen.findByRole('dialog')).getByText('Eliminar Centro'),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Confirmar eliminación' }),
    )
    await waitFor(() =>
      expect(api.del).toHaveBeenCalledWith('/delivery/zones/a'),
    )
  })
  it('activa inactivas mediante PATCH parcial, sin settings', async () => {
    const user = setup()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Activar Norte' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/delivery/zones/b', {
        active: true,
      }),
    )
    expect(api.patch.mock.calls.every(([url]) => url !== '/settings')).toBe(
      true,
    )
  })
  it('ZONES externo advierte y protege última activa, también desde formulario', async () => {
    mode = 'ZONES'
    const user = setup()
    await loaded()
    expect(
      screen.getByText('El backend ya opera por zonas'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Desactivar Centro' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Eliminar Centro' }),
    ).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Editar Centro' }))
    await user.click(screen.getByLabelText('Activa'))
    await user.click(screen.getByRole('button', { name: 'Guardar zona' }))
    expect(
      await screen.findByText(/No puedes desactivar la última zona activa/),
    ).toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()
  })
  it('error de catálogo permite reintentar', async () => {
    api.get.mockImplementation(async (url: string) => {
      if (url === '/settings') return []
      throw httpError(403)
    })
    setup()
    expect(
      await screen.findByText('No se pudieron cargar las zonas'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Reintentar' }),
    ).toBeInTheDocument()
  })
  it('editor abierto bloquea cambio de motor aunque exista zona activa', async () => {
    const user = setup()
    await loaded()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Por zonas' })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Editar Centro' }))
    expect(screen.getByRole('button', { name: 'Por zonas' })).toBeDisabled()
    expect(api.patch).not.toHaveBeenCalled()
  })
  it('409 por carrera en última activa no se presenta como solapamiento y refresca modo', async () => {
    api.patch.mockRejectedValue(
      new AxiosError('conflict', undefined, undefined, undefined, {
        status: 409,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: {
          message:
            'No se puede desactivar la última zona activa mientras delivery_mode es ZONES',
        },
      }),
    )
    const user = setup()
    await loaded()
    mode = 'ZONES'
    await user.click(screen.getByRole('button', { name: 'Desactivar Centro' }))
    expect(
      await screen.findByText(/No puedes eliminar o desactivar la última/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/se superpone/)).not.toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Desactivar Centro' }),
      ).toBeDisabled(),
    )
    expect(
      api.get.mock.calls.filter(([url]) => url === '/settings').length,
    ).toBeGreaterThan(1)
  })
})
