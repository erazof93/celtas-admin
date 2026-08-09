import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * Regresión del bug de clase "id en el body de un PATCH": useUpdateItem enviaba
 * el `id` dentro del body de PATCH /menu/items/:id y el ValidationPipe del
 * backend (whitelist + forbidNonWhitelisted) lo rechaza con 400
 * "property id should not exist" (UpdateMenuItemDto no declara id).
 * El test FALLA si se revierte el fix (body = input completo).
 */

const { patchMock } = vi.hoisted(() => ({ patchMock: vi.fn() }))

vi.mock('@/lib/api-client', () => ({
  patch: patchMock,
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
}))

import { useUpdateItem } from './hooks'

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

describe('useUpdateItem', () => {
  beforeEach(() => {
    patchMock.mockReset()
  })

  it('envía el id SOLO en el path, nunca en el body del PATCH', async () => {
    patchMock.mockResolvedValue({ id: 'item-1' })
    const { result } = renderHook(() => useUpdateItem(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({
      id: 'item-1',
      name: 'Celtas Burger Clásica',
      price: 24.9,
      categoryId: 'cat-1',
    })

    expect(patchMock).toHaveBeenCalledTimes(1)
    const [url, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(url).toBe('/menu/items/item-1')
    expect(body).not.toHaveProperty('id')
    expect(body).toEqual({
      name: 'Celtas Burger Clásica',
      price: 24.9,
      categoryId: 'cat-1',
    })
  })

  it('el body conserva los campos editables aunque el id esté en el input', async () => {
    patchMock.mockResolvedValue({ id: 'item-2' })
    const { result } = renderHook(() => useUpdateItem(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({ id: 'item-2', available: false })

    const [, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(body).toEqual({ available: false })
    expect(Object.keys(body)).not.toContain('id')
  })
})