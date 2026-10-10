import { z } from 'zod'

const payload = z.object({ orderId: z.uuid(), status: z.literal('pendiente') })
export interface ForegroundOrder {
  orderId: string
  identity: string
  generation: string
}
const listeners = new Set<(order: ForegroundOrder) => void>()

/** The current backend's admin-new-order contract. Never render provider text. */
export function publishForegroundOrder(
  data: unknown,
  session: { identity: string; generation: string },
) {
  const parsed = payload.safeParse(data)
  if (!parsed.success) return
  const order = {
    orderId: parsed.data.orderId,
    identity: session.identity,
    generation: session.generation,
  }
  listeners.forEach((listener) => listener(order))
}

export function subscribeForegroundOrders(
  listener: (order: ForegroundOrder) => void,
) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
