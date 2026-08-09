import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * Regresión del bug de clase "id en el body de un PATCH": useUpdateBanner
 * enviaba el `id` dentro del body de PATCH /banners/:id y el ValidationPipe del
 * backend (whitelist + forbidNonWhitelisted) lo rechaza con 400
 * "property id should not exist" (UpdateBannerDto no declara id).
 * El test FALLA si se revierte el fix (body = input completo).
 */

const { patchMock } = vi.hoisted(() => ({ patchMock: vi.fn() }))

vi.mock('@/lib/api-client', () => ({
  patch: patchMock,
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
}))

import { useUpdateBanner } from './hooks'

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

describe('useUpdateBanner', () => {
  beforeEach(() => {
    patchMock.mockReset()
  })

  it('envía el id SOLO en el path, nunca en el body del PATCH', async () => {
    patchMock.mockResolvedValue({ id: 'banner-1' })
    const { result } = renderHook(() => useUpdateBanner(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({
      id: 'banner-1',
      title: '2x1 en burgers',
      active: true,
    })

    expect(patchMock).toHaveBeenCalledTimes(1)
    const [url, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(url).toBe('/banners/banner-1')
    expect(body).not.toHaveProperty('id')
    expect(body).toEqual({ title: '2x1 en burgers', active: true })
  })

  it('el body conserva los campos editables aunque el id esté en el input', async () => {
    patchMock.mockResolvedValue({ id: 'banner-2' })
    const { result } = renderHook(() => useUpdateBanner(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({ id: 'banner-2', endDate: '2026-08-31T23:59:59.000Z' })

    const [, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(body).toEqual({ endDate: '2026-08-31T23:59:59.000Z' })
    expect(Object.keys(body)).not.toContain('id')
  })
})