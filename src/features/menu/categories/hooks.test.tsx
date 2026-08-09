import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * Regresión del bug de clase "id en el payload de un PATCH": useUpdateCategory
 * enviaba el `id` dentro del body de PATCH /menu/categories/:id y el
 * ValidationPipe del backend (whitelist + forbidNonWhitelisted) lo rechaza con
 * 400 "property id should not exist" (UpdateCategoryDto no declara id).
 * El test debe fallar si se revierte el fix (body = input completo).
 */

const { patchMock } = vi.hoisted(() => ({ patchMock: vi.fn() }))

vi.mock('@/lib/api-client', () => ({
  patch: patchMock,
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
}))

import { useUpdateCategory } from './hooks'

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

describe('useUpdateCategory', () => {
  beforeEach(() => {
    patchMock.mockReset()
  })

  it('envía el id SOLO en el path, nunca en el body del PATCH', async () => {
    patchMock.mockResolvedValue({ id: 'cat-1' })
    const { result } = renderHook(() => useUpdateCategory(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({ id: 'cat-1', name: 'Burgers' })

    expect(patchMock).toHaveBeenCalledTimes(1)
    const [url, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(url).toBe('/menu/categories/cat-1')
    expect(body).not.toHaveProperty('id')
    expect(body).toEqual({ name: 'Burgers' })
  })

  it('el body conserva los campos editables aunque el id esté en el input', async () => {
    patchMock.mockResolvedValue({ id: 'cat-2' })
    const { result } = renderHook(() => useUpdateCategory(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({ id: 'cat-2', active: false, sortOrder: 3 })

    const [, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(body).toEqual({ active: false, sortOrder: 3 })
    expect(Object.keys(body)).not.toContain('id')
  })
})