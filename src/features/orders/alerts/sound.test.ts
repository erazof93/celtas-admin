import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createOrderSound } from './sound'

const instances: TestAudio[] = []
const currentAudio = () => instances.at(-1)!
class TestAudio extends EventTarget {
  paused = true
  currentTime = 0
  volume = 1
  constructor() {
    super()
    instances.push(this)
  }
  play = vi.fn(async () => {
    this.paused = false
  })
  pause = vi.fn(() => {
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  })
  removeAttribute = vi.fn()
  load = vi.fn()
  end() {
    this.paused = true
    this.dispatchEvent(new Event('ended'))
  }
}
beforeEach(() => {
  instances.length = 0
  vi.useFakeTimers()
  vi.stubGlobal('Audio', TestAudio)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('never overlaps or restarts playback, and resolves its playback lease only at ended', async () => {
  const sound = createOrderSound(vi.fn())
  sound.configure({ enabled: true, volume: 0.35 })
  await sound.enable()
  currentAudio().end()
  await vi.advanceTimersByTimeAsync(500)
  currentAudio().play.mockClear()
  let finished = false
  const playback = sound.play().then(() => {
    finished = true
  })
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(8000)
  await sound.play()
  expect(currentAudio().play).toHaveBeenCalledTimes(1)
  expect(finished).toBe(false)
  currentAudio().end()
  await playback
  expect(finished).toBe(true)
  sound.close()
})

it('mute and close stop active audio and release the lease without making it ready again', async () => {
  const sound = createOrderSound(vi.fn())
  sound.configure({ enabled: true, volume: 0.35 })
  await sound.enable()
  currentAudio().end()
  await vi.advanceTimersByTimeAsync(500)
  const playback = sound.play()
  await Promise.resolve()
  sound.mute()
  await playback
  expect(currentAudio().paused).toBe(true)
  expect(sound.snapshot()).toMatchObject({ enabled: false, ready: false })
  sound.close()
  expect(currentAudio().load).toHaveBeenCalled()
})
