import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, patch } from '@/lib/api-client'
import type { Order, OrderStatus, PaginatedOrders } from './types'
import type { DeliveryEstimate, LatLng } from './delivery-estimate'

const ORDERS_LIST_KEY = ['orders', 'list'] as const

export function useOrders(
  page: number,
  limit: number,
  status?: OrderStatus,
  userId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: [
      'orders',
      'list',
      page,
      limit,
      status ?? 'all',
      userId ?? 'all',
    ],
    queryFn: () =>
      get<PaginatedOrders>('/orders', {
        params: {
          page,
          limit,
          ...(status ? { status } : {}),
          ...(userId ? { userId } : {}),
        },
      }),
    enabled,
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
    mutationFn: ({
      id,
      status,
      cancelReason,
    }: {
      id: string
      status: OrderStatus
      /**
       * Motivo de cancelación. El backend lo exige (400) solo cuando la
       * transición es `en_camino` → `cancelado`; en el resto es opcional y
       * se omite del body si no viene. `id` viaja solo en el path.
       */
      cancelReason?: string
    }) =>
      patch<Order>(`/orders/${id}/status`, {
        status,
        ...(cancelReason ? { cancelReason } : {}),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ORDERS_LIST_KEY }),
  })
}
/**
 * Geocodifica una dirección de texto libre → `[latitude, longitude]`
 * (GET /orders/geocode, Geoapify filtrado a Perú). Mutación y no query: se
 * dispara solo al pulsar "Buscar", y el backend limita a 10 req/min por usuario.
 */
export function useGeocodeAddress() {
  return useMutation({
    mutationFn: (address: string) =>
      get<[number, number]>('/orders/geocode', { params: { address } }),
  })
}

/**
 * Cotiza el delivery para un punto (GET /delivery/estimate). Se re-consulta
 * cada vez que el pin cambia; `null` = todavía no hay pin.
 */
export function useDeliveryEstimate(point: LatLng | null) {
  return useQuery({
    queryKey: ['delivery', 'estimate', point?.lat, point?.lng],
    queryFn: () => {
      if (!point) throw new Error('Sin punto para cotizar')
      return get<DeliveryEstimate>('/delivery/estimate', {
        params: { latitude: point.lat, longitude: point.lng },
      })
    },
    enabled: point !== null,
    // 400/404 son deterministas: reintentar no cambia el resultado.
    retry: false,
  })
}
