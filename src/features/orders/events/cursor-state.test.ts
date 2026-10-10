import { beforeEach, describe, expect, it } from 'vitest'
import {
  createCursorState,
  scopeKey,
  type OrderEventsScope,
} from './cursor-state'
import type { OrderStreamEvent } from './types'

const scope: OrderEventsScope = {
  api: 'http://localhost:3000/admin/orders/events',
  identity: 'admin',
  generation: 'generation-a',
}
export const orderEvent = (
  cursor: string,
  suffix = cursor.slice(-8),
): OrderStreamEvent => ({
  type: 'order.created',
  cursor,
  payload: {
    v: 1,
    eventId: `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`,
    orderId: '10000000-0000-4000-8000-000000000000',
    status: 'pendiente',
    occurredAt: '2026-10-08T12:00:00.000Z',
  },
})
beforeEach(() => localStorage.clear())
describe('SSE cursor metadata', () => {
  it('keeps leader persistence monotonic and follower acknowledgements local', () => {
    const leader = createCursorState(scope),
      follower = createCursorState(scope)
    leader.acknowledge('12', true)
    follower.acknowledge('10', false)
    expect(createCursorState(scope).getSnapshot().durable).toBe('12')
    follower.acknowledge('9', true)
    expect(createCursorState(scope).getSnapshot().durable).toBe('12')
  })

  it('rejects durable records without a valid processing acknowledgement', () => {
    const cursors = createCursorState(scope)
    cursors.acknowledge('12', true)
    const key = `celtas-order-events:cursors:v2:${scopeKey(scope)}`
    const saved = JSON.parse(localStorage.getItem(key)!)
    saved.processed = '9'
    localStorage.setItem(key, JSON.stringify(saved))
    expect(createCursorState(scope).getSnapshot().durable).toBeNull()
  })
  it('rejects noncanonical cursor input without altering observed metadata', () => {
    const cursors = createCursorState(scope)
    expect(cursors.observe(orderEvent('01'), true)).toBe('invalid')
    expect(cursors.getSnapshot().observed).toBeNull()
  })

  it('orders 9–12 and large cursors with BigInt while durable/processed remain null', () => {
    const cursors = createCursorState(scope)
    for (const cursor of [
      '9',
      '10',
      '11',
      '12',
      '9007199254740993',
      '9223372036854775807',
    ])
      expect(cursors.observe(orderEvent(cursor), true)).toBe('accepted')
    const saved = createCursorState(scope).getSnapshot()
    expect(saved.observed).toBe('9223372036854775807')
    expect(saved.processed).toBeNull()
    expect(saved.durable).toBeNull()
    expect(JSON.stringify(saved)).not.toContain('orderId')
  })
  it('deduplicates cursor/eventId and marks out-of-order/conflicting events for later recovery', () => {
    const cursors = createCursorState(scope)
    const first = orderEvent('10')
    expect(cursors.observe(first)).toBe('accepted')
    expect(cursors.observe(first)).toBe('duplicate')
    expect(cursors.observe(orderEvent('9'))).toBe('out_of_order')
    expect(cursors.observe(orderEvent('11', '10'))).toBe('duplicate')
    expect(cursors.getSnapshot()).toMatchObject({
      observed: '11',
      requiresRecovery: true,
      processed: null,
      durable: null,
    })
  })
  it('bounds persisted dedup history to 256 entries and still rejects old cursors after eviction', () => {
    const cursors = createCursorState(scope)
    for (let i = 1; i <= 300; i++) cursors.observe(orderEvent(String(i)), true)
    expect(createCursorState(scope).getSnapshot().recent).toHaveLength(256)
    expect(cursors.observe(orderEvent('1'))).toBe('out_of_order')
  })
  it('isolates API, identity and generation; late cleanup does not delete another generation', () => {
    const old = createCursorState(scope)
    old.observe(orderEvent('12'), true)
    expect(
      createCursorState({ ...scope, identity: 'other' }).getSnapshot().observed,
    ).toBeNull()
    expect(
      createCursorState({
        ...scope,
        api: scope.api + '/different',
      }).getSnapshot().observed,
    ).toBeNull()
    const next = createCursorState({ ...scope, generation: 'generation-b' })
    next.observe(orderEvent('20'), true)
    expect(createCursorState(scope).getSnapshot().observed).toBeNull()
    old.clear()
    expect(
      createCursorState({ ...scope, generation: 'generation-b' }).getSnapshot()
        .observed,
    ).toBe('20')
    next.clear()
    expect(next.getSnapshot().recent).toEqual([])
    expect(
      createCursorState({ ...scope, generation: 'generation-b' }).getSnapshot()
        .observed,
    ).toBeNull()
  })
  it('rejects malformed, oversized and future persisted records without throwing', () => {
    const key = `celtas-order-events:cursors:v2:${scopeKey(scope)}`
    for (const raw of [
      'broken-json',
      'x'.repeat(40_000),
      JSON.stringify({ v: 2, generation: scope.generation, durable: '12' }),
    ]) {
      localStorage.setItem(key, raw)
      expect(createCursorState(scope).getSnapshot().durable).toBeNull()
    }
  })
})
