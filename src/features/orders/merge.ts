import type { Order } from './types'

/**
 * Merge del pedido tras PATCH /orders/:id/status.
 *
 * El backend guarda el pedido SIN sus relaciones (`manager.findOne(Order, {
 * where, lock })` sin `relations`) y devuelve la respuesta sin `items` NI
 * `user` (verificado en orders.service.ts `updateStatus`). Si
 * reemplazáramos el detalle abierto con esa respuesta, `order.items` quedaría
 * `undefined` y el diálogo crashearía al hacer `items.map(...)` — bug real
 * encontrado y corregido en el módulo 5. `user` tiene el mismo problema
 * (mapa/badge/botón de WhatsApp del cliente en el detalle lo necesitan).
 *
 * Esta función conserva `items`/`user` del detalle abierto y solo aplica los
 * campos que cambian con el PATCH (status, deliveredAt, updatedAt).
 */
export function mergeOrderAfterUpdate(
  current: Order,
  updated: Partial<Order>,
): Order {
  return { ...current, ...updated, items: current.items, user: current.user }
}