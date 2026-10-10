export function createOrderSound(changed: () => void, now = Date.now) {
  let audio: HTMLAudioElement | undefined
  let enabled = false
  let ready = false
  let volume = 0.35
  let error: string | undefined
  let epoch = 0
  let lastPlayed = -Infinity
  let enabledAt = Infinity

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
      if (!enabled || !ready || !audio || now() - lastPlayed < 450) return
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
    suspend() {
      epoch++
      ready = false
      enabledAt = Infinity
      audio?.pause()
      changed()
    },
    mute() {
      epoch++
      enabled = false
      ready = false
      enabledAt = Infinity
      error = undefined
      audio?.pause()
      changed()
    },
    close() {
      epoch++
      enabled = false
      ready = false
      enabledAt = Infinity
      error = undefined
      audio?.pause()
      audio?.removeAttribute('src')
      audio?.load()
      audio = undefined
      changed()
    },
  }
}
