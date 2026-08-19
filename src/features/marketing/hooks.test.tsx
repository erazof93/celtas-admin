import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  get: getMock,
  post: postMock,
  patch: vi.fn(),
  del: vi.fn(),
}))

import { useBroadcastHistory, useSendBroadcast } from './hooks'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return {
    queryClient,
    Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )
    },
  }
}

describe('useBroadcastHistory', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('pide GET /notifications/broadcast-history', async () => {
    getMock.mockResolvedValue([])
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useBroadcastHistory(), {
      wrapper: Wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getMock).toHaveBeenCalledWith('/notifications/broadcast-history')
  })
})

describe('useSendBroadcast', () => {
  beforeEach(() => {
    postMock.mockReset()
  })

  it('envía POST /notifications/broadcast con { title, body } exactos', async () => {
    postMock.mockResolvedValue({ sent: 2, total: 3 })
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSendBroadcast(), {
      wrapper: Wrapper,
    })

    const response = await result.current.mutateAsync({
      title: 'Título',
      body: 'Cuerpo',
    })

    expect(postMock).toHaveBeenCalledWith('/notifications/broadcast', {
      title: 'Título',
      body: 'Cuerpo',
    })
    expect(response).toEqual({ sent: 2, total: 3 })
  })

  it('invalida el historial de campañas al enviar con éxito', async () => {
    postMock.mockResolvedValue({ sent: 1, total: 1 })
    const { Wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useSendBroadcast(), {
      wrapper: Wrapper,
    })

    await result.current.mutateAsync({ title: 'Título', body: 'Cuerpo' })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['marketing', 'broadcast-history'],
      })
    })
  })
})
