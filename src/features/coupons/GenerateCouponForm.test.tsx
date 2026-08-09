import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { GenerateCouponForm } from './GenerateCouponForm'

/**
 * Regla de la skill react-celtas: la lógica de negocio crítica se testea desde
 * el primer día. Aquí se cubre el límite de 100% en el cliente (percentage),
 * que fixed_amount SÍ puede superar 100, y el mapeo del 404 de usuario al
 * campo userId — los tres casos del checklist de QA del módulo Cupones.
 */

const { mutateAsyncMock } = vi.hoisted(() => ({ mutateAsyncMock: vi.fn() }))

vi.mock('./hooks', () => ({
  useGenerateCoupon: () => ({ mutateAsync: mutateAsyncMock }),
}))

const VALID_UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6'

function makeAxiosError(status: number, message: string): AxiosError {
  const response = {
    status,
    statusText: 'Error',
    headers: {},
    config: {},
    data: { message },
  } as AxiosResponse
  return new AxiosError(
    `Request failed with status code ${status}`,
    AxiosError.ERR_BAD_REQUEST,
    undefined,
    undefined,
    response,
  )
}

describe('GenerateCouponForm', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset()
  })

  it('rechaza percentage > 100 en el cliente, sin llamar a la API', async () => {
    const user = userEvent.setup()
    render(<GenerateCouponForm onClose={() => {}} />)

    await user.type(screen.getByLabelText(/Usuario/i), VALID_UUID)
    await user.type(screen.getByLabelText(/Valor/i), '150')
    await user.click(screen.getByRole('button', { name: 'Generar cupón' }))

    expect(
      await screen.findByText(
        'El porcentaje de descuento no puede superar el 100%',
      ),
    ).toBeInTheDocument()
    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })

  it('permite fixed_amount > 100 (ej. S/150) y envía el payload correcto', async () => {
    const user = userEvent.setup()
    // Respuesta real del backend: el Coupon completo (el alert de éxito lo usa).
    mutateAsyncMock.mockResolvedValue({
      id: 'c1',
      userId: VALID_UUID,
      code: 'ABC12345',
      discountType: 'fixed_amount',
      discountValue: 150,
      status: 'active',
      origin: 'manual',
      expiresAt: '2026-08-23T12:00:00.000Z',
      usedAt: null,
      usedInOrderId: null,
      createdAt: '2026-08-08T12:00:00.000Z',
    })
    render(<GenerateCouponForm onClose={() => {}} />)

    await user.type(screen.getByLabelText(/Usuario/i), VALID_UUID)
    await user.click(screen.getByRole('combobox', { name: /Tipo de descuento/i }))
    await user.click(await screen.findByRole('option', { name: /Monto fijo/i }))
    await user.type(screen.getByLabelText(/Valor/i), '150')
    await user.click(screen.getByRole('button', { name: 'Generar cupón' }))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        userId: VALID_UUID,
        discountType: 'fixed_amount',
        discountValue: 150,
      })
    })

    // Espera el alert de éxito: flushea el setGenerated (que ocurre DESPUÉS de
    // que mutateAsync resuelve) dentro de act() — evita el warning intermitente
    // de "update not wrapped in act" cuando el test termina antes.
    expect(await screen.findByText('Cupón generado')).toBeInTheDocument()
  })

  it('mapea el 404 de usuario inexistente al campo userId', async () => {
    const user = userEvent.setup()
    mutateAsyncMock.mockRejectedValue(makeAxiosError(404, 'Usuario no encontrado'))
    render(<GenerateCouponForm onClose={() => {}} />)

    await user.type(screen.getByLabelText(/Usuario/i), VALID_UUID)
    await user.type(screen.getByLabelText(/Valor/i), '10')
    await user.click(screen.getByRole('button', { name: 'Generar cupón' }))

    expect(await screen.findByText('Usuario no encontrado')).toBeInTheDocument()
  })
})
