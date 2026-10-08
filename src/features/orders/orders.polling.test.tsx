import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import type { ReactNode } from 'react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/store'
import type { AuthUser } from '@/features/auth/types'
import type { Order, PaginatedOrders } from './types'

const { getMock, postMock, patchMock } = vi.hoisted(() => ({
  getMock: vi.fn(), postMock: vi.fn(), patchMock: vi.fn(),
}))
vi.mock('@/lib/api-client', () => ({ get: getMock, post: postMock, patch: patchMock }))
vi.mock('./OrderDetailDialog', () => ({ OrderDetailDialog: () => null }))
import { useCreateAdminOrder, useOrders, useUpdateOrderStatus } from './hooks'
import OrdersPage from './OrdersPage'

const admin = { id: 'admin-a', role: 'admin' } as AuthUser
const clients: QueryClient[] = []
function session(user = admin, confirmed = true) {
  useAuthStore.getState().setSession('test-token', user, confirmed)
}
function client() {
  const c = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false, gcTime: Infinity } } })
  clients.push(c)
  return c
}
function wrapper(c = client()) {
  return function Provider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={c}>{children}</QueryClientProvider>
  }
}
function order(id: string): Order {
  return { id, userId: null, user: null, customerName: 'QA ' + id, customerPhone: null,
    status: 'pendiente', addressSnapshot: '{}', total: 10, deliveryFee: 0,
    whatsappUrl: '', whatsappSentAt: null, deliveredAt: null, cancelReason: null,
    items: [], createdAt: '2026-10-07T10:00:00Z', updatedAt: '2026-10-07T10:00:00Z' }
}
function list(id = 'aaaaaaaa', page = 1): PaginatedOrders {
  return { items: [order(id)], meta: { page, limit: 10, total: 20, totalPages: 2 } }
}
async function tick(ms = 1) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}
function auto() { return renderHook(() => useOrders(1, 10, undefined, undefined, true, true), { wrapper: wrapper() }) }

beforeEach(() => {
  vi.useFakeTimers()
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
  session()
  getMock.mockReset().mockResolvedValue(list())
  postMock.mockReset().mockResolvedValue(order('manual'))
  patchMock.mockReset().mockResolvedValue(order('updated'))
})
afterEach(() => {
  cleanup()
  clients.splice(0).forEach(c => c.clear())
  vi.restoreAllMocks()
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
  useAuthStore.getState().clearSession()
  vi.useRealTimers()
})

