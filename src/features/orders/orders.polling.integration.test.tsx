import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import {
  AxiosError,
  CanceledError,
  type InternalAxiosRequestConfig,
} from 'axios'
import api from '@/lib/api-client'
import ProtectedRoute from '@/routes/ProtectedRoute'
import {
  getRefreshToken,
  setRefreshToken,
  useAuthStore,
} from '@/features/auth/store'
import type { AuthUser } from '@/features/auth/types'
import OrdersPage from './OrdersPage'
import { useCreateAdminOrder } from './hooks'
import type { Order, PaginatedOrders } from './types'

const admin = {
  id: 'admin-a',
  email: 'qa@example.invalid',
  role: 'admin',
} as AuthUser
const initialAdapter = api.defaults.adapter
let client: QueryClient
let calls: InternalAxiosRequestConfig[]
let handler: (config: InternalAxiosRequestConfig) => Promise<unknown>
function list(id = 'aaaaaaaa'): PaginatedOrders {
  const order = {
    id,
    userId: null,
    user: null,
    customerName: 'QA',
    customerPhone: null,
    status: 'pendiente',
    addressSnapshot: '{}',
    total: 10,
    deliveryFee: 0,
    whatsappUrl: '',
    whatsappSentAt: null,
    deliveredAt: null,
    cancelReason: null,
    items: [],
    createdAt: '2026-10-07T10:00:00Z',
    updatedAt: '2026-10-07T10:00:00Z',
  } as Order
  return {
    items: [order],
    meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
  }
}
// Only the transport is simulated. It honors Axios timeout and AbortSignal.
function transport(
  config: InternalAxiosRequestConfig,
  data: unknown,
  status = 200,
  delay = 5,
) {
  // Preserve the response contract for both independent list requests.
  if (
    config.url === '/orders' &&
    status < 400 &&
    data &&
    typeof data === 'object' &&
    'meta' in data
  ) {
    const page = data as PaginatedOrders
    data = {
      ...page,
      meta: {
        ...page.meta,
        page: config.params.page,
        limit: config.params.limit,
      },
    }
  }
  return new Promise((resolve, reject) => {
    let responseTimer: ReturnType<typeof setTimeout> | undefined
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined
    const finish = (error?: Error) => {
      clearTimeout(responseTimer)
      clearTimeout(timeoutTimer)
      config.signal?.removeEventListener?.('abort', abort)
      if (error) reject(error)
      else
        resolve({
          config,
          status,
          statusText: '',
          headers: {},
          data: { success: true, data },
        })
    }
    const abort = () => finish(new CanceledError('Canceled', config))
    if (config.signal?.aborted) {
      abort()
      return
    }
    config.signal?.addEventListener?.('abort', abort)
    if (Number.isFinite(delay))
      responseTimer = setTimeout(() => {
        if (status >= 400)
          finish(
            new AxiosError(
              'HTTP error',
              'ERR_BAD_RESPONSE',
              config,
              undefined,
              { config, status, statusText: '', headers: {}, data: {} },
            ),
          )
        else finish()
      }, delay)
    if (config.timeout)
      timeoutTimer = setTimeout(
        () => finish(new AxiosError('timeout', 'ECONNABORTED', config)),
        config.timeout,
      )
  })
}
// The table and tray each poll once; authentication refresh remains shared.
function expectOrderReads(expected: number) {
  for (const limit of [10, 100]) {
    expect(
      calls.filter((c) => c.url === '/orders' && c.params?.limit === limit),
    ).toHaveLength(expected)
  }
  expect(count('/orders')).toBe(expected * 2)
}
function count(url: string) {
  return calls.filter((c) => c.url === url).length
}
async function tick(ms = 20) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
function Manual() {
  const create = useCreateAdminOrder()
  return (
    <>
      <button onClick={() => create.mutate({} as never)}>Guardar QA</button>
      <Link to="/orders">Volver a pedidos</Link>
    </>
  )
}
function mount() {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/orders']}>
        <Routes>
          <Route path="/login" element={<div>Login QA</div>} />
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <Link to="/dashboard">Dashboard QA</Link>
                <Routes>
                  <Route path="/orders" element={<OrdersPage />} />
                  <Route path="/orders/create-manual" element={<Manual />} />
                  <Route path="/dashboard" element={<div>Otra pantalla</div>} />
                </Routes>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  calls = []
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000, gcTime: Infinity },
    },
  })
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
  useAuthStore.getState().clearSession()
  useAuthStore.getState().setSession('old-access', admin, true)
  setRefreshToken('qa-refresh')
  handler = (c) => transport(c, c.url === '/users/me' ? admin : list())
  api.defaults.adapter = async (c) => {
    calls.push(c)
    return (await (c.url === '/settings'
      ? transport(c, [])
      : handler(c))) as never
  }
})
afterEach(async () => {
  cleanup()
  useAuthStore.getState().clearSession()
  await tick()
  client.clear()
  api.defaults.adapter = initialAdapter
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
  vi.useRealTimers()
})
describe('Polling integrado: guard, interceptores y transporte', () => {
  it('403 persistente con perfil admin hace un GET y una reconciliación, sin ciclo', async () => {
    handler = (c) => transport(c, admin, c.url === '/orders' ? 403 : 200)
    mount()
    await tick(250)
    expectOrderReads(1)
    expect(count('/users/me')).toBe(1)
    expect(
      screen.getByText('No se pudo autorizar el acceso a pedidos'),
    ).toBeInTheDocument()
    await tick(300_000)
    expectOrderReads(1)
  })
  it('el bloqueo sobrevive foco, reconexión y navegación; recuperación requiere acción explícita', async () => {
    let forbidden = true
    handler = (c) =>
      transport(
        c,
        c.url === '/users/me' ? admin : list(),
        c.url === '/orders' && forbidden ? 403 : 200,
      )
    mount()
    await tick()
    await act(async () => {
      focusManager.setFocused(false)
      onlineManager.setOnline(false)
    })
    await act(async () => {
      focusManager.setFocused(true)
      onlineManager.setOnline(true)
    })
    await tick()
    fireEvent.click(screen.getByRole('link', { name: 'Crear pedido manual' }))
    fireEvent.click(screen.getByRole('link', { name: 'Volver a pedidos' }))
    await tick()
    expectOrderReads(1)
    forbidden = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar acceso' }))
    await tick()
    expectOrderReads(2)
    expect(
      within(screen.getByRole('table')).getByText('#AAAAAAAA'),
    ).toBeInTheDocument()
    await tick(30_000)
    expectOrderReads(3)
  })
  it('reintentar con 403 persistente hace solo un intento adicional', async () => {
    handler = (c) => transport(c, admin, c.url === '/orders' ? 403 : 200)
    mount()
    await tick()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar acceso' }))
    await tick(300_000)
    expectOrderReads(2)
    expect(count('/users/me')).toBe(2)
  })
  it('rol degradado muestra Acceso denegado y no expone la tabla', async () => {
    handler = (c) =>
      transport(
        c,
        { ...admin, role: 'cliente' },
        c.url === '/orders' ? 403 : 200,
      )
    mount()
    await tick(120_000)
    expectOrderReads(1)
    expect(screen.getByText('Acceso denegado')).toBeInTheDocument()
    expect(screen.queryByText('#AAAAAAAA')).not.toBeInTheDocument()
  })
  it('otra sesión limpia el bloqueo sin recuperar respuestas de la anterior', async () => {
    handler = (c) => transport(c, admin, c.url === '/orders' ? 403 : 200)
    mount()
    await tick()
    handler = (c) => transport(c, list('bbbbbbbb'))
    await act(async () => {
      useAuthStore
        .getState()
        .setSession('new-session', { ...admin, id: 'admin-b' }, true)
    })
    await tick()
    expectOrderReads(2)
    expect(
      within(screen.getByRole('table')).getByText('#BBBBBBBB'),
    ).toBeInTheDocument()
    expect(useAuthStore.getState().ordersAccessBlocked).toBeNull()
  })
  it('401 refresca una sola vez y reintenta con la nueva credencial', async () => {
    handler = (c) =>
      c.url === '/auth/refresh'
        ? transport(c, {
            accessToken: 'new-access',
            refreshToken: 'rotated',
            user: admin,
          })
        : transport(
            c,
            list(),
            c.headers.Authorization === 'Bearer new-access' ? 200 : 401,
          )
    mount()
    await tick(50)
    expect(count('/auth/refresh')).toBe(1)
    expectOrderReads(2)
    expect(
      within(screen.getByRole('table')).getByText('#AAAAAAAA'),
    ).toBeInTheDocument()
    await tick(30_000)
    expect(count('/auth/refresh')).toBe(1)
  })
  it('401 después del refresh bloquea automáticamente sin iniciar otro refresh', async () => {
    handler = (c) =>
      c.url === '/auth/refresh'
        ? transport(c, {
            accessToken: 'new-access',
            refreshToken: 'rotated',
            user: admin,
          })
        : transport(c, {}, 401)
    mount()
    await tick(300_000)
    expectOrderReads(2)
    expect(count('/auth/refresh')).toBe(1)
    expect(
      screen.getByText('No se pudo autorizar el acceso a pedidos'),
    ).toBeInTheDocument()
  })
  it('refresh lento se comparte y navegar no lo cancela para otro consumidor', async () => {
    handler = (c) =>
      c.url === '/auth/refresh'
        ? transport(
            c,
            { accessToken: 'new-access', refreshToken: 'rotated', user: admin },
            200,
            1000,
          )
        : transport(
            c,
            list(),
            c.headers.Authorization === 'Bearer new-access' ? 200 : 401,
          )
    mount()
    await tick()
    let otherStatus = 'pending'
    void api.get('/rewards').then(
      () => {
        otherStatus = 'success'
      },
      () => {
        otherStatus = 'error'
      },
    )
    await tick()
    fireEvent.click(screen.getByRole('link', { name: 'Dashboard QA' }))
    await tick(1100)
    await tick(20)
    expect(otherStatus).toBe('success')
    expect(count('/auth/refresh')).toBe(1)
    expectOrderReads(1)
    expect(calls.find((c) => c.url === '/auth/refresh')?.signal?.aborted).toBe(
      false,
    )
    await tick(120_000)
    expectOrderReads(1)
  })
  it('refresh excede 90s, termina sin restaurar tokens y permite recuperarse', async () => {
    handler = (c) =>
      c.url === '/auth/refresh'
        ? transport(c, {}, 200, Infinity)
        : transport(c, {}, 401)
    mount()
    await tick(89_000)
    expect(count('/auth/refresh')).toBe(1)
    await tick(1020)
    expect(
      screen.getByText('No se pudieron cargar los pedidos'),
    ).toBeInTheDocument()
    expect(useAuthStore.getState().accessToken).toBe('old-access')
    handler = (c) => transport(c, list('recovered'))
    await tick(120_010)
    expect(
      within(screen.getByRole('table')).getByText('#RECOVERE'),
    ).toBeInTheDocument()
    expectOrderReads(2)
    await tick(30_000)
    expectOrderReads(3)
  })
  it('fallo temporal de refresh conserva sesión y no genera retries inmediatos', async () => {
    handler = (c) => transport(c, {}, c.url === '/auth/refresh' ? 503 : 401)
    mount()
    await tick(119_000)
    expect(count('/auth/refresh')).toBe(1)
    expect(useAuthStore.getState().accessToken).toBe('old-access')
    handler = (c) => transport(c, list())
    await tick(1100)
    expect(
      within(screen.getByRole('table')).getByText('#AAAAAAAA'),
    ).toBeInTheDocument()
  })
  it('refresh definitivamente inválido limpia la sesión sin otro refresh', async () => {
    handler = (c) => transport(c, {}, 401)
    mount()
    await tick(100)
    expect(count('/auth/refresh')).toBe(1)
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(screen.getByText('Login QA')).toBeInTheDocument()
    await tick(120_000)
    expect(count('/auth/refresh')).toBe(1)
  })
  it('GET de pedidos también expira a los 90s sin solicitudes superpuestas', async () => {
    handler = (c) => transport(c, list(), 200, Infinity)
    mount()
    await tick(89_000)
    expectOrderReads(1)
    for (const request of calls.filter((c) => c.url === '/orders')) {
      expect(request.timeout).toBe(90_000)
    }
    await tick(1020)
    expect(
      screen.getByText('No se pudieron cargar los pedidos'),
    ).toBeInTheDocument()
    expectOrderReads(1)
  })
  it('logout durante refresh cancela su transporte y no restaura la sesión', async () => {
    handler = (c) =>
      c.url === '/auth/refresh'
        ? transport(
            c,
            { accessToken: 'new-access', refreshToken: 'rotated', user: admin },
            200,
            1000,
          )
        : transport(c, {}, 401)
    mount()
    await tick()
    const refresh = calls.find((c) => c.url === '/auth/refresh')!
    await act(async () => {
      useAuthStore.getState().clearSession()
    })
    await tick(2000)
    expect(refresh.signal?.aborted).toBe(true)
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })
  it('cambio de identidad durante refresh no restaura tokens anteriores', async () => {
    handler = (c) =>
      c.url === '/auth/refresh'
        ? transport(
            c,
            {
              accessToken: 'old-result',
              refreshToken: 'old-rotated',
              user: admin,
            },
            200,
            1000,
          )
        : transport(c, {}, 401)
    mount()
    await tick()
    const refresh = calls.find((c) => c.url === '/auth/refresh')!
    handler = (c) => transport(c, list('bbbbbbbb'))
    await act(async () => {
      useAuthStore
        .getState()
        .setSession('new-identity', { ...admin, id: 'admin-b' }, true)
    })
    await tick(2000)
    expect(refresh.signal?.aborted).toBe(true)
    expect(useAuthStore.getState().accessToken).toBe('new-identity')
    expect(
      within(screen.getByRole('table')).getByText('#BBBBBBBB'),
    ).toBeInTheDocument()
  })
  it('una respuesta tardía del listado se cancela al cambiar de identidad', async () => {
    handler = (c) => transport(c, list('old-data'), 200, 1000)
    mount()
    await tick()
    const old = calls.find((c) => c.url === '/orders')!
    handler = (c) => transport(c, list('bbbbbbbb'))
    await act(async () => {
      useAuthStore
        .getState()
        .setSession('new-identity', { ...admin, id: 'admin-b' }, true)
    })
    await tick(2000)
    expect(old.signal?.aborted).toBe(true)
    expect(
      within(screen.getByRole('table')).getByText('#BBBBBBBB'),
    ).toBeInTheDocument()
    expect(screen.queryByText('#OLD-DATA')).not.toBeInTheDocument()
  })
  it('fallo temporal conserva tabla y aviso; recuperación elimina aviso y vuelve a 30s', async () => {
    mount()
    await tick()
    handler = (c) => transport(c, {}, 503)
    await tick(30_010)
    expect(
      within(screen.getByRole('table')).getByText('#AAAAAAAA'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Los pedidos podrían estar desactualizados'),
    ).toBeInTheDocument()
    await tick(119_000)
    expectOrderReads(2)
    handler = (c) => transport(c, list('bbbbbbbb'))
    await tick(1100)
    expect(
      within(screen.getByRole('table')).getByText('#BBBBBBBB'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Los pedidos podrían estar desactualizados'),
    ).not.toBeInTheDocument()
    await tick(30_000)
    expectOrderReads(4)
  })
  it('403 con caché no deja visible la tabla anterior', async () => {
    mount()
    await tick()
    handler = (c) => transport(c, admin, c.url === '/orders' ? 403 : 200)
    await tick(30_050)
    expect(screen.queryByText('#AAAAAAAA')).not.toBeInTheDocument()
    expect(
      screen.getByText('No se pudo autorizar el acceso a pedidos'),
    ).toBeInTheDocument()
    await tick(120_000)
    expectOrderReads(2)
  })
  it('manual invalida la consulta inactiva y regresar hace un único GET inmediato', async () => {
    mount()
    await tick()
    fireEvent.click(screen.getByRole('link', { name: 'Crear pedido manual' }))
    handler = (c) =>
      transport(
        c,
        c.url === '/orders/admin' ? list().items[0] : list('bbbbbbbb'),
      )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar QA' }))
    await tick()
    expect(count('/orders/admin')).toBe(1)
    expectOrderReads(1)
    fireEvent.click(screen.getByRole('link', { name: 'Volver a pedidos' }))
    await tick()
    expectOrderReads(2)
    expect(
      within(screen.getByRole('table')).getByText('#BBBBBBBB'),
    ).toBeInTheDocument()
  })
})
