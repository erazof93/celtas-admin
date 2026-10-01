import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders } from 'axios'
import { AutoCouponConfigCard } from './AutoCouponConfigCard'
import type { AutoCouponConfig } from '@/features/coupons/types'

/**
 * Cobertura del formulario de cupones automáticos: precarga la config de
 * GET /coupons/auto-config, valida en el cliente las mismas reglas que
 * UpdateAutoCouponConfigDto (no llega al PUT) y mapea los 400 del backend al
 * campo correspondiente.
 */

const { updateMock } = vi.hoisted(() => ({ updateMock: vi.fn() }))

const CONFIG: AutoCouponConfig = {
  discountType: 'percentage',
  discountValue: 10,
  thresholdAmount: 50,
  expirationDays: 15,
}

vi.mock('@/features/coupons/hooks', () => ({
  useAutoCouponConfig: () => ({
    data: CONFIG,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateAutoCouponConfig: () => ({ mutateAsync: updateMock }),
}))

/** 400 tal como lo arma el HttpExceptionFilter del backend: mensajes unidos con ", ". */
function badRequest(message: string) {
  const headers = new AxiosHeaders()
  return new AxiosError('Bad Request', '400', { headers }, null, {
    status: 400,
    statusText: 'Bad Request',
    headers,
    config: { headers },
    data: { success: false, statusCode: 400, message },
  })
}

describe('AutoCouponConfigCard', () => {
  beforeEach(() => {
    updateMock.mockReset()
    updateMock.mockResolvedValue(CONFIG)
  })

  it('precarga la configuración actual', () => {
    render(<AutoCouponConfigCard />)

    expect(screen.getByLabelText('Umbral de gasto (S/)')).toHaveValue(50)
    expect(screen.getByLabelText('Descuento (%)')).toHaveValue(10)
    expect(screen.getByLabelText('Días de vigencia')).toHaveValue(15)
  })

  it('envía los 4 campos como números y muestra el éxito', async () => {
    const user = userEvent.setup()
    render(<AutoCouponConfigCard />)

    const days = screen.getByLabelText('Días de vigencia')
    await user.clear(days)
    await user.type(days, '30')
    await user.click(screen.getByRole('button', { name: 'Guardar configuración' }))

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        discountType: 'percentage',
        discountValue: 10,
        thresholdAmount: 50,
        expirationDays: 30,
      }),
    )
    expect(await screen.findByText('Configuración guardada')).toBeInTheDocument()
  })

  it.each([
    ['Días de vigencia', '400', 'Máximo 365 días'],
    ['Días de vigencia', '2.5', 'Los días deben ser un número entero'],
    ['Descuento (%)', '150', 'El porcentaje de descuento no puede superar el 100%'],
    ['Descuento (%)', '10.555', 'El descuento admite hasta 2 decimales'],
    ['Umbral de gasto (S/)', '0', 'El umbral debe ser mayor a 0'],
  ])('%s = %s se rechaza en el cliente sin llamar al PUT', async (label, value, message) => {
    const user = userEvent.setup()
    render(<AutoCouponConfigCard />)

    const input = screen.getByLabelText(label)
    await user.clear(input)
    await user.type(input, value)
    await user.click(screen.getByRole('button', { name: 'Guardar configuración' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('mapea el 400 del backend al campo y lo no identificable a la alerta', async () => {
    updateMock.mockRejectedValue(
      badRequest(
        'expirationDays no puede superar 365, thresholdAmount debe ser mayor a 0, Algo inesperado',
      ),
    )
    const user = userEvent.setup()
    render(<AutoCouponConfigCard />)

    await user.click(screen.getByRole('button', { name: 'Guardar configuración' }))

    expect(
      await screen.findByText('expirationDays no puede superar 365'),
    ).toBeInTheDocument()
    expect(screen.getByText('thresholdAmount debe ser mayor a 0')).toBeInTheDocument()
    expect(screen.getByText('Algo inesperado')).toBeInTheDocument()
    expect(screen.queryByText('Configuración guardada')).not.toBeInTheDocument()
  })

  it('400 sin mensaje: muestra la alerta genérica', async () => {
    updateMock.mockRejectedValue(badRequest(''))
    const user = userEvent.setup()
    render(<AutoCouponConfigCard />)

    await user.click(screen.getByRole('button', { name: 'Guardar configuración' }))

    expect(
      await screen.findByText('No se pudo guardar la configuración de cupones'),
    ).toBeInTheDocument()
  })

  it('fixed_amount acepta un descuento mayor a 100', async () => {
    const user = userEvent.setup()
    render(<AutoCouponConfigCard />)

    await user.click(screen.getByLabelText('Tipo de descuento'))
    await user.click(await screen.findByRole('option', { name: 'Monto fijo (S/)' }))
    const value = screen.getByLabelText('Descuento (S/)')
    await user.clear(value)
    await user.type(value, '150')
    await user.click(screen.getByRole('button', { name: 'Guardar configuración' }))

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        discountType: 'fixed_amount',
        discountValue: 150,
        thresholdAmount: 50,
        expirationDays: 15,
      }),
    )
  })
})
