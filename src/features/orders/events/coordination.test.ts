import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOrderEventsCoordinator } from './coordination'
import {
  createCoordinationBrowser,
  flushCoordination,
} from './coordination-test-utils'
import type { OrderEventsScope } from './cursor-state'

const scope: OrderEventsScope = {
  api: 'http://localhost:3000/admin/orders/events',
  identity: 'admin',
  generation: 'session-a',
}
const ready = {
  type: 'stream.ready' as const,
  payload: {
    v: 1 as const,
    headCursor: '12',
    floorCursor: '0',
    recovery: 'rest' as const,
  },
}
let browser: ReturnType<typeof createCoordinationBrowser>
const tabs: ReturnType<typeof createOrderEventsCoordinator>[] = []
let active = 0
let peak = 0
function tab(extra: Partial<OrderEventsScope> = {}) {
  const onSignal = vi.fn(),
    onLeader = vi.fn(),
    onLost = vi.fn(),
    onUnavailable = vi.fn()
  const coordinator = createOrderEventsCoordinator(
    { ...scope, ...extra },
    {
      current: () => true,
      onFollower: vi.fn(),
      onUnavailable,
      onSignal,
      onLeader: (previous) => {
        active++
        peak = Math.max(peak, active)
        onLeader(previous)
      },
      onLost: () => {
        active--
        onLost()
      },
    },
  )
  tabs.push(coordinator)
  coordinator.start()
  return { coordinator, onSignal, onLeader, onLost, onUnavailable }
}
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  active = 0
  peak = 0
  browser = createCoordinationBrowser()
  vi.stubGlobal('navigator', { locks: browser.locks })
  vi.stubGlobal('BroadcastChannel', browser.BroadcastChannel)
})
afterEach(async () => {
  tabs.splice(0).forEach((coordinator) => coordinator.close())
  await flushCoordination()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('SSE tab leadership protocol', () => {
  it('starts idempotently and lets retired followers consume queued control signals without acquiring', async () => {
    const leader = tab(),
      follower = tab()
    leader.coordinator.start()
    await flushCoordination()
    expect(browser.names).toHaveLength(2)
    follower.coordinator.retire()
    leader.coordinator.send({ kind: 'event', event: ready })
    await flushCoordination()
    expect(follower.onSignal).toHaveBeenCalledOnce()
    leader.coordinator.close()
    await flushCoordination()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(follower.onLeader).not.toHaveBeenCalled()
  })

  it.each([2, 3])(
    'elects one leader among %i tabs and succeeds when it closes',
    async (count) => {
      const clients = Array.from({ length: count }, () => tab())
      await flushCoordination()
      expect(clients[0].coordinator.isLeader()).toBe(true)
      expect(
        clients.slice(1).every((client) => !client.coordinator.isLeader()),
      ).toBe(true)
      expect(peak).toBe(1)
      clients[0].coordinator.close()
      await flushCoordination()
      expect(clients[1].coordinator.isLeader()).toBe(true)
      expect(peak).toBe(1)
      expect(
        browser.names.every((name) => name !== 'celtas-push-installation'),
      ).toBe(true)
    },
  )
  it('separates identities/APIs but keeps generations of the same identity under one lock', async () => {
    const first = tab(),
      old = tab({ generation: 'other-generation' })
    const other = tab({ identity: 'other-admin' }),
      api = tab({ api: scope.api + '/different' })
    await flushCoordination()
    expect(first.coordinator.isLeader()).toBe(true)
    expect(old.coordinator.isLeader()).toBe(false)
    expect(other.coordinator.isLeader()).toBe(true)
    expect(api.coordinator.isLeader()).toBe(true)
  })
  it('projects validated events and ignores duplicates, stale/self/foreign/invalid messages', async () => {
    const leader = tab(),
      follower = tab()
    await flushCoordination()
    leader.coordinator.send({ kind: 'event', event: ready })
    await flushCoordination()
    expect(follower.onSignal).toHaveBeenCalledOnce()
    expect(leader.onSignal).not.toHaveBeenCalled()
    const message = browser.messages[0] as Record<string, unknown>
    browser.channels[0].onmessage?.(
      new MessageEvent('message', { data: message }),
    )
    expect(leader.onSignal).not.toHaveBeenCalled()
    const send = (raw: unknown) =>
      browser.channels[1].onmessage?.(
        new MessageEvent('message', { data: raw }),
      )
    send(message)
    for (const patch of [
      { v: 2 },
      { identity: 'other' },
      { generation: 'old' },
      { api: 'http://other.invalid' },
      { sentAt: Date.now() - 31_000 },
      { term: crypto.randomUUID() },
      {
        signal: {
          kind: 'event',
          event: { type: 'unknown', payload: { v: 1 } },
        },
      },
      {
        signal: {
          kind: 'state',
          state: { status: 'connected', token: 'private' },
        },
      },
    ])
      send({ ...message, sequence: 20, ...patch })
    send(null)
    send({ circular: null })
    send('x'.repeat(20_000))
    expect(follower.onSignal).toHaveBeenCalledOnce()
    leader.coordinator.send({
      kind: 'event',
      event: {
        ...ready,
        payload: { ...ready.payload, privateField: 'private' },
      } as typeof ready,
    })
    await flushCoordination()
    expect(JSON.stringify(browser.messages)).not.toContain('private')
    expect(follower.onSignal).toHaveBeenCalledTimes(2)
  })
  it('fences queued messages from the previous term after succession', async () => {
    const first = tab(),
      second = tab(),
      third = tab()
    await flushCoordination()
    first.coordinator.send({ kind: 'event', event: ready })
    await flushCoordination()
    const old = browser.messages[0]
    first.coordinator.close()
    await flushCoordination()
    const calls = third.onSignal.mock.calls.length
    browser.channels[2].onmessage?.(new MessageEvent('message', { data: old }))
    expect(third.onSignal).toHaveBeenCalledTimes(calls)
    second.coordinator.send({ kind: 'event', event: ready })
    await flushCoordination()
    expect(third.onSignal).toHaveBeenCalledTimes(calls + 1)
  })
  it('hands over with retry and terminal metadata intact', async () => {
    const first = tab(),
      second = tab()
    await flushCoordination()
    const state = {
      status: 'degraded' as const,
      error: 'http' as const,
      httpStatus: 503,
      retryAt: Date.now() + 120_000,
      retryAttempt: 2,
      retryFloor: 5000,
    }
    first.coordinator.send({ kind: 'state', state })
    await flushCoordination()
    first.coordinator.close()
    await flushCoordination()
    expect(second.onLeader).toHaveBeenCalledWith(state)
  })
  it('voluntarily rotates leadership without stealing; stale resumed leaders yield', async () => {
    const first = tab(),
      second = tab()
    await flushCoordination()
    await vi.advanceTimersByTimeAsync(300_000)
    expect(second.coordinator.isLeader()).toBe(true)
    expect(peak).toBe(1)
    // Simulate an event-loop suspension, not normal timer execution.
    vi.setSystemTime(Date.now() + 31_000)
    expect(second.coordinator.isLeader()).toBe(false)
    second.coordinator.send({ kind: 'event', event: ready })
    await flushCoordination()
    await vi.advanceTimersByTimeAsync(5000)
    expect(first.coordinator.isLeader() || second.coordinator.isLeader()).toBe(
      true,
    )
    expect(peak).toBe(1)
  })
  it.each(['locks', 'channel'])('fails closed without %s', async (missing) => {
    if (missing === 'locks') vi.stubGlobal('navigator', {})
    else vi.stubGlobal('BroadcastChannel', undefined)
    const client = tab()
    await flushCoordination()
    expect(client.onUnavailable).toHaveBeenCalledOnce()
    expect(client.onLeader).not.toHaveBeenCalled()
    expect(browser.held.size).toBe(0)
  })
})
