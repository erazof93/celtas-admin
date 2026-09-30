import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FriesTypesSection } from './FriesTypesSection'
import type { FriesType } from '../types'

/**
 * Estados de UI de la pestaña "Tipos de Papas" (loading / error / vacío /
 * lista) y el toggle "Por defecto" en línea (auditoría @tester).
 */

const { updateMock, deleteMock, refetchMock } = vi.hoisted(() => ({
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  refetchMock: vi.fn(),
}))

const queryState: {
  data: FriesType[] | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
} = { data: [], isLoading: false, isError: false, refetch: refetchMock }

vi.mock('./hooks', () => ({
  useFriesTypes: () => queryState,
  useUpdateFriesType: () => ({ mutateAsync: updateMock, isPending: false }),
  useDeleteFriesType: () => ({ mutateAsync: deleteMock, isPending: false }),
  useCreateFriesType: () => ({ mutateAsync: vi.fn() }),
}))

// CopyIdButton depende del ToastProvider; no es objeto de esta prueba.
vi.mock('@/components/ui/CopyIdButton', () => ({
  CopyIdButton: () => null,
}))

function makeFriesType(overrides: Partial<FriesType> = {}): FriesType {
  return {
    id: 'ft-fritas',
    name: 'Papas fritas',
    isDefault: true,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  updateMock.mockReset()
  deleteMock.mockReset()
  refetchMock.mockReset()
  queryState.data = []
  queryState.isLoading = false
  queryState.isError = false
})

describe('FriesTypesSection - estados', () => {
  it('loading: muestra "Cargando tipos de papas…"', () => {
    queryState.data = undefined
    queryState.isLoading = true
    render(<FriesTypesSection />)
    expect(screen.getByText('Cargando tipos de papas…')).toBeInTheDocument()
  })

  it('error: muestra ErrorState y "Reintentar" llama a refetch', async () => {
    const user = userEvent.setup()
    queryState.data = undefined
    queryState.isError = true
    render(<FriesTypesSection />)
    expect(
      screen.getByText('No se pudo cargar los tipos de papas'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Reintentar/ }))
    expect(refetchMock).toHaveBeenCalledTimes(1)
  })

  it('vacío: mensaje de catálogo vacío, sin tabla', () => {
    queryState.data = []
    render(<FriesTypesSection />)
    expect(
      screen.getByText(/Todavía no hay tipos de papas en el catálogo/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('lista: renderiza cada tipo con su checkbox "por defecto"', () => {
    queryState.data = [
      makeFriesType(),
      makeFriesType({ id: 'ft-hilo', name: 'Papas al hilo', isDefault: false }),
    ]
    render(<FriesTypesSection />)
    expect(
      screen.getByRole('checkbox', { name: 'Papas fritas por defecto' }),
    ).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Papas al hilo por defecto' }),
    ).not.toBeChecked()
  })
})

describe('FriesTypesSection - toggle "Por defecto"', () => {
  it('marcar otro tipo manda SOLO { id, isDefault } al hook (el hook saca el id del body)', async () => {
    const user = userEvent.setup()
    updateMock.mockResolvedValue(makeFriesType())
    queryState.data = [
      makeFriesType(),
      makeFriesType({ id: 'ft-hilo', name: 'Papas al hilo', isDefault: false }),
    ]
    render(<FriesTypesSection />)

    await user.click(
      screen.getByRole('checkbox', { name: 'Papas al hilo por defecto' }),
    )

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    expect(updateMock).toHaveBeenCalledWith({ id: 'ft-hilo', isDefault: true })
  })

  it('si el PATCH falla muestra el error en un Alert', async () => {
    const user = userEvent.setup()
    updateMock.mockRejectedValue(new Error('boom'))
    queryState.data = [makeFriesType()]
    render(<FriesTypesSection />)

    await user.click(
      screen.getByRole('checkbox', { name: 'Papas fritas por defecto' }),
    )

    expect(await screen.findByText('No se pudo guardar')).toBeInTheDocument()
  })
})
