import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * Regresión del bug de clase "id en el payload de un PATCH" (ya corregido en
 * categorías/productos/banners/salsas/bebidas): useUpdateExtraPortion no debe
 * enviar el `id` dentro del body de PATCH /extra-portions/:id —
 * UpdateExtraPortionDto no lo declara y el ValidationPipe del backend
 * (whitelist + forbidNonWhitelisted) lo rechaza con 400 "property id should
 * not exist". El test debe fallar si se revierte el fix.
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
  useCreateExtraPortion,
  useDeleteExtraPortion,
  useExtraPortions,
  useUpdateExtraPortion,
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

describe('useExtraPortions', () => {
  beforeEach(() => {
    patchMock.mockReset()
    postMock.mockReset()
    delMock.mockReset()
    getMock.mockReset()
  })

  it('consulta GET /extra-portions', async () => {
    getMock.mockResolvedValue([{ id: 'ep-1', name: 'Papas extra', price: 8 }])
    const { result } = renderHook(() => useExtraPortions(), {
      wrapper: makeWrapper(),
    })
    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getMock).toHaveBeenCalledWith('/extra-portions')
  })
})

describe('useCreateExtraPortion', () => {
  beforeEach(() => postMock.mockReset())

  it('envía POST /extra-portions con el input completo', async () => {
    postMock.mockResolvedValue({ id: 'ep-1' })
    const { result } = renderHook(() => useCreateExtraPortion(), {
      wrapper: makeWrapper(),
    })
    await result.current.mutateAsync({ name: 'Tocino extra', price: 6 })
    expect(postMock).toHaveBeenCalledWith('/extra-portions', {
      name: 'Tocino extra',
      price: 6,
    })
  })
})

describe('useUpdateExtraPortion', () => {
  beforeEach(() => patchMock.mockReset())

  it('envía el id SOLO en el path, nunca en el body del PATCH', async () => {
    patchMock.mockResolvedValue({ id: 'ep-1' })
    const { result } = renderHook(() => useUpdateExtraPortion(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({
      id: 'ep-1',
      name: 'Papas extra',
      price: 8,
    })

    expect(patchMock).toHaveBeenCalledTimes(1)
    const [url, body] = patchMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(url).toBe('/extra-portions/ep-1')
    expect(body).not.toHaveProperty('id')
    expect(body).toEqual({ name: 'Papas extra', price: 8 })
  })

  it('el body conserva los campos editables aunque el id esté en el input', async () => {
    patchMock.mockResolvedValue({ id: 'ep-2' })
    const { result } = renderHook(() => useUpdateExtraPortion(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({
      id: 'ep-2',
      active: false,
      sortOrder: 3,
      price: 9.5,
    })

    const [, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(body).toEqual({ active: false, sortOrder: 3, price: 9.5 })
    expect(Object.keys(body)).not.toContain('id')
  })
})

describe('useDeleteExtraPortion', () => {
  beforeEach(() => delMock.mockReset())

  it('envía DELETE /extra-portions/:id', async () => {
    delMock.mockResolvedValue(undefined)
    const { result } = renderHook(() => useDeleteExtraPortion(), {
      wrapper: makeWrapper(),
    })
    await result.current.mutateAsync('ep-1')
    expect(delMock).toHaveBeenCalledWith('/extra-portions/ep-1')
  })
})
