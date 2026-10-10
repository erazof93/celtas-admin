import { z } from 'zod'
import { scopeKey, type OrderEventsScope } from './cursor-state'
import {
  decodeOrderStreamFrame,
  orderEventCursorSchema,
  type OrderStreamEvent,
} from './types'
import type { OrderEventsState } from './service'

const stateSchema = z
  .object({
    status: z.enum([
      'disabled',
      'idle',
      'connecting',
      'connected',
      'retrying',
      'degraded',
      'offline',
      'stopped',
    ]),
    error: z
      .enum([
        'http',
        'protocol',
        'network',
        'disconnected',
        'authorization',
        'reset',
      ])
      .optional(),
    httpStatus: z.number().int().min(100).max(599).optional(),
    retryAt: z.number().int().nonnegative().safe().optional(),
    retryAttempt: z.number().int().min(0).max(9).optional(),
    retryFloor: z.number().int().min(5000).max(60_000).optional(),
  })
  .strict()
const leaseSchema = z
  .object({
    v: z.literal(1),
    generation: z.string().min(1).max(128),
    sender: z.uuid(),
    term: z.uuid(),
    expiresAt: z.number().int().nonnegative().safe(),
    state: stateSchema.optional(),
  })
  .strict()
const envelopeSchema = z
  .object({
    v: z.literal(1),
    api: z.string().max(2048),
    identity: z.string().min(1).max(128),
    generation: z.string().min(1).max(128),
    sender: z.uuid(),
    term: z.uuid(),
    sequence: z.number().int().positive().safe(),
    sentAt: z.number().int().nonnegative().safe(),
    signal: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('position'),
          cursor: orderEventCursorSchema.nullable(),
        })
        .strict(),
      z.object({ kind: z.literal('state'), state: stateSchema }).strict(),
      z
        .object({
          kind: z.literal('event'),
          event: z
            .object({
              type: z.string().max(64),
              cursor: z.string().max(19).optional(),
              payload: z.unknown(),
            })
            .strict(),
        })
        .strict(),
    ]),
  })
  .strict()
export type OrderEventsSignal =
  | { kind: 'position'; cursor: string | null }
  | { kind: 'state'; state: OrderEventsState }
  | { kind: 'event'; event: OrderStreamEvent }
const LEASE_MS = 30_000

