import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { BeverageForm } from './BeverageForm'
import type { Beverage, MenuItem } from '../types'

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

/**
 * Cubre lo que BeverageForm agrega sobre el patrón de SauceForm: el campo
 * "price" (espejo de CreateBeverageDto: número > 0, máximo 2 decimales).
 */

const { createMock, updateMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
}))

vi.mock('./hooks', () => ({
  useCreateBeverage: () => ({ mutateAsync: createMock }),
  useUpdateBeverage: () => ({ mutateAsync: updateMock }),
}))

const menuItemsState: {
  data: MenuItem[] | undefined
  isLoading: boolean
  isError: boolean
} = { data: [], isLoading: false, isError: false }

vi.mock('../items/hooks', () => ({
  useMenuItems: () => menuItemsState,
}))

function makeBeverage(overrides: Partial<Beverage> = {}): Beverage {
  return {
    id: 'b-cocacola',
    name: 'Coca-Cola 500ml',
    price: 5,
    active: true,
    sortOrder: 0,
    includeFreeTo: null,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  }
}

function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'combo-1',
    name: 'Combo Clásico',
    description: null,
    price: 24.9,
    image: null,
    available: true,
    redeemableWithStars: false,
    specialReward: false,
    categoryId: 'cat-combos',
    category: { id: 'cat-combos', name: 'Combos' } as MenuItem['category'],
    sauces: [],
    sauceGroupRequired: false,
    sauceGroupMaxSelectable: 1,
    beverages: [],
    beverageGroupRequired: false,
    beverageGroupMaxSelectable: 1,
    extraPortions: [],
    extraPortionsGroupRequired: false,
    extraPortionsGroupMaxSelectable: 1,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  createMock.mockReset()
  updateMock.mockReset()
  menuItemsState.data = []
  menuItemsState.isLoading = false
  menuItemsState.isError = false
})

