import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  deliveryZoneKeys,
  useCreateDeliveryZone,
  useDeleteDeliveryZone,
  useDeliveryZone,
  useDeliveryZones,
  useUpdateDeliveryZone,
} from './hooks'
import type { DeliveryZone } from './types'

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))
vi.mock('@/lib/api-client', () => api)
const zone: DeliveryZone = {
  id: 'zone-1',
  name: 'Centro',
  fee: 3,
  active: true,
  createdAt: '',
  updatedAt: '',
  polygon: {
    type: 'Polygon',
    coordinates: [
      [
        [-77, -12],
        [-76, -12],
        [-76, -11],
        [-77, -12],
      ],
    ],
  },
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue(zone)
  api.post.mockResolvedValue(zone)
  api.patch.mockResolvedValue(zone)
  api.del.mockResolvedValue({ success: true })
})
describe('hooks de zonas con cliente compartido', () => {
  it('lista y detalle usan rutas y keys separadas; sin id no consulta', async () => {
    const { wrapper } = setup()
    api.get.mockResolvedValueOnce([zone])
    const list = renderHook(useDeliveryZones, { wrapper })
    await waitFor(() => expect(list.result.current.data).toEqual([zone]))
    const detail = renderHook(() => useDeliveryZone(zone.id), { wrapper })
    await waitFor(() => expect(detail.result.current.data).toEqual(zone))
    renderHook(() => useDeliveryZone(null), { wrapper })
    expect(api.get.mock.calls).toEqual([
      ['/delivery/zones'],
      ['/delivery/zones/zone-1'],
    ])
  })
  it('POST/PATCH sin id en body invalidan catálogo y estimaciones, sin optimismo', async () => {
    const { wrapper, client } = setup()
    client.setQueryData(deliveryZoneKeys.list, [zone])
    client.setQueryData(['delivery', 'estimate', -12, -77], { deliveryFee: 3 })
    const create = renderHook(useCreateDeliveryZone, { wrapper })
    const id = zone.id
    const body = {
      name: zone.name,
      fee: zone.fee,
      active: zone.active,
      polygon: zone.polygon,
    }
    await act(async () => {
      await create.result.current.mutateAsync(body)
    })
    expect(api.post).toHaveBeenCalledWith('/delivery/zones', body)
    const update = renderHook(useUpdateDeliveryZone, { wrapper })
    await act(async () => {
      await update.result.current.mutateAsync({ id, fee: 4, active: false })
    })
    expect(api.patch).toHaveBeenCalledWith('/delivery/zones/zone-1', {
      fee: 4,
      active: false,
    })
    expect(client.getQueryState(deliveryZoneKeys.list)?.isInvalidated).toBe(
      true,
    )
    expect(
      client.getQueryState(['delivery', 'estimate', -12, -77])?.isInvalidated,
    ).toBe(true)
    expect(client.getQueryData(deliveryZoneKeys.list)).toEqual([zone])
  })
  it('DELETE no depende de respuesta y retira detalle', async () => {
    const { wrapper, client } = setup()
    client.setQueryData(deliveryZoneKeys.detail(zone.id), zone)
    const remove = renderHook(useDeleteDeliveryZone, { wrapper })
    await act(async () => {
      expect(await remove.result.current.mutateAsync(zone.id)).toBeUndefined()
    })
    expect(api.del).toHaveBeenCalledWith('/delivery/zones/zone-1')
    expect(
      client.getQueryData(deliveryZoneKeys.detail(zone.id)),
    ).toBeUndefined()
  })
})
