export function createOrderSound(changed: () => void, now = Date.now) {
  let audio: HTMLAudioElement | undefined
  let enabled = false
  let volume = 0.35
  let error: string | undefined
  let epoch = 0
  let lastPlayed = -Infinity
  let enabledAt = Infinity

  function blocked() {
    enabled = false
    error =
      'No se pudo reproducir el sonido. Pulsa Activar sonido para reintentarlo.'
    changed()
  }
  return {
    snapshot: () => ({ enabled, volume, error }),
    eligible: (at: number) => enabled && enabledAt <= at,
    async enable() {
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
        enabledAt = now()
        error = undefined
        changed()
      } catch {
        if (captured === epoch) blocked()
      }
    },
    async play() {
      // A short burst shares one chime rather than interrupting/overlapping audio.
      if (!enabled || !audio || now() - lastPlayed < 450) return
      const captured = epoch
      lastPlayed = now()
      audio.currentTime = 0
      try {
        await audio.play()
      } catch {
        if (captured === epoch) blocked()
      }
    },
    setVolume(value: number) {
      if (!Number.isFinite(value)) return
      volume = Math.max(0, Math.min(1, value))
      if (audio) audio.volume = volume
      changed()
    },
    mute() {
      epoch++
      enabled = false
      audio?.pause()
      changed()
    },
    close() {
      epoch++
      enabled = false
      error = undefined
      audio?.pause()
      audio?.removeAttribute('src')
      audio?.load()
      audio = undefined
      changed()
    },
  }
}
