export type AudioStatus =
  'unchecked' | 'available' | 'blocked' | 'error' | 'muted'

export function createOrderSound(changed: () => void, now = Date.now) {
  let audio: HTMLAudioElement | undefined
  let enabled = false
  let ready = false
  let audioStatus: AudioStatus = 'muted'
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

  function blocked(cause?: unknown) {
    audioStatus =
      cause instanceof DOMException && cause.name === 'NotAllowedError'
        ? 'blocked'
        : 'error'
    ready = false
    error =
      audioStatus === 'blocked'
        ? 'El navegador bloqueó el sonido. Pulsa Habilitar audio.'
        : 'Error de reproducción. Pulsa Reintentar audio.'
    changed()
  }
  return {
    snapshot: () => ({ enabled, ready, audioStatus, volume, error }),
    eligible: (at: number) => enabled && ready && enabledAt <= at,
    configure(preference: { enabled: boolean; volume: number }) {
      enabled = preference.enabled
      audioStatus = preference.enabled ? 'unchecked' : 'muted'
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
        audioStatus = 'available'
        enabledAt = now()
        error = undefined
        changed()
      } catch (cause) {
        if (captured === epoch) blocked(cause)
      }
    },
    async play() {
      // A short burst shares one chime rather than interrupting/overlapping audio.
      if (
        !enabled ||
        (audioStatus !== 'unchecked' && !ready) ||
        playing ||
        audioPlaying() ||
        now() - lastPlayed < 450
      )
        return
      const captured = epoch
      playing = true
      lastPlayed = now()
      try {
        audio ??= new Audio('/order-alert.wav')
        audio.volume = volume
        audio.currentTime = 0
        await audio.play()
        if (captured !== epoch) return
        ready = true
        audioStatus = 'available'
        enabledAt = now()
        error = undefined
        changed()
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
      } catch (cause) {
        if (captured === epoch) blocked(cause)
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
      audioStatus = 'error'
      enabledAt = Infinity
      stop()
      changed()
    },
    mute() {
      epoch++
      enabled = false
      audioStatus = 'muted'
      ready = false
      enabledAt = Infinity
      error = undefined
      stop()
      changed()
    },
    close() {
      epoch++
      enabled = false
      audioStatus = 'muted'
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
