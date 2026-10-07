import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { del, get, patch, post } from '@/lib/api-client'
import type {
  CreateDeliveryZoneInput,
  DeliveryZone,
  UpdateDeliveryZoneInput,
} from './types'

export const deliveryZoneKeys = {
  all: ['delivery', 'zones'] as const,
  list: ['delivery', 'zones', 'list'] as const,
  detail: (id: string | null) => ['delivery', 'zones', 'detail', id] as const,
}

export function useDeliveryZones() {
  return useQuery({
    queryKey: deliveryZoneKeys.list,
    queryFn: () => get<DeliveryZone[]>('/delivery/zones'),
  })
}

export function useDeliveryZone(id: string | null) {
  return useQuery({
    queryKey: deliveryZoneKeys.detail(id),
    queryFn: () => get<DeliveryZone>(`/delivery/zones/${id}`),
    enabled: id !== null,
  })
}

function useZoneCache() {
  const client = useQueryClient()
  return async (zone?: DeliveryZone, deletedId?: string) => {
    if (zone) client.setQueryData(deliveryZoneKeys.detail(zone.id), zone)
    if (deletedId)
      client.removeQueries({
        queryKey: deliveryZoneKeys.detail(deletedId),
        exact: true,
      })
    await Promise.all([
      client.invalidateQueries({ queryKey: deliveryZoneKeys.all }),
      client.invalidateQueries({ queryKey: ['delivery', 'estimate'] }),
    ])
  }
}

export function useCreateDeliveryZone() {
  const refresh = useZoneCache()
  return useMutation({
    mutationFn: (body: CreateDeliveryZoneInput) =>
      post<DeliveryZone>('/delivery/zones', body),
    onSuccess: (zone) => refresh(zone),
  })
}

export function useUpdateDeliveryZone() {
  const refresh = useZoneCache()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateDeliveryZoneInput) =>
      patch<DeliveryZone>(`/delivery/zones/${id}`, body),
    onSuccess: (zone) => refresh(zone),
  })
}

export function useDeleteDeliveryZone() {
  const refresh = useZoneCache()
  return useMutation({
    mutationFn: async (id: string) => {
      await del<unknown>(`/delivery/zones/${id}`)
    },
    onSuccess: (_data, id) => refresh(undefined, id),
  })
}
