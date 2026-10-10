import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  stop: vi.fn(),
  enableSound: vi.fn(),
  mute: vi.fn(),
  dismiss: vi.fn(),
  setVolume: vi.fn(),
  state: {
    notices: [{ orderId: '10000000-0000-4000-8000-000000000001', at: 1 }],
    enabled: false,
    volume: 0.35,
    coordinated: true,
    error: undefined as string | undefined,
  },
}))
vi.mock('./runtime', () => ({
  mountOrderAlerts: () => mocks.stop,
  orderAlerts: {
    subscribe: () => () => {},
    getSnapshot: () => mocks.state,
    enableSound: mocks.enableSound,
    mute: mocks.mute,
    dismiss: mocks.dismiss,
    setVolume: mocks.setVolume,
  },
}))
vi.mock('./environment', () => ({ localOrderAlertsEnabled: () => true }))
import { OrderAlerts } from './OrderAlerts'
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.state.enabled = false
  mocks.state.error = undefined
})
it('renders a global nonblocking notice with a direct detail link and explicit audio activation', () => {
  const view = render(
    <MemoryRouter>
      <OrderAlerts />
    </MemoryRouter>,
  )
  expect(screen.getByText('Nuevo pedido #10000000')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver pedido' })).toHaveAttribute(
    'href',
    '/orders?order=10000000-0000-4000-8000-000000000001',
  )
  expect(mocks.enableSound).not.toHaveBeenCalled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Activar sonido de pedidos' }),
  )
  expect(mocks.enableSound).toHaveBeenCalledTimes(1)
  fireEvent.click(
    screen.getByRole('button', { name: 'Cerrar aviso de pedido' }),
  )
  expect(mocks.dismiss).toHaveBeenCalledWith(mocks.state.notices[0].orderId)
  view.unmount()
  expect(mocks.stop).toHaveBeenCalledTimes(1)
})
it('offers mute, volume and a visible autoplay recovery message', () => {
  mocks.state.enabled = true
  mocks.state.error = 'Pulsa Activar sonido para reintentarlo.'
  render(
    <MemoryRouter>
      <OrderAlerts />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Silenciar pedidos' }))
  expect(mocks.mute).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByRole('slider', { name: 'Volumen de pedidos' }), {
    target: { value: '0.5' },
  })
  expect(mocks.setVolume).toHaveBeenCalledWith(0.5)
  expect(screen.getByText(mocks.state.error)).toBeVisible()
})
