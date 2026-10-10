import type { PaginatedOrders } from './types'

/** The API sorts newest first and caps pages at 100; collect before sorting oldest first. */
export async function readPendingOrders(
  read: (page: number) => Promise<PaginatedOrders>,
): Promise<PaginatedOrders> {
  const first = await read(1)
  const { total, totalPages } = first.meta
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Number.isSafeInteger(totalPages) ||
    totalPages < 0 ||
    totalPages > 100
  )
    throw new Error('No se puede recuperar la bandeja completa. Reintenta.')
  const items = [...first.items]
  for (let page = 2; page <= totalPages; page++) {
    const next = await read(page)
    if (
      next.meta.total !== total ||
      next.meta.totalPages !== totalPages ||
      next.meta.page !== page
    )
      throw new Error('Los pedidos cambiaron durante la consulta. Reintenta.')
    items.push(...next.items)
  }
  const unique = new Map(items.map((order) => [order.id, order]))
  if (
    unique.size !== total ||
    items.length !== total ||
    items.some(
      (order) =>
        order.status !== 'pendiente' ||
        !Number.isFinite(Date.parse(order.createdAt)),
    )
  )
    throw new Error('No se pudo obtener una bandeja consistente. Reintenta.')
  return {
    items: [...unique.values()].sort(
      (a, b) =>
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        a.id.localeCompare(b.id),
    ),
    meta: first.meta,
  }
}
