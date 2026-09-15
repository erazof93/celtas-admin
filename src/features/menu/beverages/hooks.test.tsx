import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * Regresión del bug de clase "id en el payload de un PATCH" (ya corregido en
 * categorías/productos/banners/salsas): useUpdateBeverage no debe enviar el
 * `id` dentro del body de PATCH /beverages/:id — UpdateBeverageDto no lo
 * declara y el ValidationPipe del backend (whitelist + forbidNonWhitelisted)
 * lo rechaza con 400 "property id should not exist". El test debe fallar si
 * se revierte el fix.
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
  useBeverages,
  useCreateBeverage,
  useDeleteBeverage,
  useUpdateBeverage,
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

describe('useBeverages', () => {
  beforeEach(() => {
    patchMock.mockReset()
    postMock.mockReset()
    delMock.mockReset()
    getMock.mockReset()
  })

  it('consulta GET /beverages', async () => {
    getMock.mockResolvedValue([{ id: 'b-1', name: 'Coca-Cola', price: 5 }])
    const { result } = renderHook(() => useBeverages(), {
      wrapper: makeWrapper(),
    })
    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getMock).toHaveBeenCalledWith('/beverages')
  })
})

describe('useCreateBeverage', () => {
  beforeEach(() => postMock.mockReset())

  it('envía POST /beverages con el input completo', async () => {
    postMock.mockResolvedValue({ id: 'b-1' })
    const { result } = renderHook(() => useCreateBeverage(), {
      wrapper: makeWrapper(),
    })
    await result.current.mutateAsync({ name: 'Inca Kola', price: 5.5 })
    expect(postMock).toHaveBeenCalledWith('/beverages', {
      name: 'Inca Kola',
      price: 5.5,
    })
  })
})

describe('useUpdateBeverage', () => {
  beforeEach(() => patchMock.mockReset())

  it('envía el id SOLO en el path, nunca en el body del PATCH', async () => {
    patchMock.mockResolvedValue({ id: 'b-1' })
    const { result } = renderHook(() => useUpdateBeverage(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({ id: 'b-1', name: 'Coca-Cola', price: 5 })

    expect(patchMock).toHaveBeenCalledTimes(1)
    const [url, body] = patchMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(url).toBe('/beverages/b-1')
    expect(body).not.toHaveProperty('id')
    expect(body).toEqual({ name: 'Coca-Cola', price: 5 })
  })

  it('el body conserva los campos editables aunque el id esté en el input', async () => {
    patchMock.mockResolvedValue({ id: 'b-2' })
    const { result } = renderHook(() => useUpdateBeverage(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({
      id: 'b-2',
      active: false,
      sortOrder: 3,
      price: 6.9,
    })

    const [, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(body).toEqual({ active: false, sortOrder: 3, price: 6.9 })
    expect(Object.keys(body)).not.toContain('id')
  })
})

describe('useDeleteBeverage', () => {
  beforeEach(() => delMock.mockReset())

  it('envía DELETE /beverages/:id', async () => {
    delMock.mockResolvedValue(undefined)
    const { result } = renderHook(() => useDeleteBeverage(), {
      wrapper: makeWrapper(),
    })
    await result.current.mutateAsync('b-1')
    expect(delMock).toHaveBeenCalledWith('/beverages/b-1')
  })
})
