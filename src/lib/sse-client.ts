/** A wire frame, not application state. IDs are never coerced to numbers. */
export interface SseFrame {
  event: string
  data: string
  /** ID explicitly present in this frame; absent IDs are not inherited. */
  id?: string
}

export type SseItem =
  { type: 'event'; frame: SseFrame } | { type: 'retry'; milliseconds: number }

export type SseParserErrorCode = 'invalid_utf8' | 'buffer_limit' | 'closed'

export class SseParserError extends Error {
  readonly code: SseParserErrorCode

  constructor(code: SseParserErrorCode) {
    super(`SSE parser: ${code}`)
    this.name = 'SseParserError'
    this.code = code
  }
}

/**
 * Incremental UTF-8 parser without HTTP, session, retry timers or logging.
 * Emits synchronously without retaining completed frames. LF, CRLF and CR
 * delimit lines. EOF discards an event not terminated by a blank line.
 * Invalid UTF-8 / oversized input closes the parser with a sanitized error.
 * Unknown fields and invalid id/retry fields are ignored per SSE semantics.
 * Consumers own last-event-ID persistence (including explicit empty IDs).
 */
export function createSseParser(
  onItem: (item: SseItem) => void,
  options: { maxLineCharacters?: number; maxFrameCharacters?: number } = {},
) {
  const maxLine = options.maxLineCharacters ?? 16_384
  const maxFrame = options.maxFrameCharacters ?? 65_536
  if (![maxLine, maxFrame].every((n) => Number.isSafeInteger(n) && n > 0))
    throw new RangeError('SSE parser: invalid limits')

  const decoder = new TextDecoder('utf-8', { fatal: true })
  let closed = false
  let line = ''
  let afterCr = false
  let frameSize = 0
  let event = ''
  let id: string | undefined
  let data: string[] = []

  function clearFrame() {
    frameSize = 0
    event = ''
    id = undefined
    data = []
  }

  function fail(code: SseParserErrorCode): never {
    closed = true
    line = ''
    clearFrame()
    throw new SseParserError(code)
  }

  function endLine() {
    const value = line
    line = ''
    if (value === '') {
      const frame: SseFrame | undefined = data.length
        ? {
            event: event || 'message',
            data: data.join('\n'),
            ...(id === undefined ? {} : { id }),
          }
        : undefined
      clearFrame()
      if (frame) onItem({ type: 'event', frame })
      return
    }
    // Count all fields, including comments/unknown fields, to bound pending frames.
    frameSize += value.length + 1
    if (frameSize > maxFrame) fail('buffer_limit')
    if (value.startsWith(':')) return
    const colon = value.indexOf(':')
    const field = colon < 0 ? value : value.slice(0, colon)
    let content = colon < 0 ? '' : value.slice(colon + 1)
    if (content.startsWith(' ')) content = content.slice(1)
    switch (field) {
      case 'event':
        event = content
        break
      case 'data':
        data.push(content)
        break
      case 'id':
        if (!content.includes('\0')) id = content
        break
      case 'retry':
        if (/^\d+$/.test(content)) {
          const milliseconds = Number(content)
          if (Number.isSafeInteger(milliseconds))
            onItem({ type: 'retry', milliseconds })
        }
        break
    }
  }

  function consume(text: string) {
    for (const character of text) {
      if (closed) return
      if (afterCr) {
        afterCr = false
        if (character === '\n') continue
      }
      if (character === '\r' || character === '\n') {
        afterCr = character === '\r'
        endLine()
      } else {
        line += character
        if (line.length > maxLine || frameSize + line.length > maxFrame)
          fail('buffer_limit')
      }
    }
  }

  function decode(bytes?: Uint8Array) {
    try {
      return bytes === undefined
        ? decoder.decode()
        : decoder.decode(bytes, { stream: true })
    } catch {
      return fail('invalid_utf8')
    }
  }

  return {
    push(bytes: Uint8Array): void {
      if (closed) fail('closed')
      // Bound temporary decoded strings even when a caller supplies a huge chunk.
      for (let offset = 0; offset < bytes.length; offset += 4096)
        consume(decode(bytes.subarray(offset, offset + 4096)))
    },
    finish(): void {
      if (closed) fail('closed')
      consume(decode())
      closed = true
      line = ''
      clearFrame()
    },
  }
}
