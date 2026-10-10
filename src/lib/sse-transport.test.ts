import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSseStream } from './sse-transport'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
const encode = (text: string) => new TextEncoder().encode(text)
const input = () => ({
  url: 'http://localhost:3000/admin/orders/events',
  accessToken: 'inert-test-token',
  signal: new AbortController().signal,
  onOpen: vi.fn(),
  onItem: vi.fn(),
})

describe('fetch SSE transport', () => {
  it('settles after abort even when underlying reader cancellation never resolves', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => undefined))
    const body = new ReadableStream<Uint8Array>({ cancel })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(body, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        ),
    )
    const controller = new AbortController()
    const opened = vi.fn()
    const pending = readSseStream({
      ...input(),
      signal: controller.signal,
      onOpen: opened,
    })
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(opened).toHaveBeenCalledOnce()
    controller.abort()
    expect(await pending).toEqual({ kind: 'aborted' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })

  it('sends Bearer/Accept and exact string cursor; parses byte-fragmented UTF-8', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of encode(
          'event: test\nid: 9223372036854775807\ndata: Perú 🍟\n\n',
        ))
          controller.enqueue(new Uint8Array([byte]))
        controller.close()
      },
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const options = { ...input(), lastEventId: '9223372036854775807' }
    expect(await readSseStream(options)).toEqual({ kind: 'disconnected' })
    expect(fetchMock).toHaveBeenCalledWith(
      options.url,
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        headers: {
          Authorization: 'Bearer inert-test-token',
          Accept: 'text/event-stream',
          'Last-Event-ID': '9223372036854775807',
        },
      }),
    )
    expect(options.onOpen).toHaveBeenCalledOnce()
    expect(options.onItem).toHaveBeenCalledWith({
      type: 'event',
      frame: { event: 'test', id: '9223372036854775807', data: 'Perú 🍟' },
    })
  })

  it('aborts fetch and cancels/releases the reader while a read is pending', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(body, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const opened = vi.fn()
    const result = readSseStream({
      ...input(),
      signal: controller.signal,
      onOpen: opened,
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(opened).toHaveBeenCalledOnce()
    controller.abort()
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(
      true,
    )
    expect(cancel).toHaveBeenCalledOnce()
    expect(await result).toEqual({ kind: 'aborted' })
    expect(body.locked).toBe(false)
  })

  it('discards and cancels a response that arrives after abort', async () => {
    let resolve!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done
          }),
      ),
    )
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    const controller = new AbortController()
    const options = { ...input(), signal: controller.signal }
    const result = readSseStream(options)
    controller.abort()
    resolve(
      new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    )
    expect(await result).toEqual({ kind: 'aborted' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(options.onOpen).not.toHaveBeenCalled()
    expect(options.onItem).not.toHaveBeenCalled()
  })

  it.each(['text/html', 'application/json'])(
    'rejects successful non-SSE content %s without exposing its body',
    async (contentType) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('private body', {
            headers: { 'Content-Type': contentType },
          }),
        ),
      )
      expect(await readSseStream(input())).toEqual({ kind: 'protocol' })
    },
  )

  it('classifies invalid UTF-8 as protocol and exceptions as network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([0xff]), {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    )
    expect(await readSseStream(input())).toEqual({ kind: 'protocol' })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('private provider error')),
    )
    expect(await readSseStream(input())).toEqual({ kind: 'network' })
  })

  it.each([
    ['30', 30_000],
    ['invalid', undefined],
    ['-1', undefined],
  ])(
    'returns sanitized HTTP status and Retry-After %s',
    async (header, expected) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('sensitive error', {
            status: 429,
            headers: { 'Retry-After': header },
          }),
        ),
      )
      expect(await readSseStream(input())).toEqual({
        kind: 'http',
        status: 429,
        retryAfterMs: expected,
      })
    },
  )

  it('supports Retry-After as an HTTP date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 429,
          headers: { 'Retry-After': 'Thu, 08 Oct 2026 12:01:00 GMT' },
        }),
      ),
    )
    expect(await readSseStream(input())).toEqual({
      kind: 'http',
      status: 429,
      retryAfterMs: 60_000,
    })
  })

  it('times out opening and a silent stream; a heartbeat extends the idle deadline', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, config: RequestInit) =>
          new Promise((_resolve, reject) => {
            config.signal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            )
          }),
      ),
    )
    const opening = readSseStream(input())
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await opening).toEqual({ kind: 'network' })
    let controller!: ReadableStreamDefaultController<Uint8Array>
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(c) {
              controller = c
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
      ),
    )
    const options = input()
    const silent = readSseStream(options)
    await vi.advanceTimersByTimeAsync(40_000)
    controller.enqueue(encode(': heartbeat\n\n'))
    await vi.advanceTimersByTimeAsync(40_000)
    expect(options.onOpen).toHaveBeenCalledOnce()
    expect(options.onItem).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await silent).toEqual({ kind: 'network' })
  })
})
