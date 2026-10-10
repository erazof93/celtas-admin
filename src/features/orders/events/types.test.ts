import { describe, expect, it } from 'vitest'
import { createSseParser, type SseFrame } from '@/lib/sse-client'
import { decodeOrderStreamFrame, orderEventCursorSchema } from './types'

const payload = {
  v: 1,
  eventId: '6b37b28b-44b7-4805-bba4-1528d065df6b',
  orderId: 'b2867c30-334e-47fa-9a5c-8c8322c199c0',
  status: 'pendiente',
  occurredAt: '2026-10-08T15:00:00.000Z',
}
const frame = (
  event = 'order.created',
  data: unknown = payload,
  id = '9',
): SseFrame => ({ event, id, data: JSON.stringify(data) })

describe('orders SSE v1 contract', () => {
  it('decodes multiline JSON and does not inherit an order cursor into controls', () => {
    const results: unknown[] = []
    const parser = createSseParser((item) => {
      if (item.type === 'event')
        results.push(decodeOrderStreamFrame(item.frame))
    })
    const multiline = JSON.stringify(payload, null, 2)
      .split('\n')
      .map((line) => `data: ${line}`)
      .join('\n')
    parser.push(
      new TextEncoder().encode(
        `id: 12\nevent: order.updated\n${multiline}\n\nevent: stream.reset\ndata: {"v":1,"reason":"server_shutdown"}\n\n`,
      ),
    )
    parser.finish()
    expect(results).toEqual([
      { ok: true, event: { type: 'order.updated', cursor: '12', payload } },
      {
        ok: true,
        event: {
          type: 'stream.reset',
          payload: { v: 1, reason: 'server_shutdown' },
        },
      },
    ])
  })

  it('keeps cursors 9–12 and bigint maximum as exact strings through the wire parser', () => {
    const cursors = ['9', '10', '11', '12', '9223372036854775807']
    const results: unknown[] = []
    const parser = createSseParser((item) => {
      if (item.type === 'event')
        results.push(decodeOrderStreamFrame(item.frame))
    })
    parser.push(
      new TextEncoder().encode(
        cursors
          .map(
            (id) =>
              `id: ${id}\nevent: order.created\ndata: ${JSON.stringify(payload)}\n\n`,
          )
          .join(''),
      ),
    )
    parser.finish()
    expect(results).toEqual(
      cursors.map((cursor) => ({
        ok: true,
        event: { type: 'order.created', cursor, payload },
      })),
    )
  })

  it.each(['order.created', 'order.status_changed', 'order.updated'])(
    'accepts %s',
    (type) => {
      expect(decodeOrderStreamFrame(frame(type))).toEqual({
        ok: true,
        event: { type, cursor: '9', payload },
      })
    },
  )

  it.each(['stream.ready', 'stream.reset', 'auth.expiring', 'access.revoked'])(
    'accepts control %s without manufacturing a cursor',
    (type) => {
      const controls: Record<string, unknown> = {
        'stream.ready': {
          v: 1,
          headCursor: '12',
          floorCursor: '9',
          recovery: 'rest',
        },
        'stream.reset': { v: 1, reason: 'cursor_unavailable' },
        'auth.expiring': { v: 1, reason: 'reconnect_required' },
        'access.revoked': { v: 1, reason: 'role_changed' },
      }
      expect(
        decodeOrderStreamFrame({
          event: type,
          data: JSON.stringify(controls[type]),
        }),
      ).toEqual({ ok: true, event: { type, payload: controls[type] } })
    },
  )

  it.each([
    '',
    '01',
    '-1',
    '+1',
    '1.5',
    ' 9',
    '9\n',
    'abc',
    '9223372036854775808',
    '99999999999999999999',
  ])(
    'rejects noncanonical/out-of-range cursor %j without throwing',
    (cursor) => {
      expect(orderEventCursorSchema.safeParse(cursor).success).toBe(false)
      expect(
        decodeOrderStreamFrame(frame('order.created', payload, cursor)),
      ).toEqual({ ok: false, code: 'invalid_cursor' })
    },
  )

  it('accepts zero but rejects a missing order event cursor', () => {
    expect(orderEventCursorSchema.safeParse('0').success).toBe(true)
    expect(
      decodeOrderStreamFrame({
        event: 'order.created',
        data: JSON.stringify(payload),
      }),
    ).toEqual({ ok: false, code: 'invalid_cursor' })
  })

  it('rejects unknown events and malformed JSON with sanitized results', () => {
    expect(decodeOrderStreamFrame(frame('unknown'))).toEqual({
      ok: false,
      code: 'unknown_event',
    })
    expect(
      decodeOrderStreamFrame({
        event: 'order.created',
        id: '9',
        data: 'private-invalid-json',
      }),
    ).toEqual({ ok: false, code: 'invalid_json' })
  })

  it.each([
    null,
    [],
    { ...payload, v: 2 },
    { ...payload, status: 'unknown' },
    { ...payload, eventId: 'bad' },
    { ...payload, occurredAt: 'yesterday' },
    { ...payload, orderId: undefined },
    { success: true, data: payload },
  ])('rejects invalid order payload %#', (value) => {
    expect(decodeOrderStreamFrame(frame('order.created', value))).toEqual({
      ok: false,
      code: 'invalid_payload',
    })
  })

  it('strips uncontracted payload fields', () => {
    expect(
      decodeOrderStreamFrame(
        frame('order.created', { ...payload, privateField: 'secret' }),
      ),
    ).toEqual({
      ok: true,
      event: { type: 'order.created', cursor: '9', payload },
    })
  })

  it.each([
    [
      'stream.ready',
      { v: 1, headCursor: '9', floorCursor: '12', recovery: 'rest' },
    ],
    [
      'stream.ready',
      { v: 1, headCursor: 'bad', floorCursor: '0', recovery: 'rest' },
    ],
    ['stream.reset', { v: 1, reason: 'unknown' }],
    ['auth.expiring', { v: 2, reason: 'token_expired' }],
    ['access.revoked', { v: 1 }],
  ])('rejects malformed control %s', (type, value) => {
    expect(decodeOrderStreamFrame(frame(type as string, value))).toEqual({
      ok: false,
      code: 'invalid_payload',
    })
  })
})
