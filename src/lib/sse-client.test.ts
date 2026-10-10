import { describe, expect, it } from 'vitest'
import { createSseParser, SseParserError, type SseItem } from './sse-client'

const encode = (text: string) => new TextEncoder().encode(text)
function collect(options?: Parameters<typeof createSseParser>[1]) {
  const items: SseItem[] = []
  return { items, parser: createSseParser((item) => items.push(item), options) }
}

describe('SSE wire parser', () => {
  it('handles every byte boundary, UTF-8, BOM, fragmented CRLF and multiple frames', () => {
    const bytes = encode(
      '\uFEFFevent: created\r\nid: 9\r\ndata: Perú 🍟\r\n\r\ndata: next\n\n',
    )
    const expected = [
      { type: 'event', frame: { event: 'created', id: '9', data: 'Perú 🍟' } },
      { type: 'event', frame: { event: 'message', data: 'next' } },
    ]
    for (let split = 0; split <= bytes.length; split++) {
      const { items, parser } = collect()
      parser.push(bytes.subarray(0, split))
      parser.push(bytes.subarray(split))
      parser.finish()
      expect(items).toEqual(expected)
    }
    const { items, parser } = collect()
    for (const byte of bytes) parser.push(new Uint8Array([byte]))
    parser.finish()
    expect(items).toEqual(expected)
  })

  it('joins data lines, removes only one space and ignores comments/unknown fields', () => {
    const { items, parser } = collect()
    parser.push(
      encode(
        ': heartbeat\n\nunknown: ignored\ndata: first\ndata:  second\ndata\n\n',
      ),
    )
    expect(items).toEqual([
      { type: 'event', frame: { event: 'message', data: 'first\n second\n' } },
    ])
  })

  it('handles CR separators, empty data, repeated fields and explicit empty IDs', () => {
    const { items, parser } = collect()
    parser.push(encode('event: old\revent:\rid: old\rid:\rdata:\r\r'))
    expect(items).toEqual([
      { type: 'event', frame: { event: 'message', id: '', data: '' } },
    ])
  })

  it('emits retry without data and ignores invalid retries and NUL IDs', () => {
    const { items, parser } = collect()
    parser.push(
      encode(
        'retry: 5000\n\nretry: -1\nretry: 1.5\nretry: 9007199254740993\nretry: bad\nid: valid\nid: bad\0id\ndata: ok\n\n',
      ),
    )
    expect(items).toEqual([
      { type: 'retry', milliseconds: 5000 },
      { type: 'event', frame: { event: 'message', id: 'valid', data: 'ok' } },
    ])
  })

  it.each([
    'data: unfinished',
    'data: unfinished\n',
    'event: incomplete\ndata: value\r\n',
  ])('discards incomplete event at EOF: %j', (text) => {
    const { items, parser } = collect()
    parser.push(encode('data: complete\n\n' + text))
    parser.finish()
    expect(items).toEqual([
      { type: 'event', frame: { event: 'message', data: 'complete' } },
    ])
    expect(() => parser.push(encode('data: late\n\n'))).toThrow(
      'SSE parser: closed',
    )
  })

  it('rejects malformed UTF-8 and a truncated code point at EOF without exposing input', () => {
    for (const bytes of [new Uint8Array([0xff]), new Uint8Array([0xc3])]) {
      const { parser } = collect()
      expect(() => {
        parser.push(bytes)
        parser.finish()
      }).toThrow('SSE parser: invalid_utf8')
    }
  })

  it('bounds lines and aggregate frames, including unknown fields and comments', () => {
    for (const text of ['data: secret-too-long', ': abc\n: abc\n: abc\n']) {
      const { parser, items } = collect({
        maxLineCharacters: 10,
        maxFrameCharacters: 15,
      })
      expect(() => parser.push(encode(text))).toThrow(SseParserError)
      expect(items).toEqual([])
      expect(() => parser.finish()).toThrow('SSE parser: closed')
    }
  })

  it('resets the frame budget after dispatch and does not bound the entire stream', () => {
    const { parser, items } = collect({
      maxLineCharacters: 10,
      maxFrameCharacters: 10,
    })
    parser.push(encode('data: x\n\n'.repeat(2000)))
    parser.finish()
    expect(items).toHaveLength(2000)
  })

  it('rejects invalid limit configuration', () => {
    expect(() => collect({ maxLineCharacters: 0 })).toThrow(
      'SSE parser: invalid limits',
    )
  })
})
