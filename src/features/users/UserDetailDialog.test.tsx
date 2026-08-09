import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserDetailDialog } from './UserDetailDialog'
import type { AdminUser } from './types'

/**
 * Regresión del bug de estado: `couponsPage` no se resetea al cambiar de
 * usuario. Si el admin navega a la página 2+ de cupones del usuario A, cierra
 * el modal y abre el usuario B (que tiene 1 sola página), el modal consulta
 * GET /coupons?userId=B&page=2 → el backend devuelve items vacíos y la UI
 * muestra "Este usuario no tiene cupones" aunque B SÍ tiene cupones (y el
 * Pagination no aparece porque totalPages <= 1, así que no hay forma de volver
 * a la página 1).
 *
 * El test FALLA si se revierte el fix (resetear couponsPage a 1 cuando cambia
 * user?.id) y pasa con el fix aplicado.
 */

const { useCouponsMock } = vi.hoisted(() => ({ useCouponsMock: vi.fn() }))

vi.mock('@/features/coupons/hooks', () => ({
  useCoupons: useCouponsMock,
}))

vi.mock('@/features/auth/store', () => ({
  useAuthStore: (selector: (s: { user: { id: string; role: string } }) => unknown) =>
    selector({ user: { id: 'admin-1', role: 'admin' } }),
}))

vi.mock('./hooks', () => ({
  useUpdateUserRole: () => ({ mutateAsync: vi.fn() }),
}))

function makeUser(id: string, fullName: string): AdminUser {
  return {
    id,
    email: `${id}@example.com`,
    fullName,
    provider: 'local',
    googleId: null,
    phone: null,
    fcmToken: null,
    totalSpent: 0,
    role: 'cliente',
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
  }
}

const userA = makeUser('user-a', 'Usuario A')
const userB = makeUser('user-b', 'Usuario B')

function makeCoupon(id: string) {
  return {
    id,
    userId: 'x',
    code: `CODE${id}`,
    discountType: 'percentage' as const,
    discountValue: 10,
    status: 'active' as const,
    origin: 'manual' as const,
    expiresAt: '2026-08-23T12:00:00.000Z',
    usedAt: null,
    usedInOrderId: null,
    createdAt: '2026-08-08T12:00:00.000Z',
  }
}

describe('UserDetailDialog — reset de paginación de cupones', () => {
  beforeEach(() => {
    useCouponsMock.mockReset()
    // userA tiene 2 páginas (3 cupones); userB tiene 1 página (1 cupón).
    useCouponsMock.mockImplementation(
      (page: number, limit: number, _status: unknown, userId: string) => {
        if (userId === 'user-a') {
          return {
            isLoading: false,
            isError: false,
            data: {
              items: page === 1 ? [makeCoupon('a1'), makeCoupon('a2')] : [makeCoupon('a3')],
              meta: { page, limit, total: 3, totalPages: 2 },
            },
            refetch: vi.fn(),
          }
        }
        return {
          isLoading: false,
          isError: false,
          data: {
            items: page === 1 ? [makeCoupon('b1')] : [],
            meta: { page, limit, total: 1, totalPages: 1 },
          },
          refetch: vi.fn(),
        }
      },
    )
  })

  it('al cambiar de usuario, la página de cupones vuelve a 1', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <UserDetailDialog user={userA} onOpenChange={() => {}} />,
    )

    // Abre con userA en la página 1.
    expect(useCouponsMock).toHaveBeenLastCalledWith(1, 5, undefined, 'user-a')

    // Navega a la página 2 de cupones de userA.
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(useCouponsMock).toHaveBeenLastCalledWith(2, 5, undefined, 'user-a')

    // Cambia al detalle de userB: la página debe resetear a 1.
    rerender(<UserDetailDialog user={userB} onOpenChange={() => {}} />)
    expect(useCouponsMock).toHaveBeenLastCalledWith(1, 5, undefined, 'user-b')
  })
})
