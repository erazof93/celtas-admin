import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, patch } from '@/lib/api-client'
import type { Order, OrderStatus, PaginatedOrders } from './types'

const ORDERS_LIST_KEY = ['orders', 'list'] as const

export function useOrders(
  page: number,
  limit: number,
  status?: OrderStatus,
) {
  return useQuery({
    queryKey: ['orders', 'list', page, limit, status ?? 'all'],
    queryFn: () =>
      get<PaginatedOrders>('/orders', {
        params: { page, limit, ...(status ? { status } : {}) },
      }),
  })
}

/**
 * Cambio de estado de un pedido (solo admin). El backend valida la transición
 * (400 si no es válida) y al pasar a "entregado" suma el total al totalSpent
 * del cliente en la misma transacción — el frontend solo refresca los datos.
 */
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      patch<Order>(`/orders/${id}/status`, { status }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ORDERS_LIST_KEY }),
  })
}