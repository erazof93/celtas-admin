import { afterEach, expect, it, vi } from 'vitest'
import api from '@/lib/api-client'
import { orderEventsEnabled } from './service'
import { localOrderAlertsEnabled } from '../alerts/environment'

const initialBase = api.defaults.baseURL
afterEach(() => {
  api.defaults.baseURL = initialBase
  vi.unstubAllEnvs()
})

it.each([
  [false, undefined, 'true', 'https://api.example.invalid', false, false],
  [false, 'false', 'true', 'https://api.example.invalid', false, false],
  [false, 'TRUE', 'true', 'https://api.example.invalid', false, false],
  [false, 'true', 'false', 'https://api.example.invalid/api', true, true],
  [false, 'true', 'false', 'http://localhost:3001', true, true],
  [false, 'true', 'false', 'http://127.0.0.1:3001', true, true],
  [false, 'true', 'false', 'http://api.example.invalid', false, false],
  [
    false,
    'true',
    'false',
    'https://user:password@api.example.invalid',
    false,
    false,
  ],
  [
    false,
    'true',
    'false',
    'https://api.example.invalid?token=invalid',
    false,
    false,
  ],
  [
    false,
    'true',
    'false',
    'https://api.example.invalid#fragment',
    false,
    false,
  ],
  [false, 'true', 'false', 'ftp://localhost:3001', false, false],
  [false, 'true', 'false', '', false, false],
  [false, 'true', 'false', '/relative-api', false, false],
  [true, 'true', 'false', 'http://localhost:3001', false, true],
  [true, 'true', 'true', 'https://api.example.invalid', false, false],
  [true, undefined, 'true', 'http://localhost:3001/api', true, true],
  [true, undefined, 'false', 'http://localhost:3001', false, true],
])(
  'real gates: DEV=%s production=%s development=%s api=%s',
  (dev, production, development, url, stream, alerts) => {
    vi.stubEnv('DEV', dev)
    vi.stubEnv('VITE_ORDER_EVENTS_PRODUCTION_ENABLED', production)
    vi.stubEnv('VITE_ORDER_EVENTS_ENABLED', development)
    vi.stubEnv('VITE_API_BASE_URL', url)
    api.defaults.baseURL = url
    expect(orderEventsEnabled()).toBe(stream)
    expect(localOrderAlertsEnabled()).toBe(alerts)
  },
)
