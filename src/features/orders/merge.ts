import type { Order } from './types'

/**
 * Merge del pedido tras PATCH /orders/:id/status.
 *
 * El backend guarda el pedido SIN sus relaciones y devuelve la respuesta sin
 * la relación `items` (verificado en orders.service.ts `updateStatus`). Si
 * reemplazáramos el detalle abierto con esa respuesta, `order.items` quedaría
 * `undefined` y el diálogo crashearía al hacer `items.map(...)` — bug real
 * encontrado y corregido en el módulo 5.
 *
 * Esta función conserva los items del detalle abierto y solo aplica los campos
 * que cambian con el PATCH (status, deliveredAt, updatedAt).
 */
export function mergeOrderAfterUpdate(
  current: Order,
  updated: Partial<Order>,
): Order {
  return { ...current, ...updated, items: current.items }
}