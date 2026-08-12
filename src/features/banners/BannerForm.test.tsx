import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BannerForm } from './BannerForm'
import type { Banner } from './types'

/**
 * Regresión de la mejora "selector real de categorías/productos" del módulo
 * Banners: actionValue para actionType 'category'/'menuItem' era un input de
 * texto libre (el admin escribía el slug/id a mano y podía equivocarse). Ahora
 * es un <Select> poblado con GET /menu/categories y GET /menu/items que guarda
 * el id real. Estos tests verifcan que el payload enviado usa el id, no texto
 * libre, y que al cambiar actionType se limpia el actionValue viejo.
 */

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))
const { updateMock } = vi.hoisted(() => ({ updateMock: vi.fn() }))
const { uploadMock } = vi.hoisted(() => ({ uploadMock: vi.fn() }))

vi.mock('./hooks', () => ({
  useCreateBanner: () => ({ mutateAsync: createMock }),
  useUpdateBanner: () => ({ mutateAsync: updateMock }),
  useUploadBannerImage: () => ({ mutateAsync: uploadMock }),
}))

vi.mock('../menu/categories/hooks', () => ({
  useCategories: () => ({
    data: [
      { id: 'cat-burgers', name: 'Burgers', active: true },
      { id: 'cat-chicken', name: 'Chicken', active: true },
    ],
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('../menu/items/hooks', () => ({
  useMenuItems: () => ({
    data: [
      { id: 'item-1', name: 'Celtas Burger Clásica' },
      { id: 'item-2', name: 'Alitas BBQ' },
    ],
    isLoading: false,
    isError: false,
  }),
}))

function makeBannerResponse(overrides: Partial<Banner> = {}): Banner {
  return {
    id: 'banner-1',
    title: '2x1 en burgers',
    imageUrl: null,
    actionType: 'none',
    actionValue: null,
    startDate: null,
    endDate: null,
    active: true,
    order: 0,
    daysOfWeek: null,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('BannerForm actionValue', () => {
  beforeEach(() => {
    createMock.mockReset()
    updateMock.mockReset()
    uploadMock.mockReset()
  })

  it('muestra un <Select> real de categorías (no texto libre) y guarda el id', async () => {
    const user = userEvent.setup()
    createMock.mockResolvedValue(makeBannerResponse())

    render(<BannerForm onClose={() => {}} />)

    await user.type(screen.getByLabelText(/Título/i), '2x1 en burgers')
    await user.click(screen.getByRole('combobox', { name: /Acción al tocar/i }))
    await user.click(await screen.findByRole('option', { name: /Categoría/i }))

    // Es un Select real: el input de texto libre ya no existe.
    expect(
      screen.queryByPlaceholderText(/Slug de la categoría/i),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('combobox', { name: /Valor de la acción/i }),
    )
    await user.click(await screen.findByRole('option', { name: /Chicken/i }))
    await user.click(screen.getByRole('button', { name: 'Crear banner' }))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'category',
          actionValue: 'cat-chicken', // el id real, no el nombre ni texto libre
        }),
      )
    })
  })

  it('muestra un <Select> real de productos y guarda el id', async () => {
    const user = userEvent.setup()
    createMock.mockResolvedValue(makeBannerResponse())

    render(<BannerForm onClose={() => {}} />)

    await user.type(screen.getByLabelText(/Título/i), 'Oferta alitas')
    await user.click(screen.getByRole('combobox', { name: /Acción al tocar/i }))
    await user.click(await screen.findByRole('option', { name: /Producto/i }))

    expect(
      screen.queryByPlaceholderText(/ID del producto/i),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('combobox', { name: /Valor de la acción/i }),
    )
    await user.click(await screen.findByRole('option', { name: /Alitas BBQ/i }))
    await user.click(screen.getByRole('button', { name: 'Crear banner' }))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'menuItem',
          actionValue: 'item-2',
        }),
      )
    })
  })

  it('sigue aceptando URL externa como input de texto', async () => {
    const user = userEvent.setup()
    createMock.mockResolvedValue(makeBannerResponse())

    render(<BannerForm onClose={() => {}} />)

    await user.type(screen.getByLabelText(/Título/i), 'Promo web')
    await user.click(screen.getByRole('combobox', { name: /Acción al tocar/i }))
    await user.click(
      await screen.findByRole('option', { name: /URL externa/i }),
    )

    const urlInput = screen.getByLabelText(/Valor de la acción/i)
    expect(urlInput.tagName).toBe('INPUT')
    await user.type(urlInput, 'https://celtas.pe/oferta')
    await user.click(screen.getByRole('button', { name: 'Crear banner' }))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'external_url',
          actionValue: 'https://celtas.pe/oferta',
        }),
      )
    })
  })

  it('conserva un actionValue legacy (sin coincidencia) al editar sin tocar el Select', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(
      makeBannerResponse({
        actionType: 'category',
        actionValue: 'slug-viejo',
      }),
    )

    render(
      <BannerForm
        banner={makeBannerResponse({
          actionType: 'category',
          actionValue: 'slug-viejo', // escrito a mano antes del selector
        })}
        onClose={() => {}}
      />,
    )

    // El valor viejo aparece como opción "(sin coincidencia)" en el Select.
    const actionSelect = screen.getByRole('combobox', {
      name: /Valor de la acción/i,
    })
    await user.click(actionSelect)
    expect(
      await screen.findByRole('option', { name: /slug-viejo/i }),
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')

    // Guardar sin tocar el Select conserva el valor viejo (no se pierde).
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'category',
          actionValue: 'slug-viejo',
        }),
      )
    })
  })

  it('limpia el actionValue viejo al cambiar de tipo de acción', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(
      makeBannerResponse({
        actionType: 'menuItem',
        actionValue: 'item-1',
      }),
    )

    render(
      <BannerForm
        banner={makeBannerResponse({
          actionType: 'category',
          actionValue: 'cat-burgers',
        })}
        onClose={() => {}}
      />,
    )

    await user.click(screen.getByRole('combobox', { name: /Acción al tocar/i }))
    await user.click(await screen.findByRole('option', { name: /Producto/i }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    // Al cambiar a 'menuItem' sin elegir un producto, el superRefine exige
    // actionValue, así que el submit NO debe enviar el id de categoría viejo.
    await waitFor(() => {
      expect(updateMock).not.toHaveBeenCalled()
    })
    expect(
      await screen.findByText(
        'actionValue es obligatorio cuando actionType no es none',
      ),
    ).toBeInTheDocument()
  })
})
