import { afterEach, expect, it, vi } from 'vitest'
import { localOrderAlertsEnabled } from './environment'
afterEach(() => vi.unstubAllEnvs())
it.each([
  [false, 'http://localhost:3000', false],
  [true, 'https://backend-celtas.onrender.com', false],
  [true, 'http://localhost:3000', true],
  [true, 'http://127.0.0.1:5000', true],
  [true, 'http://name:password@localhost:3000', false],
])('gates alert behavior to local development: %s %s', (dev, api, expected) => {
  vi.stubEnv('DEV', dev)
  vi.stubEnv('VITE_API_BASE_URL', api)
  expect(localOrderAlertsEnabled()).toBe(expected)
})