describe('Pedidos: polling opt-in', () => {
  it('actualiza datos cada 30 segundos sin remontar', async () => {
    getMock.mockResolvedValueOnce(list()).mockResolvedValue(list('bbbbbbbb'))
    const q = auto()
    await tick()
    expect(q.result.current.data?.items[0].id).toBe('aaaaaaaa')
    await tick(29_000)
    expect(getMock).toHaveBeenCalledTimes(1)
    await tick(1_000)
    expect(getMock).toHaveBeenCalledTimes(2)
    expect(q.result.current.data?.items[0].id).toBe('bbbbbbbb')
  })
  it('los consumidores existentes no hacen polling', async () => {
    renderHook(() => useOrders(1, 10), { wrapper: wrapper() })
    await tick()
    await tick(120_000)
    expect(getMock).toHaveBeenCalledTimes(1)
  })
  it('pestaña oculta cancela y pausa; volver refresca aunque el dato sea reciente', async () => {
    auto()
    await tick()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => { window.dispatchEvent(new Event('visibilitychange')) })
    await tick(120_000)
    expect(getMock).toHaveBeenCalledTimes(1)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    await act(async () => { window.dispatchEvent(new Event('visibilitychange')) })
    await tick()
    expect(getMock).toHaveBeenCalledTimes(2)
  })
  it('no consulta al montar oculto y recupera al volver', async () => {
    focusManager.setFocused(false)
    auto()
    await tick(60_000)
    expect(getMock).not.toHaveBeenCalled()
    await act(async () => { focusManager.setFocused(true) })
    await tick()
    expect(getMock).toHaveBeenCalledTimes(1)
  })
  it('offline pausa; reconexión refresca una sola vez', async () => {
    auto()
    await tick()
    await act(async () => { onlineManager.setOnline(false) })
    await tick(120_000)
    expect(getMock).toHaveBeenCalledTimes(1)
    await act(async () => { onlineManager.setOnline(true) })
    await tick()
    expect(getMock).toHaveBeenCalledTimes(2)
  })
  it('montar offline no inicia GET', async () => {
    onlineManager.setOnline(false)
    auto()
    await tick(60_000)
    expect(getMock).not.toHaveBeenCalled()
  })
  it('una consulta lenta no se superpone y consume AbortSignal', async () => {
    getMock.mockImplementation(() => new Promise(() => {}))
    const q = auto()
    await tick(90_000)
    expect(getMock).toHaveBeenCalledTimes(1)
    const signal = getMock.mock.calls[0][1].signal as AbortSignal
    expect(signal.aborted).toBe(false)
    q.unmount()
    expect(signal.aborted).toBe(true)
  })
  it('un refetch lento con datos previos tampoco se superpone', async () => {
    let finish!: (data: PaginatedOrders) => void
    getMock.mockResolvedValueOnce(list()).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const q = auto()
    await tick()
    await tick(30_000)
    const signal = getMock.mock.calls[1][1].signal as AbortSignal
    await tick(90_000)
    expect(getMock).toHaveBeenCalledTimes(2)
    expect(signal.aborted).toBe(false)
    await act(async () => { finish(list('finished')) })
    await tick()
    expect(q.result.current.data?.items[0].id).toBe('finished')
  })
  it('refresh de token en la misma sesión no reinicia ni bloquea el polling', async () => {
    auto()
    await tick()
    await act(async () => { useAuthStore.setState({ accessToken: 'refreshed-token' }) })
    expect(getMock).toHaveBeenCalledTimes(1)
    await tick(30_000)
    expect(getMock).toHaveBeenCalledTimes(2)
  })
  it.each([408, 429, 500, 503])('HTTP %s utiliza intervalo de recuperación', async (status) => {
    getMock.mockRejectedValueOnce(new AxiosError('Temporary', undefined, undefined, undefined,
      { status } as never)).mockResolvedValue(list())
    auto()
    await tick(119_000)
    expect(getMock).toHaveBeenCalledTimes(1)
    await tick(1_001)
    expect(getMock).toHaveBeenCalledTimes(2)
  })
  it('errores persistentes mantienen 120s sin acelerar los reintentos', async () => {
    getMock.mockRejectedValueOnce(new AxiosError('Network Error'))
      .mockRejectedValueOnce(new AxiosError('Network Error')).mockResolvedValue(list())
    auto()
    await tick()
    await tick(120_000)
    expect(getMock).toHaveBeenCalledTimes(2)
    await tick(119_000)
    expect(getMock).toHaveBeenCalledTimes(2)
    await tick(1_000)
    expect(getMock).toHaveBeenCalledTimes(3)
    await tick(30_000)
    expect(getMock).toHaveBeenCalledTimes(4)
  })
  it('ocultar cancela la consulta pendiente', async () => {
    getMock.mockImplementation(() => new Promise(() => {}))
    auto()
    await tick()
    const signal = getMock.mock.calls[0][1].signal as AbortSignal
    await act(async () => { focusManager.setFocused(false) })
    expect(signal.aborted).toBe(true)
  })
  it.each(['logout', 'role', 'unverified'] as const)('%s detiene polling', async (change) => {
    auto()
    await tick()
    await act(async () => {
      if (change === 'logout') useAuthStore.getState().clearSession()
      else if (change === 'role') useAuthStore.setState({ user: { ...admin, role: 'cliente' } })
      else useAuthStore.setState({ roleStatus: 'unverified' })
    })
    await tick(120_000)
    expect(getMock).toHaveBeenCalledTimes(1)
  })
  it.each(['cliente', 'unverified', 'no-token'] as const)('sin autorización %s no consulta', async (kind) => {
    if (kind === 'cliente') session({ ...admin, role: 'cliente' })
    else if (kind === 'unverified') session(admin, false)
    else useAuthStore.setState({ accessToken: null })
    auto()
    await tick(60_000)
    expect(getMock).not.toHaveBeenCalled()
  })
  it('respuesta antigua no contamina nueva identidad aunque el transporte ignore abort', async () => {
    let resolveOld!: (data: PaginatedOrders) => void
    getMock.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
      .mockResolvedValue(list('bbbbbbbb'))
    const q = auto()
    await tick()
    const signal = getMock.mock.calls[0][1].signal as AbortSignal
    await act(async () => { session({ ...admin, id: 'admin-b' }) })
    await tick()
    expect(signal.aborted).toBe(true)
    expect(q.result.current.data?.items[0].id).toBe('bbbbbbbb')
    await act(async () => { resolveOld(list('old')) })
    await tick()
    expect(q.result.current.data?.items[0].id).toBe('bbbbbbbb')
  })
  it('otra sesión de la misma identidad tampoco recibe respuestas antiguas', async () => {
    let resolveOld!: (data: PaginatedOrders) => void
    getMock.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
      .mockResolvedValue(list('new-session'))
    const q = auto()
    await tick()
    await act(async () => { session() })
    await tick()
    await act(async () => { resolveOld(list('old-session')) })
    await tick()
    expect(q.result.current.data?.items[0].id).toBe('new-session')
  })
  it('errores de red espacian a 120s y éxito restaura 30s sin retries inmediatos', async () => {
    getMock.mockResolvedValueOnce(list()).mockRejectedValueOnce(new AxiosError('Network Error'))
      .mockResolvedValue(list('recovered'))
    const q = auto()
    await tick()
    await tick(30_000)
    expect(getMock).toHaveBeenCalledTimes(2)
    expect(q.result.current.data?.items[0].id).toBe('aaaaaaaa')
    await tick(119_000)
    expect(getMock).toHaveBeenCalledTimes(2)
    await tick(1_000)
    expect(getMock).toHaveBeenCalledTimes(3)
    await tick(30_000)
    expect(getMock).toHaveBeenCalledTimes(4)
  })
  it('403 no causa polling/reintentos infinitos', async () => {
    getMock.mockRejectedValue(new AxiosError('Forbidden', undefined, undefined, undefined,
      { status: 403 } as never))
    auto()
    await tick(300_000)
    expect(getMock).toHaveBeenCalledTimes(1)
  })
  it('mantiene parámetros de página y filtros en cada GET', async () => {
    renderHook(() => useOrders(2, 10, 'entregado', 'customer', true, true), { wrapper: wrapper() })
    await tick()
    await tick(30_000)
    expect(getMock).toHaveBeenCalledTimes(2)
    for (const [url, config] of getMock.mock.calls) {
      expect(url).toBe('/orders')
      expect(config.params).toEqual({ page: 2, limit: 10, status: 'entregado', userId: 'customer' })
    }
  })
  it.each(['manual', 'status'] as const)('invalidación %s refresca inmediatamente el listado activo', async (kind) => {
    renderHook(() => {
      const orders = useOrders(1, 10, undefined, undefined, true, true)
      const manual = useCreateAdminOrder()
      const status = useUpdateOrderStatus()
      return { orders, manual, status }
    }, { wrapper: wrapper() })
    await tick()
    const mutations = renderHook(() => ({ manual: useCreateAdminOrder(), status: useUpdateOrderStatus() }),
      { wrapper: wrapper(clients[0]) })
    await act(async () => {
      if (kind === 'manual') await mutations.result.current.manual.mutateAsync({} as never)
      else await mutations.result.current.status.mutateAsync({ id: 'order', status: 'confirmado' })
    })
    await tick()
    expect(getMock).toHaveBeenCalledTimes(2)
  })
})

