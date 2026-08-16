import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * Regresión del bug de clase "id en el payload de un PATCH" (ya corregido en
 * categorías/productos/banners): useUpdateSauce no debe enviar el `id` dentro
 * del body de PATCH /sauces/:id — UpdateSauceDto no lo declara y el
 * ValidationPipe del backend (whitelist + forbidNonWhitelisted) lo rechaza con
 * 400 "property id should not exist". El test debe fallar si se revierte el fix.
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
  useCreateSauce,
  useDeleteSauce,
  useSauces,
  useUpdateSauce,
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

describe('useSauces', () => {
  beforeEach(() => {
    patchMock.mockReset()
    postMock.mockReset()
    delMock.mockReset()
    getMock.mockReset()
  })

  it('consulta GET /sauces', async () => {
    getMock.mockResolvedValue([{ id: 's-1', name: 'Mayonesa' }])
    const { result } = renderHook(() => useSauces(), { wrapper: makeWrapper() })
    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getMock).toHaveBeenCalledWith('/sauces')
  })
})

describe('useCreateSauce', () => {
  beforeEach(() => postMock.mockReset())

  it('envía POST /sauces con el input completo', async () => {
    postMock.mockResolvedValue({ id: 's-1' })
    const { result } = renderHook(() => useCreateSauce(), {
      wrapper: makeWrapper(),
    })
    await result.current.mutateAsync({ name: 'Mostaza' })
    expect(postMock).toHaveBeenCalledWith('/sauces', { name: 'Mostaza' })
  })
})

describe('useUpdateSauce', () => {
  beforeEach(() => patchMock.mockReset())

  it('envía el id SOLO en el path, nunca en el body del PATCH', async () => {
    patchMock.mockResolvedValue({ id: 's-1' })
    const { result } = renderHook(() => useUpdateSauce(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({ id: 's-1', name: 'Mayonesa' })

    expect(patchMock).toHaveBeenCalledTimes(1)
    const [url, body] = patchMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(url).toBe('/sauces/s-1')
    expect(body).not.toHaveProperty('id')
    expect(body).toEqual({ name: 'Mayonesa' })
  })

  it('el body conserva los campos editables aunque el id esté en el input', async () => {
    patchMock.mockResolvedValue({ id: 's-2' })
    const { result } = renderHook(() => useUpdateSauce(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({ id: 's-2', active: false, sortOrder: 3 })

    const [, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(body).toEqual({ active: false, sortOrder: 3 })
    expect(Object.keys(body)).not.toContain('id')
  })
})

describe('useDeleteSauce', () => {
  beforeEach(() => delMock.mockReset())

  it('envía DELETE /sauces/:id', async () => {
    delMock.mockResolvedValue(undefined)
    const { result } = renderHook(() => useDeleteSauce(), {
      wrapper: makeWrapper(),
    })
    await result.current.mutateAsync('s-1')
    expect(delMock).toHaveBeenCalledWith('/sauces/s-1')
  })
})
