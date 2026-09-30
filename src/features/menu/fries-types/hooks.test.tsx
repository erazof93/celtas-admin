import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * Regresión del bug de clase "id en el payload de un PATCH": useUpdateFriesType
 * no debe enviar el `id` dentro del body de PATCH /fries-types/:id —
 * UpdateFriesTypeDto no lo declara y el ValidationPipe del backend (whitelist +
 * forbidNonWhitelisted) lo rechaza con 400. El test debe fallar si se revierte.
 */

const { patchMock, postMock, delMock, getMock } = vi.hoisted(() => ({
  patchMock: vi.fn(),
  postMock: vi.fn(),
  delMock: vi.fn(),
  getMock: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  patch: patchMock,
  get: getMock,
  post: postMock,
  del: delMock,
}))

import {
  useCreateFriesType,
  useDeleteFriesType,
  useFriesTypes,
  useUpdateFriesType,
} from './hooks'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

beforeEach(() => {
  patchMock.mockReset()
  postMock.mockReset()
  delMock.mockReset()
  getMock.mockReset()
})

describe('useFriesTypes', () => {
  it('consulta GET /fries-types', async () => {
    getMock.mockResolvedValue([{ id: 'ft-1', name: 'Papas fritas' }])
    const { result } = renderHook(() => useFriesTypes(), {
      wrapper: makeWrapper(),
    })
    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getMock).toHaveBeenCalledWith('/fries-types')
  })
})

describe('useCreateFriesType', () => {
  it('envía POST /fries-types con name + isDefault', async () => {
    postMock.mockResolvedValue({ id: 'ft-1' })
    const { result } = renderHook(() => useCreateFriesType(), {
      wrapper: makeWrapper(),
    })
    await result.current.mutateAsync({ name: 'Papas al hilo', isDefault: true })
    expect(postMock).toHaveBeenCalledWith('/fries-types', {
      name: 'Papas al hilo',
      isDefault: true,
    })
  })
})

describe('useUpdateFriesType', () => {
  it('envía el id SOLO en el path, nunca en el body del PATCH', async () => {
    patchMock.mockResolvedValue({ id: 'ft-1' })
    const { result } = renderHook(() => useUpdateFriesType(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({
      id: 'ft-1',
      name: 'Papas nativas',
      isDefault: false,
    })

    expect(patchMock).toHaveBeenCalledTimes(1)
    const [url, body] = patchMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(url).toBe('/fries-types/ft-1')
    expect(body).not.toHaveProperty('id')
    expect(body).toEqual({ name: 'Papas nativas', isDefault: false })
  })
})

describe('useDeleteFriesType', () => {
  it('envía DELETE /fries-types/:id', async () => {
    delMock.mockResolvedValue(undefined)
    const { result } = renderHook(() => useDeleteFriesType(), {
      wrapper: makeWrapper(),
    })
    await result.current.mutateAsync('ft-1')
    expect(delMock).toHaveBeenCalledWith('/fries-types/ft-1')
  })
})
