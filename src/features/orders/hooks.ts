import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, patch, post } from '@/lib/api-client'
import { geoapifyApiKey, geoapifyAutocomplete } from '@/lib/geoapify'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import type {
  Order,
  OrderStatus,
  PaginatedOrders,
  WhatsappLinks,
  WhatsappSentResult,
} from './types'
import type { DeliveryEstimate, LatLng } from './delivery-estimate'
import type { CreateOrderAdminInput } from './manual-order'
import type { DeliveryMode } from '../delivery-zones/types'

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
export function useDeliveryEstimate(point: LatLng | null, mode?: DeliveryMode | null) {
  return useQuery({
    queryKey: ['delivery', 'estimate', point?.lat, point?.lng, mode],
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

/**
 * GET /orders/:id (admin ve cualquiera): pedido con `items` y `user` cargados
 * (findOne usa relations { items, user }). Se usa para abrir el detalle de un
 * pedido recién creado desde /orders?order=<id>.
 */
export function useOrder(id: string | null) {
  return useQuery({
    queryKey: ['orders', 'detail', id],
    queryFn: () => get<Order>(`/orders/${id}`),
    enabled: Boolean(id),
  })
}

/**
 * POST /orders/admin (solo admin): pedido manual (teléfono/WhatsApp). El
 * backend calcula precios, delivery y total; devuelve el pedido creado con
 * `whatsappUrl` al celular del cliente.
 */
export function useCreateAdminOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateOrderAdminInput) =>
      post<Order>('/orders/admin', input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ORDERS_LIST_KEY }),
  })
}

/** Mínimo de caracteres antes de pedir sugerencias (spec: más de 3). */
export const AUTOCOMPLETE_MIN_LENGTH = 4
/** Mismo debounce que la app (address_location_picker.dart). */
export const AUTOCOMPLETE_DEBOUNCE_MS = 400

/**
 * Sugerencias de Geoapify para el texto escrito (con debounce). Nunca entra en
 * error: `geoapifyAutocomplete` devuelve [] ante cualquier fallo. Sin key
 * configurada no consulta nada.
 */
export function useGeoapifyAutocomplete(text: string, enabled = true) {
  const trimmed = text.trim()
  const debounced = useDebouncedValue(trimmed, AUTOCOMPLETE_DEBOUNCE_MS)
  const query = useQuery({
    queryKey: ['geoapify', 'autocomplete', debounced],
    queryFn: ({ signal }) => geoapifyAutocomplete(debounced, signal),
    enabled:
      enabled && geoapifyApiKey() !== null && debounced.length >= AUTOCOMPLETE_MIN_LENGTH,
    staleTime: 5 * 60_000,
    retry: false,
  })
  // Durante el debounce no se muestran sugerencias de un texto anterior.
  return enabled && debounced === trimmed ? (query.data ?? []) : []
}

const whatsappLinksKey = (orderId: string) => ['orders', 'whatsapp-links', orderId] as const

/**
 * GET /orders/admin/:orderId/whatsapp-links (solo admin). El backend responde
 * 409 si el pedido está cancelado — el caller no debe habilitarlo en ese caso.
 * Sin reintentos: 404/409 son deterministas.
 */
export function useOrderWhatsappLinks(orderId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: whatsappLinksKey(orderId ?? 'none'),
    queryFn: () => get<WhatsappLinks>(`/orders/admin/${orderId}/whatsapp-links`),
    enabled: enabled && Boolean(orderId),
    retry: false,
  })
}

/**
 * POST /orders/admin/:orderId/whatsapp-sent (sin body). Actualiza los links en
 * caché con la fecha que devuelve el backend (la primera, si ya estaba) y
 * refresca la lista de pedidos, que también trae `whatsappSentAt`.
 */
export function useMarkWhatsappSent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderId: string) =>
      post<WhatsappSentResult>(`/orders/admin/${orderId}/whatsapp-sent`),
    onSuccess: (result) => {
      queryClient.setQueryData<WhatsappLinks>(whatsappLinksKey(result.orderId), (prev) =>
        prev ? { ...prev, whatsappSentAt: result.whatsappSentAt } : prev,
      )
      queryClient.invalidateQueries({ queryKey: ORDERS_LIST_KEY })
    },
  })
}
