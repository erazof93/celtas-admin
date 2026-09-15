import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { ExtraPortionForm } from './ExtraPortionForm'
import type { ExtraPortion } from '../types'

/**
 * Cubre lo que ExtraPortionForm agrega sobre el patrón de SauceForm: el campo
 * "price" (espejo de CreateExtraPortionDto: número > 0, máximo 2 decimales).
 */

const { createMock, updateMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
}))

vi.mock('./hooks', () => ({
  useCreateExtraPortion: () => ({ mutateAsync: createMock }),
  useUpdateExtraPortion: () => ({ mutateAsync: updateMock }),
}))

function makeConflictError(message: string) {
  return new AxiosError(
    message,
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    // @ts-expect-error -- solo se necesitan status/data para getApiMessage/isConflict
    { status: 409, data: { message } },
  )
}

function makeExtraPortion(overrides: Partial<ExtraPortion> = {}): ExtraPortion {
  return {
    id: 'ep-papas',
    name: 'Papas extra',
    price: 8,
    active: true,
    sortOrder: 0,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  createMock.mockReset()
  updateMock.mockReset()
})

describe('ExtraPortionForm', () => {
  it('crea una porción extra con el precio como número, no string', async () => {
    const user = userEvent.setup()
    createMock.mockResolvedValue(makeExtraPortion())

    render(<ExtraPortionForm onClose={() => {}} />)

    await user.type(screen.getByLabelText('Nombre'), 'Tocino extra')
    await user.clear(screen.getByLabelText('Precio (S/)'))
    await user.type(screen.getByLabelText('Precio (S/)'), '6.5')
    await user.click(screen.getByRole('button', { name: 'Crear porción extra' }))

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    const payload = createMock.mock.calls[0][0] as { price: unknown }
    expect(typeof payload.price).toBe('number')
    expect(payload.price).toBe(6.5)
  })

  it('rechaza un precio de 0 o negativo', async () => {
    const user = userEvent.setup()

    render(<ExtraPortionForm onClose={() => {}} />)

    await user.type(screen.getByLabelText('Nombre'), 'Queso extra')
    await user.clear(screen.getByLabelText('Precio (S/)'))
    await user.type(screen.getByLabelText('Precio (S/)'), '0')
    await user.click(screen.getByRole('button', { name: 'Crear porción extra' }))

    expect(
      await screen.findByText('El precio debe ser mayor a cero'),
    ).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('rechaza un precio negativo escrito directamente (bypass del spinner nativo)', async () => {
    const user = userEvent.setup()

    render(<ExtraPortionForm onClose={() => {}} />)

    await user.type(screen.getByLabelText('Nombre'), 'Guacamole extra')
    await user.clear(screen.getByLabelText('Precio (S/)'))
    await user.type(screen.getByLabelText('Precio (S/)'), '-5')
    await user.click(screen.getByRole('button', { name: 'Crear porción extra' }))

    expect(
      await screen.findByText('El precio debe ser mayor a cero'),
    ).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('rechaza el campo de precio vacío sin llamar a la API', async () => {
    const user = userEvent.setup()

    render(<ExtraPortionForm onClose={() => {}} />)

    await user.type(screen.getByLabelText('Nombre'), 'Chizitos extra')
    await user.clear(screen.getByLabelText('Precio (S/)'))
    await user.click(screen.getByRole('button', { name: 'Crear porción extra' }))

    expect(
      await screen.findByText('El precio debe ser mayor a cero'),
    ).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('rechaza más de 2 decimales', async () => {
    const user = userEvent.setup()

    render(<ExtraPortionForm onClose={() => {}} />)

    await user.type(screen.getByLabelText('Nombre'), 'Palta extra')
    await user.clear(screen.getByLabelText('Precio (S/)'))
    await user.type(screen.getByLabelText('Precio (S/)'), '4.999')
    await user.click(screen.getByRole('button', { name: 'Crear porción extra' }))

    expect(await screen.findByText('Máximo 2 decimales')).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('al editar, envía el id junto al payload para la mutación de update', async () => {
    const user = userEvent.setup()
    const extraPortion = makeExtraPortion({
      id: 'ep-1',
      name: 'Papas extra',
      price: 8,
    })
    updateMock.mockResolvedValue(extraPortion)

    render(<ExtraPortionForm extraPortion={extraPortion} onClose={() => {}} />)

    await user.clear(screen.getByLabelText('Precio (S/)'))
    await user.type(screen.getByLabelText('Precio (S/)'), '9')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as {
      id: string
      price: number
    }
    expect(payload.id).toBe('ep-1')
    expect(payload.price).toBe(9)
  })

  it('409 de nombre duplicado se muestra como error del campo "Nombre"', async () => {
    const user = userEvent.setup()
    createMock.mockRejectedValue(
      makeConflictError('Ya existe una porción extra con ese nombre'),
    )

    render(<ExtraPortionForm onClose={() => {}} />)

    await user.type(screen.getByLabelText('Nombre'), 'Papas extra')
    await user.clear(screen.getByLabelText('Precio (S/)'))
    await user.type(screen.getByLabelText('Precio (S/)'), '8')
    await user.click(screen.getByRole('button', { name: 'Crear porción extra' }))

    expect(
      await screen.findByText('Ya existe una porción extra con ese nombre'),
    ).toBeInTheDocument()
  })
})
