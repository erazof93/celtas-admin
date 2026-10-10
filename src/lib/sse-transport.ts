import { createSseParser, SseParserError, type SseItem } from './sse-client'

export type SseTransportResult =
  | { kind: 'http'; status: number; retryAfterMs?: number }
  | { kind: 'protocol' | 'network' | 'disconnected' | 'aborted' }

/** HTTP metadata only. Never reads error bodies or exposes provider errors. */
function retryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const delay = /^\d+$/.test(value)
    ? Number(value) * 1000
    : Date.parse(value) - Date.now()
  return Number.isFinite(delay) && delay >= 0
    ? Math.min(delay, 2_147_483_647)
    : undefined
}

/** One request; reconnection and auth belong to the caller. */
export async function readSseStream(options: {
  url: string
  accessToken: string
  lastEventId?: string
  signal: AbortSignal
  onItem: (item: SseItem) => void
  onOpen: () => void
}): Promise<SseTransportResult> {
  const controller = new AbortController()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  // Per-wait listeners avoid accumulating Promise.race reactions over a long stream.
  function wait<T>(pending: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const canceled = () => {
        controller.signal.removeEventListener('abort', canceled)
        reject(new Error('SSE transport aborted'))
      }
      pending.then(
        (value) => {
          controller.signal.removeEventListener('abort', canceled)
          resolve(value)
        },
        (error) => {
          controller.signal.removeEventListener('abort', canceled)
          reject(error)
        },
      )
      if (controller.signal.aborted) canceled()
      else controller.signal.addEventListener('abort', canceled, { once: true })
    })
  }
  const cancelReader = () => {
    void reader?.cancel().catch(() => undefined)
  }
  const abort = () => {
    controller.abort()
    cancelReader()
  }
  const armTimeout = (ms: number) => {
    clearTimeout(timer)
    timer = setTimeout(abort, ms)
  }
  options.signal.addEventListener('abort', abort, { once: true })
  if (options.signal.aborted) abort()
  armTimeout(15_000)
  try {
    if (controller.signal.aborted) return { kind: 'aborted' }
    const pending = fetch(options.url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        Accept: 'text/event-stream',
        ...(options.lastEventId === undefined
          ? {}
          : { 'Last-Event-ID': options.lastEventId }),
      },
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    })
    // Dispose late responses even when a fetch implementation ignores AbortSignal.
    void pending.then(
      (response) => {
        if (controller.signal.aborted)
          void response.body?.cancel().catch(() => undefined)
      },
      () => undefined,
    )
    const response = await wait(pending)
    if (controller.signal.aborted) {
      void response.body?.cancel().catch(() => undefined)
      return { kind: options.signal.aborted ? 'aborted' : 'network' }
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined)
      return {
        kind: 'http',
        status: response.status,
        retryAfterMs: retryAfter(response.headers.get('Retry-After')),
      }
    }
    if (
      response.status !== 200 ||
      response.headers
        .get('Content-Type')
        ?.split(';')[0]
        .trim()
        .toLowerCase() !== 'text/event-stream' ||
      !response.body
    ) {
      void response.body?.cancel().catch(() => undefined)
      return { kind: 'protocol' }
    }
    reader = response.body.getReader()
    armTimeout(60_000) // Backend heartbeat is 20s; allow missed heartbeats.
    options.onOpen()
    const parser = createSseParser((item) => {
      if (!controller.signal.aborted) options.onItem(item)
    })
    while (!controller.signal.aborted) {
      const chunk = await wait(reader.read())
      if (controller.signal.aborted) break
      if (chunk.done) {
        parser.finish()
        return { kind: 'disconnected' }
      }
      armTimeout(60_000)
      parser.push(chunk.value)
    }
    return { kind: options.signal.aborted ? 'aborted' : 'network' }
  } catch (error) {
    if (options.signal.aborted) return { kind: 'aborted' }
    return { kind: error instanceof SseParserError ? 'protocol' : 'network' }
  } finally {
    clearTimeout(timer)
    options.signal.removeEventListener('abort', abort)
    controller.abort()
    if (reader) {
      // Never await provider cancellation: a noncooperative stream cannot pin leadership.
      void reader.cancel().catch(() => undefined)
      try {
        reader.releaseLock()
      } catch {
        /* Late reads are fenced by AbortSignal. */
      }
    }
  }
}
