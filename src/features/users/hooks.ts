import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, patch } from '@/lib/api-client'
import { useOrders } from '@/features/orders/hooks'
import type { PaginatedUsers, UpdateUserRoleInput, UserAddress } from './types'

const USERS_KEY = ['users'] as const

/** GET /users (admin): listado paginado, sin búsqueda server-side. */
export function useUsers(page: number, limit: number) {
  return useQuery({
    queryKey: ['users', 'list', page, limit],
    queryFn: () =>
      get<PaginatedUsers>('/users', {
        params: { page, limit },
      }),
  })
}

/**
 * GET /users/:id/addresses (admin): direcciones del usuario, principal
 * primero. El `id` viaja SOLO en el path (regla de la skill). Array plano,
 * no paginado. 404 si el usuario no existe; [] si no tiene direcciones.
 */
export function useUserAddresses(userId: string | undefined) {
  return useQuery({
    queryKey: ['users', 'addresses', userId ?? 'none'],
    queryFn: () => get<UserAddress[]>(`/users/${userId}/addresses`),
    enabled: Boolean(userId),
  })
}

/**
 * GET /orders?userId=X (admin): pedidos de un usuario, paginado. Reutiliza
 * useOrders del módulo de pedidos (misma query key → la invalidación de
 * useUpdateOrderStatus refresca también esta vista). El `userId` es un query
 * param legítimo del backend (QueryOrdersDto), no va en el body.
 */
export function useUserOrders(
  page: number,
  limit: number,
  userId: string | undefined,
) {
  return useOrders(page, limit, undefined, userId, Boolean(userId))
}

/**
 * Cambio de rol de un usuario (PATCH /users/:id/role).
 * Regla de la skill: el `id` viaja SOLO en el path, NUNCA en el body —
 * UpdateUserRoleDto solo declara `role` y el ValidationPipe del backend usa
 * forbidNonWhitelisted (400 si el id se cuela en el body).
 */
export function useUpdateUserRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateUserRoleInput) => {
      const { id, ...body } = input
      return patch<{ id: string; role: string }>(`/users/${id}/role`, body)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  })
}