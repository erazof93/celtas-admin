import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ItemForm } from './ItemForm'
import type { Beverage, Category, ExtraPortion, MenuItem, Sauce } from '../types'

/**
 * Regresión de la mejora "checklist de salsas por producto" del módulo Menú
 * (feature 085091e). Cubre las reglas de negocio que el ROADMAP declara pero
 * que ningún test tocaba todavía:
 *
 *  1. Una salsa INACTIVA que el producto ya tiene asignada se sigue mostrando
 *     (marcada " (oculta)") y pre-seleccionada, para no perder la relación al
 *     editar sin querer.
 *  2. Catálogo de salsas vacío -> mensaje explícito que apunta a la pestaña
 *     "Salsas", sin checkboxes.
 *  3. El payload de create/update manda `sauceIds` como string[] (nunca objetos
 *     ni undefined).
 */

const { createMock, updateMock, uploadMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
  uploadMock: vi.fn(),
}))

const saucesState: {
  data: Sauce[] | undefined
  isLoading: boolean
  isError: boolean
} = { data: [], isLoading: false, isError: false }

const beveragesState: {
  data: Beverage[] | undefined
  isLoading: boolean
  isError: boolean
} = { data: [], isLoading: false, isError: false }

const extraPortionsState: {
  data: ExtraPortion[] | undefined
  isLoading: boolean
  isError: boolean
} = { data: [], isLoading: false, isError: false }

vi.mock('./hooks', () => ({
  useCreateItem: () => ({ mutateAsync: createMock }),
  useUpdateItem: () => ({ mutateAsync: updateMock }),
  useUploadItemImage: () => ({ mutateAsync: uploadMock }),
}))

