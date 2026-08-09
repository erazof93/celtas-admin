import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, patch } from '@/lib/api-client'
import type { PaginatedUsers, UpdateUserRoleInput } from './types'

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