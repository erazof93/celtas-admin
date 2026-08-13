import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { TopUsersSection } from './TopUsersSection'

/**
 * El botón "Generar cupón" de cada fila de Top Usuarios debe abrir el
 * formulario de cupón INDIVIDUAL (no el de campaña) con el userId de esa
 * fila prellenado — el objetivo del ítem del ROADMAP es evitar copiar el
 * UUID a mano. Este test cubre que el userId correcto llega al formulario
 * (mockeando la mutación real de generación) y no el de otra fila.
 */

const { getMock, generateMutateAsyncMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  generateMutateAsyncMock: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  get: getMock,
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

vi.mock('@/features/coupons/hooks', () => ({
  useGenerateCoupon: () => ({ mutateAsync: generateMutateAsyncMock }),
}))

const USER_A = {
  // UUID con formato estrictamente válido (versión 4, variante 8-b) — el
  // schema de Zod del formulario de cupón valida .uuid() con esas reglas.
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'a@celtas.pe',
  fullName: 'Cliente Top A',
  provider: 'local' as const,
  googleId: null,
  phone: null,
  fcmToken: null,
  totalSpent: 500,
  role: 'cliente' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const USER_B = {
  ...USER_A,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'b@celtas.pe',
  fullName: 'Cliente Top B',
  totalSpent: 300,
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
  return render(<TopUsersSection />, { wrapper: Wrapper })
}

describe('TopUsersSection', () => {
  beforeEach(() => {
    getMock.mockReset()
    generateMutateAsyncMock.mockReset()
    getMock.mockResolvedValue({
      items: [USER_A, USER_B],
      meta: { page: 1, limit: 10, total: 2, totalPages: 1 },
    })
  })

  it('pide GET /users ordenado por totalSpent desc', async () => {
    renderWithClient()

    await screen.findByText('Cliente Top A')
    expect(getMock).toHaveBeenCalledWith('/users', {
      params: { page: 1, limit: 10, sortBy: 'totalSpent', order: 'desc' },
    })
  })

  it('abre el formulario de cupón individual con el userId de la fila correcta prellenado', async () => {
    const user = userEvent.setup()
    renderWithClient()

    await screen.findByText('Cliente Top B')
    await user.click(
      screen.getByRole('button', { name: `Generar cupón para ${USER_B.fullName}` }),
    )

    const userIdInput = await screen.findByLabelText(/Usuario/i)
    expect(userIdInput).toHaveValue(USER_B.id)

    // Confirma que el submit usa el userId prellenado, no el de otra fila.
    generateMutateAsyncMock.mockResolvedValue({
      id: 'c1',
      userId: USER_B.id,
      code: 'ABC12345',
      discountType: 'percentage',
      discountValue: 10,
      minPurchaseAmount: null,
      status: 'active',
      origin: 'manual',
      expiresAt: '2026-08-23T12:00:00.000Z',
      usedAt: null,
      usedInOrderId: null,
      createdAt: '2026-08-08T12:00:00.000Z',
    })
    await user.type(screen.getByLabelText(/^Valor$/i), '10')
    await user.click(screen.getByRole('button', { name: 'Generar cupón' }))

    expect(generateMutateAsyncMock).toHaveBeenCalledWith({
      userId: USER_B.id,
      discountType: 'percentage',
      discountValue: 10,
      minPurchaseAmount: null,
    })
  })
})