vi.mock('../categories/hooks', () => ({
  useCategories: () => ({
    data: [
      { id: 'cat-burgers', name: 'Burgers' },
      { id: 'cat-sides', name: 'Acompanamientos' },
    ],
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('../sauces/hooks', () => ({
  useSauces: () => saucesState,
}))

vi.mock('../beverages/hooks', () => ({
  useBeverages: () => beveragesState,
}))

vi.mock('../extra-portions/hooks', () => ({
  useExtraPortions: () => extraPortionsState,
}))

function makeSauce(overrides: Partial<Sauce> = {}): Sauce {
  return {
    id: 's-mayo',
    name: 'Mayonesa',
    active: true,
    sortOrder: 0,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  }
}

function makeBeverage(overrides: Partial<Beverage> = {}): Beverage {
  return {
    id: 'b-coca',
    name: 'Coca-Cola',
    price: 5,
    active: true,
    sortOrder: 0,
    includeFreeTo: null,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  }
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

function makeItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'item-1',
    name: 'Celtas Burger Clasica',
    description: 'Doble carne',
    price: 24.9,
    image: null,
    available: true,
    redeemableWithStars: false,
    specialReward: false,
    categoryId: 'cat-burgers',
    category: { id: 'cat-burgers', name: 'Burgers' } as Category,
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
  uploadMock.mockReset()
  saucesState.data = []
  saucesState.isLoading = false
  saucesState.isError = false
  beveragesState.data = []
  beveragesState.isLoading = false
  beveragesState.isError = false
  extraPortionsState.data = []
  extraPortionsState.isLoading = false
  extraPortionsState.isError = false
})

describe('ItemForm - checklist de salsas', () => {
  it('una salsa inactiva ya asignada se muestra "(oculta)", pre-marcada, y su id se conserva en el payload', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeItem())
    saucesState.data = [
      makeSauce({ id: 's-mayo', name: 'Mayonesa', active: true }),
      makeSauce({ id: 's-ketchup', name: 'Ketchup', active: true }),
      makeSauce({ id: 's-aji', name: 'Aji', active: false }),
    ]

    render(
      <ItemForm
        item={makeItem({
          sauces: [
            makeSauce({ id: 's-mayo', name: 'Mayonesa', active: true }),
            makeSauce({ id: 's-aji', name: 'Aji', active: false }),
          ],
        })}
        onClose={() => {}}
      />,
    )

    expect(screen.getByText(/Aji \(oculta\)/i)).toBeInTheDocument()
    expect(screen.queryByText(/Mayonesa \(oculta\)/i)).not.toBeInTheDocument()

    expect(screen.getByRole('checkbox', { name: /Mayonesa/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Aji \(oculta\)/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Ketchup/i })).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as { sauceIds: unknown }
    expect(Array.isArray(payload.sauceIds)).toBe(true)
    const sauceIds = payload.sauceIds as string[]
    expect(sauceIds.every((id) => typeof id === 'string')).toBe(true)
    expect([...sauceIds].sort()).toEqual(['s-aji', 's-mayo'])
  })

  it('catalogo de salsas vacio: muestra el mensaje que apunta a la pestana "Salsas" y no rinde checkboxes', () => {
    saucesState.data = []

    render(<ItemForm onClose={() => {}} />)

    expect(screen.getByText(/pesta.a "Salsas"/i)).toBeInTheDocument()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('marcar una salsa nueva la agrega al payload como string[]', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeItem())
    saucesState.data = [
      makeSauce({ id: 's-mayo', name: 'Mayonesa', active: true }),
      makeSauce({ id: 's-ketchup', name: 'Ketchup', active: true }),
    ]

    render(<ItemForm item={makeItem({ sauces: [] })} onClose={() => {}} />)

    expect(screen.getByRole('checkbox', { name: /Mayonesa/i })).not.toBeChecked()

    await user.click(screen.getByRole('checkbox', { name: /Mayonesa/i }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as { sauceIds: string[] }
    expect(payload.sauceIds).toEqual(['s-mayo'])
  })

  it('desmarcar la ultima salsa deja sauceIds como array vacio', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeItem())
    saucesState.data = [makeSauce({ id: 's-mayo', name: 'Mayonesa', active: true })]

    render(
      <ItemForm
        item={makeItem({
          sauces: [makeSauce({ id: 's-mayo', name: 'Mayonesa', active: true })],
        })}
        onClose={() => {}}
      />,
    )

    expect(screen.getByRole('checkbox', { name: /Mayonesa/i })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: /Mayonesa/i }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as { sauceIds: string[] }
    expect(payload.sauceIds).toEqual([])
  })

  it('error al cargar el catalogo de salsas: el producto se puede guardar igual', () => {
    saucesState.data = undefined
    saucesState.isError = true

    render(<ItemForm item={makeItem({ sauces: [] })} onClose={() => {}} />)

    expect(screen.getByText(/No se pudieron cargar las salsas/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
  })

  it('al editar un producto con sauceGroupRequired=true, el switch "Obligatorio" carga marcado y se conserva en el payload sin tocarlo', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeItem())
    saucesState.data = [makeSauce({ id: 's-mayo', name: 'Mayonesa' })]

    render(
      <ItemForm
        item={makeItem({
          sauces: [makeSauce({ id: 's-mayo', name: 'Mayonesa' })],
          sauceGroupRequired: true,
          sauceGroupMaxSelectable: 1,
        })}
        onClose={() => {}}
      />,
    )

    expect(
      screen.getByRole('switch', { name: 'El cliente debe elegir una salsa' }),
    ).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as { sauceGroupRequired: boolean }
    expect(payload.sauceGroupRequired).toBe(true)
  })

  it('al editar un producto con sauceGroupMaxSelectable=3, el input "Máximo a elegir" muestra 3', () => {
    saucesState.data = [makeSauce({ id: 's-mayo', name: 'Mayonesa' })]

    render(
      <ItemForm
        item={makeItem({
          sauces: [makeSauce({ id: 's-mayo', name: 'Mayonesa' })],
          sauceGroupRequired: false,
          sauceGroupMaxSelectable: 3,
        })}
        onClose={() => {}}
      />,
    )

    expect(screen.getByLabelText('Máximo a elegir')).toHaveValue(3)
  })

  it('cambiar "Máximo a elegir" y activar "Obligatorio" se refleja en el payload', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeItem())
    saucesState.data = [makeSauce({ id: 's-mayo', name: 'Mayonesa' })]

    render(
      <ItemForm
        item={makeItem({
          sauces: [makeSauce({ id: 's-mayo', name: 'Mayonesa' })],
          sauceGroupRequired: false,
          sauceGroupMaxSelectable: 1,
        })}
        onClose={() => {}}
      />,
    )

    await user.clear(screen.getByLabelText('Máximo a elegir'))
    await user.type(screen.getByLabelText('Máximo a elegir'), '2')
    await user.click(
      screen.getByLabelText('El cliente debe elegir una salsa'),
    )
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as {
      sauceGroupMaxSelectable: number
      sauceGroupRequired: boolean
    }
    expect(payload.sauceGroupMaxSelectable).toBe(2)
    expect(payload.sauceGroupRequired).toBe(true)
  })
})

