import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders } from 'axios'
import { FriesTypeForm } from './FriesTypeForm'
import type { FriesType } from '../types'

const { createMock, updateMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
}))

vi.mock('./hooks', () => ({
  useCreateFriesType: () => ({ mutateAsync: createMock }),
  useUpdateFriesType: () => ({ mutateAsync: updateMock }),
}))

function makeFriesType(overrides: Partial<FriesType> = {}): FriesType {
  return {
    id: 'ft-hilo',
    name: 'Papas al hilo',
    isDefault: false,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  }
}

function conflict(message: string) {
  const headers = new AxiosHeaders()
  return new AxiosError('Conflict', '409', { headers }, null, {
    status: 409,
    statusText: 'Conflict',
    headers: {},
    config: { headers },
    data: { statusCode: 409, message },
  })
}

beforeEach(() => {
  createMock.mockReset()
  updateMock.mockReset()
})

describe('FriesTypeForm', () => {
  it('crear: envía name (trim) + isDefault y cierra', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    createMock.mockResolvedValue(makeFriesType())

    render(<FriesTypeForm onClose={onClose} />)
    await user.type(screen.getByLabelText('Nombre'), '  Papas nativas  ')
    await user.click(screen.getByRole('checkbox', { name: 'Por defecto' }))
    await user.click(screen.getByRole('button', { name: 'Crear tipo de papas' }))

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    expect(createMock).toHaveBeenCalledWith({
      name: 'Papas nativas',
      isDefault: true,
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('editar: precarga valores y manda el id aparte del resto (lo separa el hook)', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeFriesType())

    render(
      <FriesTypeForm
        friesType={makeFriesType({ isDefault: true })}
        onClose={() => {}}
      />,
    )
    expect(screen.getByLabelText('Nombre')).toHaveValue('Papas al hilo')
    expect(screen.getByRole('checkbox', { name: 'Por defecto' })).toBeChecked()

    await user.click(screen.getByRole('checkbox', { name: 'Por defecto' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    expect(updateMock).toHaveBeenCalledWith({
      id: 'ft-hilo',
      name: 'Papas al hilo',
      isDefault: false,
    })
  })

  it('nombre vacío muestra error y no envía', async () => {
    const user = userEvent.setup()
    render(<FriesTypeForm onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Crear tipo de papas' }))
    expect(
      await screen.findByText('El nombre es obligatorio'),
    ).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('409 de nombre duplicado se muestra en el campo con el mensaje del backend', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    createMock.mockRejectedValue(
      conflict('Ya existe un tipo de papas con ese nombre'),
    )

    render(<FriesTypeForm onClose={onClose} />)
    await user.type(screen.getByLabelText('Nombre'), 'Papas fritas')
    await user.click(screen.getByRole('button', { name: 'Crear tipo de papas' }))

    expect(
      await screen.findByText('Ya existe un tipo de papas con ese nombre'),
    ).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
