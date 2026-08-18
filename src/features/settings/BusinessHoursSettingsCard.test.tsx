import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BusinessHoursSettingsCard } from './BusinessHoursSettingsCard'
import type { Setting } from './types'

/**
 * Cobertura del formulario de horario de atención: horario semanal ya
 * guardado se precarga por día, activar el cierre manual muestra el campo de
 * motivo, y `open === close` (ventana de duración cero) bloquea el submit
 * con un mensaje de error visible — a diferencia de un cruce de medianoche
 * (close < open), que es válido y NO debe rechazarse.
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

const SAVED_SCHEDULE = {
  '0': { closed: true, open: '', close: '' },
  '1': { closed: false, open: '11:00', close: '23:00' },
  '2': { closed: false, open: '11:00', close: '23:00' },
  '3': { closed: false, open: '11:00', close: '23:00' },
  '4': { closed: false, open: '11:00', close: '23:00' },
  '5': { closed: false, open: '11:00', close: '01:00' },
  '6': { closed: false, open: '11:00', close: '01:00' },
}

describe('BusinessHoursSettingsCard', () => {
  beforeEach(() => {
    upsertMock.mockReset()
    upsertMock.mockResolvedValue(makeSetting('x', 'x'))
    settingsData.current = [
      makeSetting('business_hours_schedule', JSON.stringify(SAVED_SCHEDULE)),
      makeSetting('business_manual_closed', 'false'),
      makeSetting('business_manual_closed_reason', ''),
    ]
  })

  it('renderiza el horario ya guardado por día, incluido un cruce de medianoche', () => {
    render(<BusinessHoursSettingsCard />)

    expect(screen.getByLabelText('Lun hora de apertura')).toHaveValue('11:00')
    expect(screen.getByLabelText('Lun hora de cierre')).toHaveValue('23:00')
    // Viernes cruza medianoche (11:00 → 01:00): válido, no se altera.
    expect(screen.getByLabelText('Vie hora de apertura')).toHaveValue('11:00')
    expect(screen.getByLabelText('Vie hora de cierre')).toHaveValue('01:00')
    // Domingo cerrado: no muestra inputs de hora.
    expect(
      screen.queryByLabelText('Dom hora de apertura'),
    ).not.toBeInTheDocument()
  })

  it('activar el switch de cierre manual muestra el campo de motivo', async () => {
    const user = userEvent.setup()
    render(<BusinessHoursSettingsCard />)

    expect(screen.queryByLabelText('Motivo')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('switch', {
        name: 'Local cerrado temporalmente ahora',
      }),
    )

    expect(screen.getByLabelText('Motivo')).toBeInTheDocument()
  })

  it('rechaza open === close: muestra error y no envía el submit', async () => {
    const user = userEvent.setup()
    render(<BusinessHoursSettingsCard />)

    const lunCierre = screen.getByLabelText('Lun hora de cierre')
    await user.clear(lunCierre)
    await user.type(lunCierre, '11:00')

    await user.click(screen.getByRole('button', { name: /guardar horario/i }))

    expect(
      await screen.findByText(
        'La hora de cierre no puede ser igual a la de apertura',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(upsertMock).not.toHaveBeenCalled())
  })

  it('el primer guardado (motivo vacío, seed real del backend) nunca envía value: "" — evitaría el 400 de @IsNotEmpty', async () => {
    const user = userEvent.setup()
    render(<BusinessHoursSettingsCard />)

    // El switch de cierre manual queda apagado y el motivo nunca se toca,
    // igual que el primer guardado real contra una base recién sembrada.
    await user.click(screen.getByRole('button', { name: /guardar horario/i }))

    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(3))

    const reasonCall = upsertMock.mock.calls.find(
      ([input]) => input.key === 'business_manual_closed_reason',
    )
    expect(reasonCall?.[0].value).not.toBe('')
    expect(reasonCall?.[0].value).toBe('Cerrado temporalmente')
  })
})
