import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ItemForm } from './ItemForm'
import type { Category, MenuItem, Sauce } from '../types'

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
})
