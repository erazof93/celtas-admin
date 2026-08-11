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
 *
 * También cubre el edge case de la vista 360: al cambiar de usuario, las
 * queries de direcciones y pedidos se disparan con el userId del usuario
 * NUEVO (no del anterior) — el contenido se remonta con key={user.id}.
 */

const { useCouponsMock, useUserAddressesMock, useUserOrdersMock } = vi.hoisted(
  () => ({
    useCouponsMock: vi.fn(),
    useUserAddressesMock: vi.fn(),
    useUserOrdersMock: vi.fn(),
  }),
)

vi.mock('@/features/coupons/hooks', () => ({
  useCoupons: useCouponsMock,
}))

vi.mock('@/features/auth/store', () => ({
  useAuthStore: (selector: (s: { user: { id: string; role: string } }) => unknown) =>
    selector({ user: { id: 'admin-1', role: 'admin' } }),
}))

vi.mock('./hooks', () => ({
  useUpdateUserRole: () => ({ mutateAsync: vi.fn() }),
  useUserAddresses: useUserAddressesMock,
  useUserOrders: useUserOrdersMock,
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
    minPurchaseAmount: null,
    status: 'active' as const,
    origin: 'manual' as const,
    expiresAt: '2026-08-23T12:00:00.000Z',
    usedAt: null,
    usedInOrderId: null,
    createdAt: '2026-08-08T12:00:00.000Z',
  }
}

function makeOrder(id: string) {
  return {
    id,
    userId: 'x',
    status: 'entregado' as const,
    addressSnapshot: '{}',
    total: 42.5,
    whatsappUrl: 'https://wa.me/51999999999',
    deliveredAt: '2026-08-08T12:00:00.000Z',
    items: [],
    createdAt: '2026-08-08T12:00:00.000Z',
    updatedAt: '2026-08-08T12:00:00.000Z',
  }
}

describe('UserDetailDialog — reset de paginación de cupones', () => {
  beforeEach(() => {
    useCouponsMock.mockReset()
    useUserAddressesMock.mockReset()
    useUserOrdersMock.mockReset()

    // userA tiene 2 páginas (3 cupones); userB tiene 1 página (1 cupón).
    useCouponsMock.mockImplementation(
      (page: number, limit: number, _status: unknown, userId: string) => {
        if (userId === 'user-a') {
          return {
            isLoading: false,
            isError: false,
            data: {
              items:
                page === 1 ? [makeCoupon('a1'), makeCoupon('a2')] : [makeCoupon('a3')],
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

    useUserAddressesMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
      refetch: vi.fn(),
    })
    // userA tiene 2 páginas de pedidos; userB tiene 1 página.
    useUserOrdersMock.mockImplementation(
      (page: number, limit: number, userId: string) => {
        if (userId === 'user-a') {
          return {
            isLoading: false,
            isError: false,
            data: {
              items: [makeOrder(`a-${page}`)],
              meta: { page, limit, total: 6, totalPages: 2 },
            },
            refetch: vi.fn(),
          }
        }
        return {
          isLoading: false,
          isError: false,
          data: {
            items: [makeOrder('b-1')],
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

    // Navega a la página 2 de cupones de userA (el tab Cupones debe estar activo).
    await user.click(screen.getByRole('tab', { name: 'Cupones' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(useCouponsMock).toHaveBeenLastCalledWith(2, 5, undefined, 'user-a')

    // Cambia al detalle de userB: la página debe resetear a 1.
    rerender(<UserDetailDialog user={userB} onOpenChange={() => {}} />)
    expect(useCouponsMock).toHaveBeenLastCalledWith(1, 5, undefined, 'user-b')
  })

  it('al cambiar de usuario, direcciones y pedidos se consultan con el userId correcto', () => {
    const { rerender } = render(
      <UserDetailDialog user={userA} onOpenChange={() => {}} />,
    )

    // Con userA: ambas queries usan el id de userA.
    expect(useUserAddressesMock).toHaveBeenLastCalledWith('user-a')
    expect(useUserOrdersMock).toHaveBeenLastCalledWith(1, 5, 'user-a')

    // Cambia al detalle de userB: las queries deben apuntar a userB, no a userA.
    rerender(<UserDetailDialog user={userB} onOpenChange={() => {}} />)
    expect(useUserAddressesMock).toHaveBeenLastCalledWith('user-b')
    expect(useUserOrdersMock).toHaveBeenLastCalledWith(1, 5, 'user-b')
  })

  it('al cambiar de usuario, la página de pedidos vuelve a 1', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <UserDetailDialog user={userA} onOpenChange={() => {}} />,
    )

    // userA tiene 2 páginas de pedidos; navega a la página 2.
    await user.click(screen.getByRole('tab', { name: 'Pedidos' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(useUserOrdersMock).toHaveBeenLastCalledWith(2, 5, 'user-a')

    // Cambia al detalle de userB: la página de pedidos debe resetear a 1.
    rerender(<UserDetailDialog user={userB} onOpenChange={() => {}} />)
    expect(useUserOrdersMock).toHaveBeenLastCalledWith(1, 5, 'user-b')
  })
})