describe('BeverageForm', () => {
  it('crea una bebida con el precio como número, no string', async () => {
    const user = userEvent.setup()
    createMock.mockResolvedValue(makeBeverage())

    render(<BeverageForm onClose={() => {}} />)

    await user.type(screen.getByLabelText('Nombre'), 'Inca Kola 500ml')
    await user.clear(screen.getByLabelText('Precio (S/)'))
    await user.type(screen.getByLabelText('Precio (S/)'), '5.5')
    await user.click(screen.getByRole('button', { name: 'Crear bebida' }))

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    const payload = createMock.mock.calls[0][0] as { price: unknown }
    expect(typeof payload.price).toBe('number')
    expect(payload.price).toBe(5.5)
  })

  it('rechaza un precio de 0 o negativo', async () => {
    const user = userEvent.setup()

    render(<BeverageForm onClose={() => {}} />)

    await user.type(screen.getByLabelText('Nombre'), 'Agua sin gas')
    await user.clear(screen.getByLabelText('Precio (S/)'))
    await user.type(screen.getByLabelText('Precio (S/)'), '0')
    await user.click(screen.getByRole('button', { name: 'Crear bebida' }))

    expect(
      await screen.findByText('El precio debe ser mayor a cero'),
    ).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('rechaza un precio negativo escrito directamente (bypass del spinner nativo)', async () => {
    const user = userEvent.setup()

    render(<BeverageForm onClose={() => {}} />)

    await user.type(screen.getByLabelText('Nombre'), 'Chicha morada')
    await user.clear(screen.getByLabelText('Precio (S/)'))
    await user.type(screen.getByLabelText('Precio (S/)'), '-5')
    await user.click(screen.getByRole('button', { name: 'Crear bebida' }))

    expect(
      await screen.findByText('El precio debe ser mayor a cero'),
    ).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('rechaza el campo de precio vacío sin llamar a la API', async () => {
    const user = userEvent.setup()

    render(<BeverageForm onClose={() => {}} />)

    await user.type(screen.getByLabelText('Nombre'), 'Limonada')
    await user.clear(screen.getByLabelText('Precio (S/)'))
    await user.click(screen.getByRole('button', { name: 'Crear bebida' }))

    expect(
      await screen.findByText('El precio debe ser mayor a cero'),
    ).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('rechaza más de 2 decimales', async () => {
    const user = userEvent.setup()

    render(<BeverageForm onClose={() => {}} />)

    await user.type(screen.getByLabelText('Nombre'), 'Agua con gas')
    await user.clear(screen.getByLabelText('Precio (S/)'))
    await user.type(screen.getByLabelText('Precio (S/)'), '5.999')
    await user.click(screen.getByRole('button', { name: 'Crear bebida' }))

    expect(await screen.findByText('Máximo 2 decimales')).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('al editar, envía el id solo para la mutación (nunca dentro del payload que arma el form)', async () => {
    const user = userEvent.setup()
    const beverage = makeBeverage({ id: 'b-1', name: 'Coca-Cola 500ml', price: 5 })
    updateMock.mockResolvedValue(beverage)

    render(<BeverageForm beverage={beverage} onClose={() => {}} />)

    await user.clear(screen.getByLabelText('Precio (S/)'))
    await user.type(screen.getByLabelText('Precio (S/)'), '6')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as {
      id: string
      price: number
      name: string
    }
    expect(payload.id).toBe('b-1')
    expect(payload.price).toBe(6)
  })

  it('crea una bebida marcada como gratis en combos seleccionados', async () => {
    const user = userEvent.setup()
    menuItemsState.data = [
      makeMenuItem({ id: 'combo-1', name: 'Combo Clásico' }),
      makeMenuItem({ id: 'combo-2', name: 'Combo Familiar' }),
      makeMenuItem({ id: 'combo-3', name: 'Combo Broaster' }),
    ]
    createMock.mockResolvedValue(makeBeverage())

    render(<BeverageForm onClose={() => {}} />)

    await user.type(screen.getByLabelText('Nombre'), 'Inca Kola 500ml')
    await user.clear(screen.getByLabelText('Precio (S/)'))
    await user.type(screen.getByLabelText('Precio (S/)'), '5')
    await user.click(screen.getByText(/^Combo Clásico/))
    await user.click(screen.getByText(/^Combo Familiar/))
    await user.click(screen.getByRole('button', { name: 'Crear bebida' }))

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    const payload = createMock.mock.calls[0][0] as { includeFreeTo: string[] }
    expect(payload.includeFreeTo).toEqual(['combo-1', 'combo-2'])
  })

  it('al editar, actualiza includeFreeTo con los combos marcados', async () => {
    const user = userEvent.setup()
    menuItemsState.data = [
      makeMenuItem({ id: 'combo-1', name: 'Combo Clásico' }),
      makeMenuItem({ id: 'combo-2', name: 'Combo Familiar' }),
    ]
    const beverage = makeBeverage({ id: 'b-1', includeFreeTo: ['combo-1'] })
    updateMock.mockResolvedValue(beverage)

    render(<BeverageForm beverage={beverage} onClose={() => {}} />)

    await user.click(screen.getByText(/^Combo Familiar/))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as { includeFreeTo: string[] }
    expect(payload.includeFreeTo).toEqual(['combo-1', 'combo-2'])
  })

  it('al editar, quita un combo desmarcado de includeFreeTo', async () => {
    const user = userEvent.setup()
    menuItemsState.data = [
      makeMenuItem({ id: 'combo-1', name: 'Combo Clásico' }),
      makeMenuItem({ id: 'combo-2', name: 'Combo Familiar' }),
    ]
    const beverage = makeBeverage({
      id: 'b-1',
      includeFreeTo: ['combo-1', 'combo-2'],
    })
    updateMock.mockResolvedValue(beverage)

    render(<BeverageForm beverage={beverage} onClose={() => {}} />)

    await user.click(screen.getByText(/^Combo Clásico/))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as { includeFreeTo: string[] }
    expect(payload.includeFreeTo).toEqual(['combo-2'])
  })

  it('avisa cuando un combo no tiene la bebida asignada como opción todavía', async () => {
    const beverage = makeBeverage({ id: 'b-1', includeFreeTo: [] })
    menuItemsState.data = [
      makeMenuItem({
        id: 'combo-1',
        name: 'Combo Clásico',
        beverages: [beverage],
      }),
      makeMenuItem({ id: 'combo-2', name: 'Combo Familiar', beverages: [] }),
    ]

    render(<BeverageForm beverage={beverage} onClose={() => {}} />)

    expect(screen.getByText('Combo Clásico')).toBeInTheDocument()
    expect(
      screen.getByText('Combo Familiar (bebida no asignada como opción)'),
    ).toBeInTheDocument()
  })

  it('409 de nombre duplicado se muestra como error del campo "Nombre"', async () => {
    const user = userEvent.setup()
    createMock.mockRejectedValue(
      makeConflictError('Ya existe una bebida con ese nombre'),
    )

    render(<BeverageForm onClose={() => {}} />)

    await user.type(screen.getByLabelText('Nombre'), 'Coca-Cola 500ml')
    await user.clear(screen.getByLabelText('Precio (S/)'))
    await user.type(screen.getByLabelText('Precio (S/)'), '5')
    await user.click(screen.getByRole('button', { name: 'Crear bebida' }))

    expect(
      await screen.findByText('Ya existe una bebida con ese nombre'),
    ).toBeInTheDocument()
  })
})