/**
 * Paridad con el checklist de salsas, agregada por @tester: la sesión
 * principal actualizó los mocks de useBeverages/useExtraPortions en este
 * archivo para que ItemForm no crashee, pero no dejó ningún test ejercitando
 * el comportamiento de esas dos secciones nuevas (bebida/porción inactiva ya
 * asignada, catálogo vacío, payload como string[], grupo obligatorio/máximo).
 */
describe('ItemForm - checklist de bebidas', () => {
  it('una bebida inactiva ya asignada se muestra "(oculta)", pre-marcada, y su id se conserva en el payload', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeItem())
    beveragesState.data = [
      makeBeverage({ id: 'b-coca', name: 'Coca-Cola', active: true }),
      makeBeverage({ id: 'b-inca', name: 'Inca Kola', active: true }),
      makeBeverage({ id: 'b-fanta', name: 'Fanta', active: false }),
    ]

    render(
      <ItemForm
        item={makeItem({
          beverages: [
            makeBeverage({ id: 'b-coca', name: 'Coca-Cola', active: true }),
            makeBeverage({ id: 'b-fanta', name: 'Fanta', active: false }),
          ],
        })}
        onClose={() => {}}
      />,
    )

    expect(screen.getByText(/Fanta \(oculta\)/i)).toBeInTheDocument()
    expect(screen.queryByText(/Coca-Cola \(oculta\)/i)).not.toBeInTheDocument()

    expect(screen.getByRole('checkbox', { name: /Coca-Cola/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Fanta \(oculta\)/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Inca Kola/i })).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as { beverageIds: unknown }
    expect(Array.isArray(payload.beverageIds)).toBe(true)
    const beverageIds = payload.beverageIds as string[]
    expect(beverageIds.every((id) => typeof id === 'string')).toBe(true)
    expect([...beverageIds].sort()).toEqual(['b-coca', 'b-fanta'])
  })

  it('catalogo de bebidas vacio: muestra el mensaje que apunta a la pestana "Bebidas" y no rinde checkboxes ni config de grupo', () => {
    beveragesState.data = []

    render(<ItemForm onClose={() => {}} />)

    expect(screen.getByText(/pesta.a "Bebidas"/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Máximo a elegir')).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('El cliente debe elegir una bebida'),
    ).not.toBeInTheDocument()
  })

  it('marcar una bebida nueva la agrega al payload como string[]', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeItem())
    beveragesState.data = [
      makeBeverage({ id: 'b-coca', name: 'Coca-Cola' }),
      makeBeverage({ id: 'b-inca', name: 'Inca Kola' }),
    ]

    render(<ItemForm item={makeItem({ beverages: [] })} onClose={() => {}} />)

    expect(screen.getByRole('checkbox', { name: /Coca-Cola/i })).not.toBeChecked()

    await user.click(screen.getByRole('checkbox', { name: /Coca-Cola/i }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as { beverageIds: string[] }
    expect(payload.beverageIds).toEqual(['b-coca'])
  })

  it('desmarcar la ultima bebida deja beverageIds como array vacio', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeItem())
    beveragesState.data = [makeBeverage({ id: 'b-coca', name: 'Coca-Cola' })]

    render(
      <ItemForm
        item={makeItem({ beverages: [makeBeverage({ id: 'b-coca', name: 'Coca-Cola' })] })}
        onClose={() => {}}
      />,
    )

    expect(screen.getByRole('checkbox', { name: /Coca-Cola/i })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: /Coca-Cola/i }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as { beverageIds: string[] }
    expect(payload.beverageIds).toEqual([])
  })

  it('error al cargar el catalogo de bebidas: el producto se puede guardar igual', () => {
    beveragesState.data = undefined
    beveragesState.isError = true

    render(<ItemForm item={makeItem({ beverages: [] })} onClose={() => {}} />)

    expect(
      screen.getByText(/No se pudieron cargar las bebidas/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
  })

  it('cambiar "Máximo a elegir" y activar "Obligatorio" se refleja en el payload', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeItem())
    beveragesState.data = [makeBeverage({ id: 'b-coca', name: 'Coca-Cola' })]

    render(
      <ItemForm
        item={makeItem({
          beverages: [makeBeverage({ id: 'b-coca', name: 'Coca-Cola' })],
          beverageGroupRequired: false,
          beverageGroupMaxSelectable: 1,
        })}
        onClose={() => {}}
      />,
    )

    await user.clear(screen.getByLabelText('Máximo a elegir'))
    await user.type(screen.getByLabelText('Máximo a elegir'), '2')
    await user.click(
      screen.getByLabelText('El cliente debe elegir una bebida'),
    )
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as {
      beverageGroupMaxSelectable: number
      beverageGroupRequired: boolean
    }
    expect(payload.beverageGroupMaxSelectable).toBe(2)
    expect(payload.beverageGroupRequired).toBe(true)
  })

  it('al editar un producto con beverageGroupRequired=true, el switch "Obligatorio" carga marcado y se conserva en el payload sin tocarlo', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeItem())
    beveragesState.data = [makeBeverage({ id: 'b-coca', name: 'Coca-Cola' })]

    render(
      <ItemForm
        item={makeItem({
          beverages: [makeBeverage({ id: 'b-coca', name: 'Coca-Cola' })],
          beverageGroupRequired: true,
          beverageGroupMaxSelectable: 1,
        })}
        onClose={() => {}}
      />,
    )

    expect(
      screen.getByRole('switch', { name: 'El cliente debe elegir una bebida' }),
    ).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as { beverageGroupRequired: boolean }
    expect(payload.beverageGroupRequired).toBe(true)
  })
})

