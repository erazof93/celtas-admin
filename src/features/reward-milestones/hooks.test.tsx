import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * Regresión del bug de clase "id en el body de un PATCH" (ya mordió en
 * Banners, Menú y Promociones de estrellas): useUpdateRewardMilestone debe
 * mandar el `id` SOLO en el path de PATCH /reward-milestones/:id —
 * UpdateRewardMilestoneDto no lo declara y el ValidationPipe del backend
 * (whitelist + forbidNonWhitelisted) lo rechazaría con 400
 * "property id should not exist" si viajara en el body. También cubre
 * useDeleteRewardMilestone, real a diferencia de star-promotions.
 */

const { patchMock, delMock } = vi.hoisted(() => ({
  patchMock: vi.fn(),
  delMock: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  patch: patchMock,
  get: vi.fn(),
  post: vi.fn(),
  del: delMock,
}))

import { useDeleteRewardMilestone, useUpdateRewardMilestone } from './hooks'

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

describe('useUpdateRewardMilestone', () => {
  beforeEach(() => {
    patchMock.mockReset()
  })

  it('envía el id SOLO en el path, nunca en el body del PATCH', async () => {
    patchMock.mockResolvedValue({ id: 'milestone-1' })
    const { result } = renderHook(() => useUpdateRewardMilestone(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({
      id: 'milestone-1',
      starsRequired: 15,
      isSpecial: true,
    })

    expect(patchMock).toHaveBeenCalledTimes(1)
    const [url, body] = patchMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(url).toBe('/reward-milestones/milestone-1')
    expect(body).not.toHaveProperty('id')
    expect(body).toEqual({ starsRequired: 15, isSpecial: true })
  })

  it('un PATCH parcial no incluye el id en el body', async () => {
    patchMock.mockResolvedValue({ id: 'milestone-2' })
    const { result } = renderHook(() => useUpdateRewardMilestone(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({ id: 'milestone-2', isSpecial: false })

    const [, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(body).toEqual({ isSpecial: false })
    expect(Object.keys(body)).not.toContain('id')
  })
})

describe('useDeleteRewardMilestone', () => {
  beforeEach(() => {
    delMock.mockReset()
  })

  it('hace DELETE real a /reward-milestones/:id', async () => {
    delMock.mockResolvedValue(undefined)
    const { result } = renderHook(() => useDeleteRewardMilestone(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync('milestone-1')

    expect(delMock).toHaveBeenCalledTimes(1)
    expect(delMock).toHaveBeenCalledWith('/reward-milestones/milestone-1')
  })
})
