import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOrderAlertsService, type AlertScope } from './service'
import {
  createCoordinationBrowser,
  flushCoordination,
} from '../events/coordination-test-utils'

const id = '10000000-0000-4000-8000-000000000001'
const scope: AlertScope = {
  api: 'http://localhost:3000/admin/orders/events',
  identity: 'admin',
  generation: 'a',
}
let browser: ReturnType<typeof createCoordinationBrowser>
const play = vi.fn(),
  pause = vi.fn(),
  load = vi.fn()
const services: ReturnType<typeof createOrderAlertsService>[] = []
function tab(readScope: () => AlertScope | undefined = () => scope) {
  const service = createOrderAlertsService({ scope: readScope })
  services.push(service)
  service.sync()
  return service
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'))
  localStorage.clear()
  play.mockReset().mockResolvedValue(undefined)
  pause.mockClear()
  load.mockClear()
  vi.stubGlobal(
    'Audio',
    class {
      play = play
      pause = pause
      load = load
      currentTime = 0
      volume = 1
      removeAttribute = vi.fn()
    },
  )
  browser = createCoordinationBrowser()
  vi.stubGlobal('navigator', { locks: browser.locks })
  vi.stubGlobal('BroadcastChannel', browser.BroadcastChannel)
})
afterEach(async () => {
  services.splice(0).forEach((service) => service.close())
  await flushCoordination()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('shared local order alerts', () => {
  it('rings immediately for a new order and every eight seconds until its details are reviewed', async () => {
    const service = tab()
    await service.enableSound()
    await vi.advanceTimersByTimeAsync(500)
    play.mockClear()
    await service.offer(id)
    expect(play).toHaveBeenCalledTimes(1)
    expect(
      service.getSnapshot().unreviewed.map((record) => record.orderId),
    ).toEqual([id])
    await vi.advanceTimersByTimeAsync(7999)
    expect(play).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(play).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(8000)
    expect(play).toHaveBeenCalledTimes(3)
    expect(service.getSnapshot().notices).toEqual([])
    expect(service.getSnapshot().unreviewed).toHaveLength(1)
    await service.markReviewed(id)
    await vi.advanceTimersByTimeAsync(24000)
    expect(play).toHaveBeenCalledTimes(3)
    expect(service.getSnapshot().unreviewed).toEqual([])
  })
  it('keeps one sequence for two new orders and restarts when a later new order arrives', async () => {
    const second = '10000000-0000-4000-8000-000000000002'
    const third = '10000000-0000-4000-8000-000000000003'
    const service = tab()
    await service.enableSound()
    await vi.advanceTimersByTimeAsync(500)
    play.mockClear()
    await service.offer(id)
    await vi.advanceTimersByTimeAsync(2000)
    await service.offer(second)
    expect(play).toHaveBeenCalledTimes(1)
    await service.markReviewed(id)
    await vi.advanceTimersByTimeAsync(6000)
    expect(play).toHaveBeenCalledTimes(2)
    expect(
      service.getSnapshot().unreviewed.map((record) => record.orderId),
    ).toEqual([second])
    await service.markReviewed(second)
    await vi.advanceTimersByTimeAsync(1000)
    await service.offer(third)
    expect(play).toHaveBeenCalledTimes(3)
  })
  it('manual mute cancels recurrence while preserving the unreviewed order', async () => {
    const service = tab()
    await service.enableSound()
    await vi.advanceTimersByTimeAsync(500)
    play.mockClear()
    await service.offer(id)
    service.mute()
    await vi.advanceTimersByTimeAsync(24000)
    expect(play).toHaveBeenCalledTimes(1)
    expect(service.getSnapshot().unreviewed).toHaveLength(1)
    expect(pause).toHaveBeenCalled()
  })
  it('duplicates and two tabs share one recurring clock; reviewing in either tab stops both', async () => {
    const first = tab(),
      second = tab()
    await first.enableSound()
    await second.enableSound()
    await vi.advanceTimersByTimeAsync(500)
    play.mockClear()
    await Promise.all([first.offer(id), second.offer(id), first.offer(id)])
    await flushCoordination()
    expect(play).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(16000)
    expect(play).toHaveBeenCalledTimes(3)
    await second.markReviewed(id)
    await flushCoordination()
    expect(first.getSnapshot().unreviewed).toEqual([])
    await first.offer(id)
    await vi.advanceTimersByTimeAsync(24000)
    expect(play).toHaveBeenCalledTimes(3)
  })
  it('holds the shared playback lease until audio ends, so a second tab cannot overlap a long sound', async () => {
    const audio: TestAudio[] = []
    class TestAudio extends EventTarget {
      paused = true
      currentTime = 0
      volume = 1
      constructor() {
        super()
        audio.push(this)
      }
      async play() {
        await play()
        this.paused = false
      }
      pause() {
        this.paused = true
        this.dispatchEvent(new Event('pause'))
      }
      end() {
        this.paused = true
        this.dispatchEvent(new Event('ended'))
      }
      removeAttribute = vi.fn()
      load = vi.fn()
    }
    vi.stubGlobal('Audio', TestAudio)
    const first = tab(),
      second = tab()
    await first.enableSound()
    audio[0].end()
    await second.enableSound()
    audio[1].end()
    await vi.advanceTimersByTimeAsync(500)
    play.mockClear()
    const offered = first.offer(id)
    await flushCoordination()
    expect(play).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(16000)
    expect(play).toHaveBeenCalledTimes(1)
    const reviewed = second.markReviewed(id)
    await flushCoordination()
    await Promise.all([offered, reviewed])
    expect(first.getSnapshot().unreviewed).toEqual([])
    expect(play).toHaveBeenCalledTimes(1)
  })
  it('restores only this session’s known unreviewed IDs, never legacy claims or another session', async () => {
    const first = tab()
    await first.offer(id)
    first.close()
    const restored = tab()
    expect(restored.getSnapshot().unreviewed).toHaveLength(1)
    expect(play).not.toHaveBeenCalled()
    restored.close()
    expect(
      tab(() => ({ ...scope, generation: 'next-login' })).getSnapshot()
        .unreviewed,
    ).toEqual([])
    localStorage.setItem(
      `celtas-order-alerts:v1:${JSON.stringify([scope.api, scope.identity])}`,
      JSON.stringify([{ orderId: id, at: Date.now(), sounded: true }]),
    )
    expect(tab().getSnapshot().unreviewed).toEqual([])
  })
  it('rechecks restored IDs before sounding and removes cancelled or missing orders', async () => {
    const first = tab()
    await first.offer(id)
    first.close()
    const validate = vi.fn().mockResolvedValue([])
    const restored = createOrderAlertsService({
      scope: () => scope,
      validateRestored: validate,
    })
    services.push(restored)
    restored.sync()
    await flushCoordination()
    expect(validate).toHaveBeenCalledWith([id], expect.any(AbortSignal))
    expect(restored.getSnapshot().unreviewed).toEqual([])
    await restored.enableSound()
    play.mockClear()
    await vi.advanceTimersByTimeAsync(16000)
    expect(play).not.toHaveBeenCalled()
  })
  it('a failed restore check cannot be bypassed by unlocking audio', async () => {
    const first = tab()
    await first.offer(id)
    first.close()
    const restored = createOrderAlertsService({
      scope: () => scope,
      validateRestored: async () => {
        throw Error('Offline')
      },
    })
    services.push(restored)
    restored.sync()
    await flushCoordination()
    await restored.enableSound()
    play.mockClear()
    await vi.advanceTimersByTimeAsync(16000)
    expect(play).not.toHaveBeenCalled()
    expect(restored.getSnapshot().unreviewed).toHaveLength(1)
  })
  it('active unreviewed orders do not expire merely because a day passes in the same session', async () => {
    const first = tab()
    await first.offer(id)
    first.close()
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 + 1)
    expect(tab().getSnapshot().unreviewed).toHaveLength(1)
  })
  it('a reviewed ID wins a race with an already queued delivery and never rearms after remount', async () => {
    const service = tab()
    const offered = service.offer(id)
    const reviewed = service.markReviewed(id)
    await Promise.all([offered, reviewed])
    service.close()
    const reloaded = tab()
    await reloaded.offer(id)
    expect(reloaded.getSnapshot().unreviewed).toEqual([])
  })
  it('retirement and a complete pending snapshot remove attention without treating pending as unreviewed', async () => {
    const second = '10000000-0000-4000-8000-000000000002'
    const service = tab()
    await service.offer(id)
    await service.offer(second)
    await service.retainPending([id], Date.now())
    expect(
      service.getSnapshot().unreviewed.map((record) => record.orderId),
    ).toEqual([id])
    await service.retire([id])
    await service.offer(id)
    expect(service.getSnapshot().unreviewed).toEqual([])
  })
  it('closing the last mount leaves no alarm timers, even during queued claims', async () => {
    const service = tab()
    await service.enableSound()
    await vi.advanceTimersByTimeAsync(500)
    await service.offer(id)
    service.close()
    await flushCoordination()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
    play.mockClear()
    await vi.advanceTimersByTimeAsync(24000)
    expect(play).not.toHaveBeenCalled()
  })
  it('autoplay rejection suspends repeats but retains the enabled preference and attention', async () => {
    const service = tab()
    await service.enableSound()
    await vi.advanceTimersByTimeAsync(500)
    play.mockClear()
    play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'))
    await service.offer(id)
    await vi.advanceTimersByTimeAsync(24000)
    expect(play).toHaveBeenCalledTimes(1)
    expect(service.getSnapshot()).toMatchObject({
      enabled: true,
      ready: false,
      error: expect.stringContaining('Habilitar audio'),
    })
    expect(service.getSnapshot().unreviewed).toHaveLength(1)
  })
  it('defaults to enabled preference without claiming that browser audio is ready', () => {
    expect(tab().getSnapshot()).toMatchObject({
      enabled: true,
      ready: false,
      volume: 0.35,
    })
    expect(play).not.toHaveBeenCalled()
  })
  it('persists explicit mute and volume across reload and session generation changes', async () => {
    const first = tab()
    first.mute()
    first.setVolume(0.6)
    first.close()
    const reloaded = tab(() => ({ ...scope, generation: 'new-session' }))
    expect(reloaded.getSnapshot()).toMatchObject({
      enabled: false,
      ready: false,
      volume: 0.6,
    })
    await reloaded.offer(id)
    expect(play).not.toHaveBeenCalled()
    expect(
      tab(() => ({ ...scope, identity: 'another-admin' })).getSnapshot()
        .enabled,
    ).toBe(true)
  })
  it('persists enable despite autoplay denial and never replays silent orders after unlock', async () => {
    const first = tab()
    first.mute()
    play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'))
    await first.enableSound()
    expect(first.getSnapshot()).toMatchObject({ enabled: true, ready: false })
    first.close()
    const reloaded = tab()
    expect(reloaded.getSnapshot()).toMatchObject({
      enabled: true,
      ready: false,
    })
    await reloaded.offer(id)
    await vi.advanceTimersByTimeAsync(500)
    await reloaded.enableSound()
    play.mockClear()
    await reloaded.offer(id)
    expect(play).not.toHaveBeenCalled()
  })
  it('ignores invalid stored preferences', () => {
    localStorage.setItem(
      `celtas-order-alert-preferences:v1:${JSON.stringify([scope.api, scope.identity])}`,
      '{"enabled":false,"volume":20}',
    )
    expect(tab().getSnapshot()).toMatchObject({ enabled: true, volume: 0.35 })
  })
  it('shows a new order without playing before activation and rejects invalid identifiers', async () => {
    const service = tab()
    await service.offer(id)
    await service.offer('../private')
    expect(service.getSnapshot().notices.map((n) => n.orderId)).toEqual([id])
    expect(play).not.toHaveBeenCalled()
  })
  it('two tabs and simultaneous SSE/FCM offers claim exactly one sound and one banner per tab', async () => {
    const first = tab(),
      second = tab()
    await first.enableSound()
    await second.enableSound()
    await vi.advanceTimersByTimeAsync(500)
    play.mockClear()
    await Promise.all([first.offer(id), second.offer(id), first.offer(id)])
    await flushCoordination()
    expect(play).toHaveBeenCalledTimes(1)
    expect(first.getSnapshot().notices).toHaveLength(1)
    expect(second.getSnapshot().notices).toHaveLength(1)
  })
  it('an activated follower can sound even when the first claiming tab is muted', async () => {
    const first = tab(),
      second = tab()
    await second.enableSound()
    await vi.advanceTimersByTimeAsync(500)
    play.mockClear()
    await first.offer(id)
    await flushCoordination()
    expect(play).toHaveBeenCalledTimes(1)
    expect(second.getSnapshot().notices).toHaveLength(1)
  })
  it('reload/leadership change and duplicate delivery do not repeat an existing notice or sound', async () => {
    const first = tab()
    await first.offer(id)
    first.close()
    await vi.advanceTimersByTimeAsync(500)
    const reloaded = tab()
    await reloaded.enableSound()
    await vi.advanceTimersByTimeAsync(500)
    play.mockClear()
    await reloaded.offer(id)
    expect(reloaded.getSnapshot().notices).toEqual([])
    expect(play).not.toHaveBeenCalled()
  })
  it('activation after a silent notice cannot make a duplicate historical delivery audible', async () => {
    const service = tab()
    await service.offer(id)
    await vi.advanceTimersByTimeAsync(500)
    await service.enableSound()
    play.mockClear()
    await service.offer(id)
    expect(play).not.toHaveBeenCalled()
  })
  it('handles autoplay rejection and keeps the visual notice', async () => {
    const service = tab()
    play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'))
    await service.enableSound()
    expect(service.getSnapshot()).toMatchObject({
      enabled: true,
      ready: false,
      error: expect.stringContaining('Habilitar audio'),
    })
    await service.offer(id)
    expect(service.getSnapshot().notices).toHaveLength(1)
  })
  it('mutes after a later playback rejection, without replaying the same order', async () => {
    const service = tab()
    await service.enableSound()
    await vi.advanceTimersByTimeAsync(500)
    play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'))
    await service.offer(id)
    expect(service.getSnapshot().ready).toBe(false)
    const count = play.mock.calls.length
    await service.offer(id)
    expect(play).toHaveBeenCalledTimes(count)
  })
  it('logout cancels queued claims and releases audio and channels', async () => {
    let active: AlertScope | undefined = scope
    const service = tab(() => active)
    await service.enableSound()
    await vi.advanceTimersByTimeAsync(500)
    play.mockClear()
    let release!: () => void
    const key = `celtas-order-alerts:v1:${JSON.stringify([scope.api, scope.identity])}`
    const held = browser.locks.request(
      key,
      {},
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    await flushCoordination()
    const offer = service.offer(id)
    active = undefined
    service.sync()
    release()
    await held
    await offer
    expect(play).not.toHaveBeenCalled()
    expect(load).toHaveBeenCalled()
    expect(browser.channels.every((channel) => channel.closed)).toBe(true)
    expect(service.getSnapshot().notices).toEqual([])
  })
  it('requires coordination for sound but keeps local visual fallback', async () => {
    vi.stubGlobal('navigator', { locks: undefined })
    const service = tab()
    await service.enableSound()
    await service.offer(id)
    expect(play).not.toHaveBeenCalled()
    expect(service.getSnapshot().notices).toHaveLength(1)
  })
  it('suspends audio on a failed ledger write without changing the enabled preference', async () => {
    const service = tab()
    await service.enableSound()
    await vi.advanceTimersByTimeAsync(500)
    const write = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Unavailable', 'QuotaExceededError')
      })
    try {
      await service.offer(id)
      expect(service.getSnapshot()).toMatchObject({
        enabled: true,
        ready: false,
        error: expect.stringContaining('deduplicación'),
      })
    } finally {
      write.mockRestore()
    }
    service.setVolume(0.5)
    service.close()
    expect(tab().getSnapshot()).toMatchObject({ enabled: true, volume: 0.5 })
  })
  it('bounds reviewed history without evicting unreviewed orders and expires prior-session records', async () => {
    const service = tab()
    for (let i = 0; i < 514; i++)
      await service.offer(
        `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      )
    const key = `celtas-order-alerts:v1:${JSON.stringify([scope.api, scope.identity])}`
    expect(service.getSnapshot().unreviewed).toHaveLength(514)
    expect(JSON.parse(localStorage.getItem(key)!)).toHaveLength(514)
    await service.retire(
      service.getSnapshot().unreviewed.map((record) => record.orderId),
    )
    expect(JSON.parse(localStorage.getItem(key)!)).toHaveLength(512)
    service.close()
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 + 1)
    tab(() => ({ ...scope, generation: 'later-login' }))
    await flushCoordination()
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([])
  })
  it('volume stays in range and closing a pending activation cannot re-enable audio', async () => {
    const service = tab()
    service.setVolume(2)
    expect(service.getSnapshot().volume).toBe(1)
    let resolve!: () => void
    play.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done
        }),
    )
    const activation = service.enableSound()
    service.close()
    resolve()
    await activation
    expect(service.getSnapshot().enabled).toBe(false)
  })
})
