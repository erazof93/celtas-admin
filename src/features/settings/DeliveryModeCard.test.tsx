import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { DeliveryModeCard } from './DeliveryModeCard'

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }))
vi.mock('@/lib/api-client', () => api)
let mode: string, active: boolean
const setting = () => ({ id: 'mode', key: 'delivery_mode', value: mode })
function setup(editorOpen = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <DeliveryModeCard editorOpen={editorOpen} />
    </QueryClientProvider>,
  )
  return { client, user: userEvent.setup() }
}
beforeEach(() => {
  vi.clearAllMocks()
  mode = 'DISTANCE'
  active = true
  api.get.mockImplementation(async (url) =>
    url === '/settings' ? [setting()] : [{ id: 'a', active }],
  )
  api.patch.mockImplementation(async (_url, input) => {
    mode = input.value
    return setting()
  })
})
describe('selector del motor', () => {
  it.each([
    ['DISTANCE', 'Por zonas', 'Activar zonas', 'ZONES'],
    ['ZONES', 'Por distancia', 'Usar distancia', 'DISTANCE'],
  ])(
    '%s requiere confirmar; actualiza modo y borra cotizaciones anteriores',
    async (initial, option, confirm, next) => {
      mode = initial
      const { client, user } = setup()
      const key = ['delivery', 'estimate', -12, -77, initial]
      client.setQueryData(key, { deliveryFee: 99, deliveryMode: initial })
      const invalidate = vi.spyOn(client, 'invalidateQueries')
      const reset = vi.spyOn(client, 'resetQueries')
      const button = await screen.findByRole('button', { name: option })
      await waitFor(() => expect(button).toBeEnabled())
      await user.click(button)
      expect(api.patch).not.toHaveBeenCalled()
      const dialog = screen.getByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      expect(api.patch).not.toHaveBeenCalled()
      await user.click(button)
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: confirm,
        }),
      )
      await waitFor(() =>
        expect(api.patch).toHaveBeenCalledExactlyOnceWith('/settings', {
          key: 'delivery_mode',
          value: next,
        }),
      )
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      )
      expect(screen.getByRole('status')).toHaveTextContent(
        next === 'ZONES' ? 'Por zonas' : 'Por distancia',
      )
      expect(reset).toHaveBeenCalledWith({ queryKey: ['delivery', 'estimate'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['settings'] })
      expect(client.getQueryData(key)).toBeUndefined()
    },
  )
  it('sin zona activa no permite activar zonas', async () => {
    active = false
    setup()
    await screen.findByText(/Configura al menos una zona activa/)
    expect(screen.getByRole('button', { name: 'Por zonas' })).toBeDisabled()
    expect(api.patch).not.toHaveBeenCalled()
  })
  it('bloquea con borrador/editor abierto', async () => {
    setup(true)
    await screen.findByText(/Guarda o cancela/)
    expect(screen.getByRole('button', { name: 'Por zonas' })).toBeDisabled()
  })
  it('catálogo desconocido/error no permite activar', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/settings') return [setting()]
      throw Error('offline')
    })
    setup()
    await screen.findByRole('button', { name: 'Reintentar configuración' })
    expect(screen.getByRole('button', { name: 'Por zonas' })).toBeDisabled()
  })
  it('409 conserva modo real y refresca settings/catálogo', async () => {
    api.patch.mockImplementation(async () => {
      active = false
      throw new AxiosError('conflict', undefined, undefined, undefined, {
        status: 409,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { message: 'Sin zonas activas' },
      })
    })
    const { user } = setup()
    const button = await screen.findByRole('button', { name: 'Por zonas' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    await user.click(screen.getByRole('button', { name: 'Activar zonas' }))
    await screen.findAllByText(/No se pudo cambiar el método/)
    await waitFor(() =>
      expect(
        api.get.mock.calls.filter(([url]) => url === '/delivery/zones').length,
      ).toBeGreaterThan(1),
    )
    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent(
      'Por distancia',
    )
    expect(screen.getByRole('button', { name: 'Activar zonas' })).toBeDisabled()
    expect(
      api.get.mock.calls.filter(([url]) => url === '/settings').length,
    ).toBeGreaterThan(1)
  })
})
