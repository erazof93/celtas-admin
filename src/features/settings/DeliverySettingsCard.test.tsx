import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeliverySettingsCard } from './DeliverySettingsCard'
import type { Setting } from './types'

/**
 * Cobertura del formulario de delivery por distancia: ubicación del local
 * precargada (o vacía si `store_location` viene sin configurar, seed real
 * del backend con `value: ''`), tabla de tramos con validación de orden
 * ascendente/último-sin-límite, radio de aviso, y el mapa de confirmación
 * que solo aparece con lat/lng válidas + API key de Geoapify configurada
 * (mismo patrón que `UserAddressesSection`).
 */

const { upsertMock } = vi.hoisted(() => ({ upsertMock: vi.fn() }))
const { settingsData } = vi.hoisted(() => ({
  settingsData: { current: [] as Setting[] },
}))

vi.mock('./hooks', () => ({
  useSettings: () => ({
    data: settingsData.current,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpsertSetting: () => ({ mutateAsync: upsertMock }),
}))

function makeSetting(key: string, value: string): Setting {
  return {
    id: `setting-${key}`,
    key,
    value,
    description: null,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
  }
}

const SAVED_TIERS = JSON.stringify([
  { maxMeters: 100, fee: 2 },
  { maxMeters: 400, fee: 4 },
  { maxMeters: null, fee: 8 },
])

describe('DeliverySettingsCard', () => {
  beforeEach(() => {
    upsertMock.mockReset()
    upsertMock.mockResolvedValue(makeSetting('x', 'x'))
    settingsData.current = [
      makeSetting('store_location', '{"latitude":-12.1631,"longitude":-76.97}'),
      makeSetting('delivery_fee_tiers', SAVED_TIERS),
      makeSetting('delivery_alert_radius_meters', '2500'),
    ]
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renderiza la ubicación, los tramos y el radio ya guardados', () => {
    render(<DeliverySettingsCard />)

    expect(screen.getByLabelText('Latitud')).toHaveValue(-12.1631)
    expect(screen.getByLabelText('Longitud')).toHaveValue(-76.97)
    expect(
      screen.getByLabelText('Radio de aviso de pedidos lejanos (metros)'),
    ).toHaveValue(2500)
    // 3 tramos guardados: 2 con "Hasta (metros)" + 1 último sin límite.
    expect(screen.getAllByLabelText('Hasta (metros)')).toHaveLength(2)
    expect(screen.getByLabelText('Sin límite (tarifa plana)')).toBeDisabled()
  })

  it('store_location sin configurar (seed real del backend, value vacío): avisa y no rompe el formulario', () => {
    settingsData.current = [
      makeSetting('store_location', ''),
      makeSetting('delivery_fee_tiers', SAVED_TIERS),
      makeSetting('delivery_alert_radius_meters', '2500'),
    ]
    render(<DeliverySettingsCard />)

    expect(
      screen.getByText('Ubicación del local sin configurar'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Latitud')).toHaveValue(null)
  })

  it('sin VITE_GEOAPIFY_API_KEY: no renderiza el mapa de confirmación', () => {
    // Stub explícito a vacío: el .env real de desarrollo SÍ tiene la key
    // configurada (Vite la carga también en modo test) — sin este stub, este
    // caso jamás se ejercita de verdad.
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', '')
    render(<DeliverySettingsCard />)
    expect(screen.queryByRole('img', { name: 'Mapa del local' })).not.toBeInTheDocument()
  })

  it('con VITE_GEOAPIFY_API_KEY y coordenadas válidas: renderiza el mapa como link a Google Maps', () => {
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-key')
    render(<DeliverySettingsCard />)

    const link = screen.getByRole('link', { name: 'Abrir en Google Maps' })
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=-12.1631,-76.97',
    )
    expect(
      screen.getByRole('img', { name: 'Mapa del local' }),
    ).toBeInTheDocument()
  })

  it('agregar un tramo inserta ANTES del último tramo sin límite', async () => {
    const user = userEvent.setup()
    render(<DeliverySettingsCard />)

    await user.click(screen.getByRole('button', { name: /agregar tramo/i }))

    // Ahora hay 3 tramos "Hasta (metros)" (los 2 originales + el nuevo vacío)
    // y sigue habiendo un único tramo final sin límite.
    expect(screen.getAllByLabelText('Hasta (metros)')).toHaveLength(3)
    expect(screen.getAllByLabelText('Sin límite (tarifa plana)')).toHaveLength(1)
  })

  it('no permite quitar el último tramo (siempre debe quedar al menos uno)', () => {
    settingsData.current = [
      makeSetting('store_location', '{"latitude":-12.1631,"longitude":-76.97}'),
      makeSetting('delivery_fee_tiers', JSON.stringify([{ maxMeters: null, fee: 8 }])),
      makeSetting('delivery_alert_radius_meters', '2500'),
    ]
    render(<DeliverySettingsCard />)

    expect(screen.getByRole('button', { name: /quitar tramo 1/i })).toBeDisabled()
  })

  it('rechaza tramos no ascendentes (superposición) y no envía el submit', async () => {
    const user = userEvent.setup()
    render(<DeliverySettingsCard />)

    const tramos = screen.getAllByLabelText('Hasta (metros)')
    // Deja los tramos en 400, 100 (invertido) — superposición real.
    await user.clear(tramos[0])
    await user.type(tramos[0], '400')
    await user.clear(tramos[1])
    await user.type(tramos[1], '100')

    await user.click(
      screen.getByRole('button', { name: /guardar configuración/i }),
    )

    expect(
      await screen.findByText(/orden ascendente, sin superposiciones/i),
    ).toBeInTheDocument()
    await waitFor(() => expect(upsertMock).not.toHaveBeenCalled())
  })

  it('guarda los 3 PATCH (ubicación, tramos, radio) con el payload correcto', async () => {
    const user = userEvent.setup()
    render(<DeliverySettingsCard />)

    await user.click(
      screen.getByRole('button', { name: /guardar configuración/i }),
    )

    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(3))

    const byKey = Object.fromEntries(
      upsertMock.mock.calls.map(([input]) => [input.key, input.value]),
    )
    expect(byKey.store_location).toBe(
      JSON.stringify({ latitude: -12.1631, longitude: -76.97 }),
    )
    expect(byKey.delivery_fee_tiers).toBe(SAVED_TIERS)
    expect(byKey.delivery_alert_radius_meters).toBe('2500')
  })
})