/** Web Locks is the authority. Lease expiry fences messages; it never grants a lock. */
export function createOrderEventsCoordinator(
  scope: OrderEventsScope,
  callbacks: {
    current: () => boolean
    onLeader: (previous?: OrderEventsState) => void
    onFollower: () => void
    onLost: () => void
    onSignal: (signal: OrderEventsSignal) => void
    onUnavailable: () => void
  },
) {
  const name = `celtas-order-events:leader:v1:${scopeKey(scope)}`
  const key = `celtas-order-events:lease:v1:${scopeKey(scope)}`
  const sender = crypto.randomUUID()
  let channel: BroadcastChannel | undefined
  let closed = false
  let started = false
  let retired = false
  let leader = false
  let request: AbortController | undefined
  let release: (() => void) | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let tenure: ReturnType<typeof setTimeout> | undefined
  let election: ReturnType<typeof setTimeout> | undefined
  let lease: z.infer<typeof leaseSchema> | undefined
  let sequence = 0
  let receivedTerm: string | undefined
  let receivedSequence = 0

  function readLease() {
    try {
      const raw = localStorage.getItem(key)
      if (!raw || raw.length > 2048) return undefined
      const parsed = leaseSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : undefined
    } catch {
      return undefined
    }
  }
  function owns() {
    const stored = readLease()
    return (
      !closed &&
      callbacks.current() &&
      leader &&
      stored?.term === lease?.term &&
      stored?.generation === scope.generation &&
      stored.expiresAt > Date.now()
    )
  }
  function writeLease() {
    if (!lease) return
    localStorage.setItem(key, JSON.stringify(lease))
  }
  function yieldLeadership() {
    if (!leader) return
    leader = false
    callbacks.onLost() // Abort transport before releasing the actual lock.
    clearInterval(heartbeat)
    clearTimeout(tenure)
    // Keep the last bounded lease for queued signals / retry metadata. The next
    // real lock holder overwrites its term; expiry never permits takeover.
    release?.()
    release = undefined
  }
  function fail() {
    close()
    callbacks.onUnavailable()
  }
  function validEvent(value: {
    type: string
    cursor?: string
    payload?: unknown
  }) {
    const decoded = decodeOrderStreamFrame({
      event: value.type,
      id: value.cursor,
      data: JSON.stringify(value.payload),
    })
    return decoded.ok ? decoded.event : undefined
  }
  function receive(value: unknown) {
    if (closed || !callbacks.current()) return
    try {
      const serialized = JSON.stringify(value)
      if (serialized.length > 16_384) return
      const parsed = envelopeSchema.safeParse(value)
      if (!parsed.success) return
      const message = parsed.data
      if (
        message.sender === sender ||
        message.api !== scope.api ||
        message.identity !== scope.identity ||
        message.generation !== scope.generation ||
        message.sentAt > Date.now() + 1000 ||
        Date.now() - message.sentAt > LEASE_MS
      )
        return
      const owner = readLease()
      if (
        !owner ||
        owner.expiresAt <= Date.now() ||
        owner.generation !== scope.generation ||
        owner.sender !== message.sender ||
        owner.term !== message.term
      )
        return
      if (message.term === receivedTerm && message.sequence <= receivedSequence)
        return
      const signal: OrderEventsSignal | undefined =
        message.signal.kind === 'position'
          ? message.signal
          : message.signal.kind === 'state'
            ? { kind: 'state', state: message.signal.state }
            : (() => {
                const event = validEvent(message.signal.event)
                return event ? { kind: 'event' as const, event } : undefined
              })()
      if (!signal) return
      receivedTerm = message.term
      receivedSequence = message.sequence
      callbacks.onSignal(signal)
    } catch {
      /* BroadcastChannel is untrusted input, not a security boundary. */
    }
  }
  function send(signal: OrderEventsSignal) {
    if (!owns()) {
      yieldLeadership()
      return
    }
    try {
      // Revalidate/projection prevents transmitting arbitrary properties from callers.
      const safeSignal: OrderEventsSignal | undefined =
        signal.kind === 'position'
          ? orderEventCursorSchema.nullable().safeParse(signal.cursor).success
            ? { kind: 'position', cursor: signal.cursor }
            : undefined
          : signal.kind === 'state'
            ? (() => {
                const parsed = stateSchema.safeParse(signal.state)
                return parsed.success
                  ? { kind: 'state' as const, state: parsed.data }
                  : undefined
              })()
            : (() => {
                const event = validEvent({
                  type: signal.event.type,
                  cursor:
                    'cursor' in signal.event ? signal.event.cursor : undefined,
                  payload: signal.event.payload,
                })
                return event ? { kind: 'event' as const, event } : undefined
              })()
      if (!safeSignal) return
      if (safeSignal.kind === 'state' && lease) {
        lease.state = safeSignal.state
        writeLease()
      }
      channel?.postMessage({
        v: 1,
        ...scope,
        sender,
        term: lease!.term,
        sequence: ++sequence,
        sentAt: Date.now(),
        signal: safeSignal,
      })
    } catch {
      fail()
    }
  }
  function acquire() {
    if (closed || retired || !callbacks.current()) return
    callbacks.onFollower()
    request = new AbortController()
    const signal = request.signal
    void Promise.resolve()
      .then(() =>
        navigator.locks.request(
          name,
          { mode: 'exclusive', signal },
          async () => {
            if (closed || retired || !callbacks.current()) return
            const previous = readLease()
            lease = {
              v: 1,
              generation: scope.generation,
              sender,
              term: crypto.randomUUID(),
              expiresAt: Date.now() + LEASE_MS,
              ...(previous?.generation === scope.generation && previous.state
                ? { state: previous.state }
                : {}),
            }
            try {
              writeLease()
            } catch {
              fail()
              return
            }
            leader = true
            sequence = 0
            // The callback's promise represents ownership, never the transport promise.
            const held = new Promise<void>((resolve) => {
              release = resolve
            })
            heartbeat = setInterval(() => {
              if (!owns()) {
                yieldLeadership()
                return
              }
              lease!.expiresAt = Date.now() + LEASE_MS
              try {
                writeLease()
              } catch {
                fail()
              }
            }, 5000)
            tenure = setTimeout(yieldLeadership, 300_000) // Voluntary rotation, no steal.
            callbacks.onLeader(lease.state)
            await held
          },
        ),
      )
      .then(() => {
        if (!closed && !retired && callbacks.current()) {
          callbacks.onFollower()
          election = setTimeout(acquire, 5000) // Rejoin behind queued followers.
        }
      })
      .catch(() => {
        if (!closed && !retired && callbacks.current()) fail()
      })
  }
  function close() {
    if (closed) return
    closed = true
    request?.abort()
    clearTimeout(election)
    yieldLeadership()
    channel?.close()
    channel = undefined
  }
  return {
    start() {
      if (closed || started) return
      started = true
      if (
        typeof navigator.locks?.request !== 'function' ||
        typeof BroadcastChannel !== 'function'
      ) {
        fail()
        return
      }
      try {
        channel = new BroadcastChannel(name)
        channel.onmessage = (event) => receive(event.data)
        channel.onmessageerror = fail
        acquire()
      } catch {
        fail()
      }
    },
    send,
    close,
    retire() {
      retired = true
      request?.abort()
      clearTimeout(election)
      yieldLeadership()
      // Keep receiving terminal controls already queued on BroadcastChannel.
    },
    isLeader: owns,
  }
}
