import { expect, it, vi } from 'vitest'
import { readPendingOrders } from './pending-orders'
import type { Order, PaginatedOrders } from './types'
const order = (id: string, createdAt: string) =>
  ({ id, status: 'pendiente', createdAt }) as Order
const page = (
  items: Order[],
  page: number,
  total: number,
  totalPages: number,
): PaginatedOrders => ({ items, meta: { page, limit: 100, total, totalPages } })
it('returns an empty complete tray', async () => {
  expect(
    (await readPendingOrders(async () => page([], 1, 0, 0))).items,
  ).toEqual([])
})
it('collects all pages and prioritizes the oldest, independent of the general list', async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(
      page([order('new', '2026-10-09T10:00:00Z')], 1, 2, 2),
    )
    .mockResolvedValueOnce(
      page([order('old', '2026-10-01T10:00:00Z')], 2, 2, 2),
    )
  expect((await readPendingOrders(read)).items.map((item) => item.id)).toEqual([
    'old',
    'new',
  ])
  expect(read.mock.calls).toEqual([[1], [2]])
})
it('rejects changing totals instead of publishing a partial set', async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(page([order('a', '2026-10-09T10:00:00Z')], 1, 2, 2))
    .mockResolvedValueOnce(page([], 2, 1, 1))
  await expect(readPendingOrders(read)).rejects.toThrow('cambiaron')
})
it('rejects duplicated or missing rows and nonpending statuses', async () => {
  const duplicate = order('a', '2026-10-09T10:00:00Z')
  await expect(
    readPendingOrders(async () => page([duplicate, duplicate], 1, 2, 1)),
  ).rejects.toThrow('consistente')
  await expect(
    readPendingOrders(async () =>
      page([{ ...duplicate, status: 'confirmado' }], 1, 1, 1),
    ),
  ).rejects.toThrow('consistente')
})
it('propagates HTTP failures without exposing partial data', async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(page([order('a', '2026-10-09T10:00:00Z')], 1, 2, 2))
    .mockRejectedValueOnce(new Error('503'))
  await expect(readPendingOrders(read)).rejects.toThrow('503')
})
