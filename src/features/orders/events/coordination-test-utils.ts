/** Deterministic same-origin browser model; no real locks, channels or network. */
export function createCoordinationBrowser() {
  interface Waiter {
    name: string
    signal?: AbortSignal
    callback: (lock: Lock) => unknown
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
    granted: boolean
  }
  const held = new Set<string>()
  const waiting: Waiter[] = []
  const names: string[] = []
  function drain() {
    for (const entry of [...waiting]) {
      if (held.has(entry.name) || entry.signal?.aborted) continue
      waiting.splice(waiting.indexOf(entry), 1)
      held.add(entry.name)
      entry.granted = true
      Promise.resolve()
        .then(() =>
          entry.callback({ name: entry.name, mode: 'exclusive' } as Lock),
        )
        .then(
          (value) => {
            held.delete(entry.name)
            entry.resolve(value)
            drain()
          },
          (error) => {
            held.delete(entry.name)
            entry.reject(error)
            drain()
          },
        )
    }
  }
  const locks = {
    request(
      name: string,
      options: { signal?: AbortSignal },
      callback: (lock: Lock) => unknown,
    ) {
      names.push(name)
      return new Promise((resolve, reject) => {
        const entry: Waiter = {
          name,
          signal: options.signal,
          callback,
          resolve,
          reject,
          granted: false,
        }
        const abort = () => {
          if (entry.granted) return // Web Locks signal only cancels waiting acquisition.
          const index = waiting.indexOf(entry)
          if (index >= 0) waiting.splice(index, 1)
          reject(new DOMException('Canceled', 'AbortError'))
        }
        if (options.signal?.aborted) {
          abort()
          return
        }
        options.signal?.addEventListener('abort', abort, { once: true })
        waiting.push(entry)
        queueMicrotask(drain)
      })
    },
  }
  const channels: MockChannel[] = []
  const messages: unknown[] = []
  class MockChannel {
    closed = false
    onmessage: ((event: MessageEvent) => void) | null = null
    onmessageerror: (() => void) | null = null
    readonly name: string
    constructor(name: string) {
      this.name = name
      channels.push(this)
    }
    postMessage(data: unknown) {
      const copy = structuredClone(data)
      messages.push(copy)
      for (const channel of channels) {
        if (channel === this || channel.name !== this.name) continue
        queueMicrotask(() => {
          if (!channel.closed)
            channel.onmessage?.(new MessageEvent('message', { data: copy }))
        })
      }
    }
    close() {
      this.closed = true
    }
  }
  return {
    locks,
    names,
    channels,
    messages,
    BroadcastChannel: MockChannel,
    held,
  }
}

export async function flushCoordination() {
  for (let i = 0; i < 50; i++) await Promise.resolve()
}
