import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * Regresión del bug de clase "id en el body de un PATCH" (ya mordió en
 * Banners y Menú): useUpdateStarPromotion debe mandar el `id` SOLO en el path
 * de PATCH /star-promotions/:id — UpdateStarPromotionDto no lo declara y el
 * ValidationPipe del backend (whitelist + forbidNonWhitelisted) lo rechazaría
 * con 400 "property id should not exist" si viajara en el body.
 */

const { patchMock } = vi.hoisted(() => ({ patchMock: vi.fn() }))

vi.mock('@/lib/api-client', () => ({
  patch: patchMock,
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
}))

import { useUpdateStarPromotion } from './hooks'

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

describe('useUpdateStarPromotion', () => {
  beforeEach(() => {
    patchMock.mockReset()
  })

  it('envía el id SOLO en el path, nunca en el body del PATCH', async () => {
    patchMock.mockResolvedValue({ id: 'promo-1' })
    const { result } = renderHook(() => useUpdateStarPromotion(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({
      id: 'promo-1',
      label: 'Navidad 2026',
      multiplier: 2,
      startDate: '2026-12-20',
      endDate: '2026-12-31',
    })

    expect(patchMock).toHaveBeenCalledTimes(1)
    const [url, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(url).toBe('/star-promotions/promo-1')
    expect(body).not.toHaveProperty('id')
    expect(body).toEqual({
      label: 'Navidad 2026',
      multiplier: 2,
      startDate: '2026-12-20',
      endDate: '2026-12-31',
    })
  })

  it('desactivar es un PATCH con { active: false }, sin id en el body', async () => {
    patchMock.mockResolvedValue({ id: 'promo-2' })
    const { result } = renderHook(() => useUpdateStarPromotion(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({ id: 'promo-2', active: false })

    const [, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(body).toEqual({ active: false })
    expect(Object.keys(body)).not.toContain('id')
  })
})
