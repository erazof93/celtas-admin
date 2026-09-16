import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import UsersPage from './UsersPage'
import type { AdminUser } from './types'

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  get: getMock,
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

function buildUsers(count: number): AdminUser[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
    email: `cliente${i}@celtas.pe`,
    fullName: `Cliente ${i}`,
    provider: 'local' as const,
    googleId: null,
    phone: null,
    fcmToken: null,
    totalSpent: 0,
    role: 'cliente' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }))
}

function renderWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
  return render(<UsersPage />, { wrapper: Wrapper })
}

describe('UsersPage', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('pide GET /users con limit 15 y la tabla muestra las 15 filas', async () => {
    const users = buildUsers(15)
    getMock.mockResolvedValue({
      items: users,
      meta: { page: 1, limit: 15, total: 15, totalPages: 1 },
    })

    renderWithClient()

    await screen.findByText('Cliente 14')
    expect(getMock).toHaveBeenCalledWith('/users', {
      params: { page: 1, limit: 15 },
    })
    expect(screen.getAllByRole('row')).toHaveLength(16) // 15 usuarios + fila de encabezado
  })
})
