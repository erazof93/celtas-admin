import { z } from 'zod'
import type { SseFrame } from '@/lib/sse-client'

/** Manual SSE v1 contract verified against backend orders/events sources. */
export const orderEventCursorSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,18})$/)
  .refine(
    (value) =>
      /^(0|[1-9]\d{0,18})$/.test(value) &&
      BigInt(value) <= 9223372036854775807n,
  )

const orderPayload = z.object({
  v: z.literal(1),
  eventId: z.uuid(),
  orderId: z.uuid(),
  status: z.enum([
    'pendiente',
    'confirmado',
    'en_camino',
    'entregado',
    'cancelado',
  ]),
  occurredAt: z.iso.datetime(),
})

const readyPayload = z
  .object({
    v: z.literal(1),
    headCursor: orderEventCursorSchema,
    floorCursor: orderEventCursorSchema,
    recovery: z.literal('rest'),
  })
  .refine(
    (value) =>
      orderEventCursorSchema.safeParse(value.floorCursor).success &&
      orderEventCursorSchema.safeParse(value.headCursor).success &&
      BigInt(value.floorCursor) <= BigInt(value.headCursor),
  )

const resetPayload = z.object({
  v: z.literal(1),
  reason: z.enum([
    'transport_unavailable',
    'replay_overflow',
    'cursor_unavailable',
    'authorization_unavailable',
    'server_shutdown',
  ]),
})
const expiringPayload = z.object({
  v: z.literal(1),
  reason: z.enum(['reconnect_required', 'token_expired']),
})
const revokedPayload = z.object({
  v: z.literal(1),
  reason: z.literal('role_changed'),
})

export type OrderEventType =
  'order.created' | 'order.status_changed' | 'order.updated'
export type OrderEventPayload = z.infer<typeof orderPayload>
export type OrderStreamEvent =
  | { type: OrderEventType; cursor: string; payload: OrderEventPayload }
  | { type: 'stream.ready'; payload: z.infer<typeof readyPayload> }
  | { type: 'stream.reset'; payload: z.infer<typeof resetPayload> }
  | { type: 'auth.expiring'; payload: z.infer<typeof expiringPayload> }
  | { type: 'access.revoked'; payload: z.infer<typeof revokedPayload> }

export type OrderStreamDecodeResult =
  | { ok: true; event: OrderStreamEvent }
  | {
      ok: false
      code:
        'unknown_event' | 'invalid_json' | 'invalid_payload' | 'invalid_cursor'
    }

/** No raw payloads/Zod errors escape this boundary. Extra fields are stripped. */
export function decodeOrderStreamFrame(
  frame: SseFrame,
): OrderStreamDecodeResult {
  const type = frame.event
  if (
    ![
      'order.created',
      'order.status_changed',
      'order.updated',
      'stream.ready',
      'stream.reset',
      'auth.expiring',
      'access.revoked',
    ].includes(type)
  )
    return { ok: false, code: 'unknown_event' }
  let value: unknown
  try {
    value = JSON.parse(frame.data)
  } catch {
    return { ok: false, code: 'invalid_json' }
  }
  if (
    type === 'order.created' ||
    type === 'order.status_changed' ||
    type === 'order.updated'
  ) {
    const cursor = orderEventCursorSchema.safeParse(frame.id)
    if (!cursor.success) return { ok: false, code: 'invalid_cursor' }
    const payload = orderPayload.safeParse(value)
    return payload.success
      ? {
          ok: true,
          event: { type, cursor: cursor.data, payload: payload.data },
        }
      : { ok: false, code: 'invalid_payload' }
  }
  switch (type) {
    case 'stream.ready': {
      const payload = readyPayload.safeParse(value)
      return payload.success
        ? { ok: true, event: { type, payload: payload.data } }
        : { ok: false, code: 'invalid_payload' }
    }
    case 'stream.reset': {
      const payload = resetPayload.safeParse(value)
      return payload.success
        ? { ok: true, event: { type, payload: payload.data } }
        : { ok: false, code: 'invalid_payload' }
    }
    case 'auth.expiring': {
      const payload = expiringPayload.safeParse(value)
      return payload.success
        ? { ok: true, event: { type, payload: payload.data } }
        : { ok: false, code: 'invalid_payload' }
    }
    default: {
      const payload = revokedPayload.safeParse(value)
      return payload.success
        ? { ok: true, event: { type: 'access.revoked', payload: payload.data } }
        : { ok: false, code: 'invalid_payload' }
    }
  }
}