describe('ItemForm - checklist de porciones extras', () => {
  it('una porcion extra inactiva ya asignada se muestra "(oculta)", pre-marcada, y su id se conserva en el payload', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeItem())
    extraPortionsState.data = [
      makeExtraPortion({ id: 'ep-papas', name: 'Papas extra', active: true }),
      makeExtraPortion({ id: 'ep-tocino', name: 'Tocino extra', active: true }),
      makeExtraPortion({ id: 'ep-queso', name: 'Queso extra', active: false }),
    ]

    render(
      <ItemForm
        item={makeItem({
          extraPortions: [
            makeExtraPortion({ id: 'ep-papas', name: 'Papas extra', active: true }),
            makeExtraPortion({ id: 'ep-queso', name: 'Queso extra', active: false }),
          ],
        })}
        onClose={() => {}}
      />,
    )

    expect(screen.getByText(/Queso extra \(oculta\)/i)).toBeInTheDocument()
    expect(screen.queryByText(/Papas extra \(oculta\)/i)).not.toBeInTheDocument()

    expect(screen.getByRole('checkbox', { name: /Papas extra/i })).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: /Queso extra \(oculta\)/i }),
    ).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Tocino extra/i })).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as { extraPortionIds: unknown }
    expect(Array.isArray(payload.extraPortionIds)).toBe(true)
    const extraPortionIds = payload.extraPortionIds as string[]
    expect(extraPortionIds.every((id) => typeof id === 'string')).toBe(true)
    expect([...extraPortionIds].sort()).toEqual(['ep-papas', 'ep-queso'])
  })

  it('catalogo de porciones extras vacio: muestra el mensaje que apunta a la pestana "Porciones Extras" y no rinde checkboxes ni config de grupo', () => {
    extraPortionsState.data = []

    render(<ItemForm onClose={() => {}} />)

    expect(screen.getByText(/pesta.a "Porciones Extras"/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Máximo a elegir')).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('El cliente debe elegir una porción extra'),
    ).not.toBeInTheDocument()
  })

  it('marcar una porcion extra nueva la agrega al payload como string[]', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeItem())
    extraPortionsState.data = [
      makeExtraPortion({ id: 'ep-papas', name: 'Papas extra' }),
      makeExtraPortion({ id: 'ep-tocino', name: 'Tocino extra' }),
    ]

    render(<ItemForm item={makeItem({ extraPortions: [] })} onClose={() => {}} />)

    expect(screen.getByRole('checkbox', { name: /Papas extra/i })).not.toBeChecked()

    await user.click(screen.getByRole('checkbox', { name: /Papas extra/i }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as { extraPortionIds: string[] }
    expect(payload.extraPortionIds).toEqual(['ep-papas'])
  })

  it('desmarcar la ultima porcion extra deja extraPortionIds como array vacio', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeItem())
    extraPortionsState.data = [makeExtraPortion({ id: 'ep-papas', name: 'Papas extra' })]

    render(
      <ItemForm
        item={makeItem({
          extraPortions: [makeExtraPortion({ id: 'ep-papas', name: 'Papas extra' })],
        })}
        onClose={() => {}}
      />,
    )

    expect(screen.getByRole('checkbox', { name: /Papas extra/i })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: /Papas extra/i }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as { extraPortionIds: string[] }
    expect(payload.extraPortionIds).toEqual([])
  })

  it('error al cargar el catalogo de porciones extras: el producto se puede guardar igual', () => {
    extraPortionsState.data = undefined
    extraPortionsState.isError = true

    render(<ItemForm item={makeItem({ extraPortions: [] })} onClose={() => {}} />)

    expect(
      screen.getByText(/No se pudieron cargar las porciones extras/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
  })

  it('cambiar "Máximo a elegir" y activar "Obligatorio" se refleja en el payload', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeItem())
    extraPortionsState.data = [makeExtraPortion({ id: 'ep-papas', name: 'Papas extra' })]

    render(
      <ItemForm
        item={makeItem({
          extraPortions: [makeExtraPortion({ id: 'ep-papas', name: 'Papas extra' })],
          extraPortionsGroupRequired: false,
          extraPortionsGroupMaxSelectable: 1,
        })}
        onClose={() => {}}
      />,
    )

    await user.clear(screen.getByLabelText('Máximo a elegir'))
    await user.type(screen.getByLabelText('Máximo a elegir'), '3')
    await user.click(
      screen.getByLabelText('El cliente debe elegir una porción extra'),
    )
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as {
      extraPortionsGroupMaxSelectable: number
      extraPortionsGroupRequired: boolean
    }
    expect(payload.extraPortionsGroupMaxSelectable).toBe(3)
    expect(payload.extraPortionsGroupRequired).toBe(true)
  })

  it('al editar un producto con extraPortionsGroupRequired=true, el switch "Obligatorio" carga marcado y se conserva en el payload sin tocarlo', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeItem())
    extraPortionsState.data = [makeExtraPortion({ id: 'ep-papas', name: 'Papas extra' })]

    render(
      <ItemForm
        item={makeItem({
          extraPortions: [makeExtraPortion({ id: 'ep-papas', name: 'Papas extra' })],
          extraPortionsGroupRequired: true,
          extraPortionsGroupMaxSelectable: 1,
        })}
        onClose={() => {}}
      />,
    )

    expect(
      screen.getByRole('switch', { name: 'El cliente debe elegir una porción extra' }),
    ).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    const payload = updateMock.mock.calls[0][0] as { extraPortionsGroupRequired: boolean }
    expect(payload.extraPortionsGroupRequired).toBe(true)
  })
})