describe('OrdersPage con consultas reales de TanStack', () => {
  function ManualPage() {
    const create = useCreateAdminOrder()
    return <><button onClick={() => create.mutate({} as never)}>Guardar QA</button><Link to="/orders">Volver a pedidos</Link></>
  }
  function routed() {
    const Provider = wrapper()
    return render(<Provider><MemoryRouter initialEntries={['/orders']}><Routes>
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/orders/create-manual" element={<ManualPage />} />
      <Route path="/dashboard" element={<div>Dashboard</div>} />
    </Routes></MemoryRouter></Provider>)
  }
  it('un pedido nuevo aparece en la tabla sin recargar', async () => {
    getMock.mockResolvedValueOnce(list()).mockResolvedValue(list('bbbbbbbb'))
    routed()
    await tick()
    expect(screen.getByText('#AAAAAAAA')).toBeInTheDocument()
    await tick(30_000)
    expect(screen.getByText('#BBBBBBBB')).toBeInTheDocument()
  })
  it('crear manual detiene polling; invalidar y volver hace un solo GET inmediato', async () => {
    routed()
    await tick()
    fireEvent.click(screen.getByRole('link', { name: /Crear pedido manual/ }))
    await tick(120_000)
    expect(getMock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar QA' }))
    await tick()
    expect(postMock).toHaveBeenCalledTimes(1)
    expect(getMock).toHaveBeenCalledTimes(1)
    getMock.mockResolvedValue(list('cccccccc'))
    fireEvent.click(screen.getByRole('link', { name: 'Volver a pedidos' }))
    await tick()
    expect(getMock).toHaveBeenCalledTimes(2)
    expect(screen.getByText('#CCCCCCCC')).toBeInTheDocument()
  })
  it('volver con caché fresca también consulta sin esperar al intervalo', async () => {
    routed()
    await tick()
    fireEvent.click(screen.getByRole('link', { name: /Crear pedido manual/ }))
    await tick()
    fireEvent.click(screen.getByRole('link', { name: 'Volver a pedidos' }))
    await tick()
    expect(getMock).toHaveBeenCalledTimes(2)
  })
  it('paginación conserva página durante los refrescos y Dashboard deja de consultar', async () => {
    const Provider = wrapper()
    render(<Provider><MemoryRouter initialEntries={['/orders']}>
      <Link to="/dashboard">Ir a Dashboard</Link>
      <Routes><Route path="/orders" element={<OrdersPage />} />
        <Route path="/dashboard" element={<div>Dashboard QA</div>} /></Routes>
    </MemoryRouter></Provider>)
    await tick()
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }))
    await tick()
    expect(getMock.mock.calls.at(-1)?.[1].params.page).toBe(2)
    await tick(30_000)
    expect(getMock.mock.calls.at(-1)?.[1].params.page).toBe(2)
    const count = getMock.mock.calls.length
    fireEvent.click(screen.getByRole('link', { name: 'Ir a Dashboard' }))
    await tick(120_000)
    expect(getMock).toHaveBeenCalledTimes(count)
  })

  it('filtrar vuelve a página 1 y el polling conserva el estado elegido', async () => {
    routed()
    await tick()
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }))
    await tick()
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filtrar por estado' }), { key: 'ArrowDown' })
    await tick()
    fireEvent.keyDown(screen.getByRole('option', { name: 'Entregado' }), { key: 'Enter' })
    await tick()
    expect(getMock.mock.calls.at(-1)?.[1].params).toEqual({ page: 1, limit: 10, status: 'entregado' })
    await tick(30_000)
    expect(getMock.mock.calls.at(-1)?.[1].params).toEqual({ page: 1, limit: 10, status: 'entregado' })
  })

})
