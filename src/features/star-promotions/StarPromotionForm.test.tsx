import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { StarPromotionForm } from './StarPromotionForm'
import type { StarPromotion } from './types'

/**
 * Cubre el mapeo de error del 400 real de StarPromotionsService.assertNoOverlap
 * ("Ya existe una promoción activa en ese rango de fechas") al campo endDate,
 * y el fallback a error general del form para cualquier otro mensaje. Se edita
 * una promoción ya cargada (startDate/endDate prellenados desde `promotion`)
 * para no depender de interactuar con el popover del DatePicker.
 */

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))
const { updateMock } = vi.hoisted(() => ({ updateMock: vi.fn() }))

vi.mock('./hooks', () => ({
  useCreateStarPromotion: () => ({ mutateAsync: createMock }),
  useUpdateStarPromotion: () => ({ mutateAsync: updateMock }),
}))

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

function makePromotion(overrides: Partial<StarPromotion> = {}): StarPromotion {
  return {
    id: 'promo-1',
    label: 'Navidad 2026',
    multiplier: 2,
    startDate: '2026-12-20',
    endDate: '2026-12-31',
    active: true,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('StarPromotionForm mapeo de errores del servidor', () => {
  beforeEach(() => {
    createMock.mockReset()
    updateMock.mockReset()
  })

  it('mapea un 400 con "fechas" (solapamiento) al campo endDate, no como error general', async () => {
    const user = userEvent.setup()
    updateMock.mockRejectedValue(
      makeAxiosError(400, 'Ya existe una promoción activa en ese rango de fechas'),
    )
    render(<StarPromotionForm promotion={makePromotion()} onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText('Ya existe una promoción activa en ese rango de fechas'),
    ).toBeInTheDocument()
    // No debe aparecer como Alert de error general del form.
    expect(screen.queryByText('No se pudo guardar')).not.toBeInTheDocument()
  })

  it('un 400 sin la palabra "fechas" se muestra como error general del form', async () => {
    const user = userEvent.setup()
    updateMock.mockRejectedValue(makeAxiosError(500, 'Error interno del servidor'))
    render(<StarPromotionForm promotion={makePromotion()} onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('No se pudo guardar')).toBeInTheDocument()
    expect(screen.getByText('Error interno del servidor')).toBeInTheDocument()
  })

  it('un guardado exitoso no muestra ningún error y llama a onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    updateMock.mockResolvedValue(makePromotion())
    render(<StarPromotionForm promotion={makePromotion()} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('No se pudo guardar')).not.toBeInTheDocument()
  })
})
