export function createOrderSound(changed: () => void, now = Date.now) {
  let audio: HTMLAudioElement | undefined
  let enabled = false
  let ready = false
  let volume = 0.35
  let error: string | undefined
  let epoch = 0
  let lastPlayed = -Infinity
  let enabledAt = Infinity
  let playing = false
  let finishPlayback: (() => void) | undefined
  function audioPlaying(): boolean {
    return audio?.paused === false
  }

  function stop() {
    audio?.pause()
    finishPlayback?.()
  }

  function blocked() {
    ready = false
    error =
      'No se pudo reproducir el sonido. Pulsa Habilitar audio para reintentarlo.'
    changed()
  }
  return {
    snapshot: () => ({ enabled, ready, volume, error }),
    eligible: (at: number) => enabled && ready && enabledAt <= at,
    configure(preference: { enabled: boolean; volume: number }) {
      enabled = preference.enabled
      volume = preference.volume
      ready = false
      enabledAt = Infinity
      error = undefined
      changed()
    },
    async enable() {
      enabled = true
      const captured = epoch
      try {
        audio ??= new Audio('/order-alert.wav')
        audio.volume = volume
        audio.currentTime = 0
        // Called directly by the button, while user activation is still available.
        await audio.play()
        if (captured !== epoch) return
        lastPlayed = now()
        enabled = true
        ready = true
        enabledAt = now()
        error = undefined
        changed()
      } catch {
        if (captured === epoch) blocked()
      }
    },
    async play() {
      // A short burst shares one chime rather than interrupting/overlapping audio.
      if (
        !enabled ||
        !ready ||
        !audio ||
        playing ||
        audioPlaying() ||
        now() - lastPlayed < 450
      )
        return
      const captured = epoch
      playing = true
      lastPlayed = now()
      audio.currentTime = 0
      try {
        await audio.play()
        if (captured !== epoch || !audioPlaying()) return
        const currentAudio = audio
        await new Promise<void>((resolve) => {
          const finish = () => {
            currentAudio.removeEventListener('ended', finish)
            currentAudio.removeEventListener('pause', finish)
            currentAudio.removeEventListener('error', failed)
            if (finishPlayback === finish) finishPlayback = undefined
            resolve()
          }
          const failed = () => {
            if (captured === epoch) blocked()
            finish()
          }
          finishPlayback = finish
          currentAudio.addEventListener('ended', finish, { once: true })
          currentAudio.addEventListener('pause', finish, { once: true })
          currentAudio.addEventListener('error', failed, { once: true })
        })
      } catch {
        if (captured === epoch) blocked()
      } finally {
        playing = false
      }
    },
    stop,
    setVolume(value: number) {
      if (!Number.isFinite(value)) return
      volume = Math.max(0, Math.min(1, value))
      if (audio) audio.volume = volume
      changed()
    },
    suspend() {
      epoch++
      ready = false
      enabledAt = Infinity
      stop()
      changed()
    },
    mute() {
      epoch++
      enabled = false
      ready = false
      enabledAt = Infinity
      error = undefined
      stop()
      changed()
    },
    close() {
      epoch++
      enabled = false
      ready = false
      enabledAt = Infinity
      error = undefined
      stop()
      audio?.removeAttribute('src')
      audio?.load()
      audio = undefined
      changed()
    },
  }
}
