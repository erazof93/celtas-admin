import { z } from 'zod'
import { orderEventCursorSchema, type OrderStreamEvent } from './types'

export interface OrderEventsScope {
  api: string
  identity: string
  generation: string
}
export const scopeKey = (scope: OrderEventsScope) =>
  JSON.stringify([scope.api, scope.identity])
const MAX_RECENT = 256
const recordSchema = z
  .object({
    v: z.literal(2),
    generation: z.string().min(1).max(128),
    observed: orderEventCursorSchema.nullable(),
    processed: orderEventCursorSchema.nullable(),
    durable: orderEventCursorSchema.nullable(),
    requiresRecovery: z.boolean(),
    recent: z
      .array(
        z
          .object({ cursor: orderEventCursorSchema, eventId: z.uuid() })
          .strict(),
      )
      .max(MAX_RECENT),
  })
  .strict()
  .refine(
    (value) =>
      value.durable === null ||
      (value.processed !== null &&
        BigInt(value.processed) >= BigInt(value.durable)),
  )

/** Only metadata is persisted. Acknowledgement is owned by REST reconciliation. */
export function createCursorState(scope: OrderEventsScope) {
  const key = `celtas-order-events:cursors:v2:${scopeKey(scope)}`
  let state: z.infer<typeof recordSchema> = empty()
  function empty(): z.infer<typeof recordSchema> {
    return {
      v: 2,
      generation: scope.generation,
      observed: null,
      processed: null,
      durable: null,
      requiresRecovery: false,
      recent: [],
    }
  }
  try {
    const raw = localStorage.getItem(key)
    const saved =
      raw && raw.length <= 32_768
        ? recordSchema.safeParse(JSON.parse(raw))
        : null
    if (saved?.success) {
      if (saved.data.generation === scope.generation) state = saved.data
      // A stale tab must never delete valid metadata belonging to a newer login.
    } else if (raw) localStorage.removeItem(key)
  } catch {
    /* Unavailable storage never enables durable advancement. */
  }
  function persist() {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      /* Bounded in-memory fallback. */
    }
  }
  return {
    invalidatePosition(write: boolean) {
      state.processed = null
      state.durable = null
      state.requiresRecovery = true
      if (write) persist()
    },
    acknowledge(cursor: string, write: boolean) {
      if (!orderEventCursorSchema.safeParse(cursor).success) return
      if (state.processed === null || BigInt(cursor) > BigInt(state.processed))
        state.processed = cursor
      if (!write) return // Followers acknowledge locally; only the lock holder persists.
      try {
        const raw = localStorage.getItem(key)
        const saved =
          raw && raw.length <= 32_768
            ? recordSchema.safeParse(JSON.parse(raw))
            : null
        if (
          saved?.success &&
          saved.data.generation === scope.generation &&
          saved.data.durable &&
          BigInt(saved.data.durable) > BigInt(cursor)
        )
          return
        state.durable = cursor
        state.requiresRecovery = false
        persist()
      } catch {
        /* No durable storage acknowledgement on failure. */
      }
    },
    getSnapshot: () => ({
      ...state,
      recent: state.recent.map((entry) => ({ ...entry })),
    }),
    observe(
      event: OrderStreamEvent,
      write = false,
    ): 'accepted' | 'duplicate' | 'out_of_order' | 'invalid' {
      if (!('cursor' in event)) return 'accepted'
      const cursor = event.cursor
      if (!orderEventCursorSchema.safeParse(cursor).success) return 'invalid'
      const previous = state.observed
      if (previous === null || BigInt(cursor) > BigInt(previous))
        state.observed = cursor
      const match = state.recent.find(
        (entry) =>
          entry.cursor === cursor || entry.eventId === event.payload.eventId,
      )
      if (match) {
        if (
          match.cursor !== cursor ||
          match.eventId !== event.payload.eventId
        ) {
          state.requiresRecovery = true
        }
        if (write) persist()
        return 'duplicate'
      }
      if (previous !== null && BigInt(cursor) <= BigInt(previous)) {
        state.requiresRecovery = true
        if (write) persist()
        return 'out_of_order'
      }
      state.recent.push({ cursor, eventId: event.payload.eventId })
      if (state.recent.length > MAX_RECENT) state.recent.shift()
      if (write) persist()
      return 'accepted'
    },
    clear(write = true) {
      state = empty()
      if (!write) return
      try {
        // A late old-session cleanup cannot delete the new generation's metadata.
        const raw = localStorage.getItem(key)
        if (
          raw &&
          raw.length <= 32_768 &&
          JSON.parse(raw).generation === scope.generation
        )
          localStorage.removeItem(key)
      } catch {
        /* No credentials or input in errors/logs. */
      }
    },
  }
}
