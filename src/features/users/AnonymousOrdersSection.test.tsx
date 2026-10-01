import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import type { Order } from '@/features/orders/types'
import type { AnonymousOrdersPreview, LinkAnonymousOrdersResult } from './types'

/**
 * Integración (QA): hooks REALES + api-client mockeado. Cubre el preview
 * (GET /users/:id/anonymous-orders), la vinculación con UN POST con los
 * orderIds elegidos (el id del cliente solo en el path), que la lista se
 * vacía tras vincular (invalidación → refetch) y el manejo de errores.
 */

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock('@/lib/api-client', () => ({
  get: getMock,
  post: postMock,
  patch: vi.fn(),
  del: vi.fn(),
}))

import { AnonymousOrdersSection } from './AnonymousOrdersSection'

const USER_ID = 'user-1'

function makeOrder(id: string, overrides: Partial<Order> = {}): Order {
  return {
    id,
    userId: null,
    customerName: 'Juan',
    customerPhone: '51987654321',
    status: 'entregado',
    addressSnapshot: '{"fullAddress":"Av. Lima 123"}',
    total: 50,
    deliveryFee: 0,
    whatsappUrl: 'https://wa.me/51987654321?text=hola',
    whatsappSentAt: null,
    deliveredAt: '2026-09-28T17:00:00.000Z',
    cancelReason: null,
    items: [],
    user: null,
    createdAt: '2026-09-28T17:00:00.000Z',
    updatedAt: '2026-09-28T17:00:00.000Z',
    ...overrides,
  }
}

const orderA = makeOrder('aaaaaaaa-0000-4000-8000-000000000001')
const orderB = makeOrder('bbbbbbbb-0000-4000-8000-000000000002', {
  total: 35,
  status: 'pendiente',
  createdAt: '2026-09-25T17:00:00.000Z',
})
const orderC = makeOrder('cccccccc-0000-4000-8000-000000000003', {
  total: 28,
  createdAt: '2026-09-20T17:00:00.000Z',
})

function preview(orders: Order[]): AnonymousOrdersPreview {
  return { userId: USER_ID, phone: '51987654321', orders }
}

function apiError(status: number, message: string) {
  return new AxiosError('error', String(status), undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { success: false, statusCode: status, message },
  })
}

function renderSection(onLinked?: (r: LinkAnonymousOrdersResult) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AnonymousOrdersSection userId={USER_ID} onLinked={onLinked} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
})

describe('AnonymousOrdersSection', () => {
  it('carga el preview y muestra los pedidos anónimos', async () => {
    getMock.mockResolvedValue(preview([orderA, orderB, orderC]))
    renderSection()

    expect(await screen.findByText('#AAAAAAAA')).toBeInTheDocument()
    expect(getMock).toHaveBeenCalledWith(`/users/${USER_ID}/anonymous-orders`)
    expect(screen.getByText('#BBBBBBBB')).toBeInTheDocument()
    expect(screen.getByText('#CCCCCCCC')).toBeInTheDocument()
    expect(screen.getByText('28/09/2026')).toBeInTheDocument()
    expect(screen.getByText(/50\.00/)).toBeInTheDocument()
    expect(screen.getAllByText('Entregado')).toHaveLength(2)
    // Nada preseleccionado: el botón arranca deshabilitado.
    expect(screen.getByRole('button', { name: /Vincular seleccionados \(0\)/ })).toBeDisabled()
  })

  it('muestra "No hay pedidos sin cuenta" si el preview viene vacío', async () => {
    getMock.mockResolvedValue(preview([]))
    renderSection()

    expect(await screen.findByText('No hay pedidos sin cuenta.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Vincular/ })).not.toBeInTheDocument()
  })

  it('vincula solo los seleccionados en UN POST y la lista se vacía tras el refetch', async () => {
    const user = userEvent.setup()
    getMock
      .mockResolvedValueOnce(preview([orderA, orderB]))
      .mockResolvedValue(preview([]))
    let resolvePost: (v: unknown) => void = () => {}
    postMock.mockReturnValue(new Promise((r) => (resolvePost = r)))
    renderSection()

    await user.click(await screen.findByRole('checkbox', { name: 'Seleccionar pedido #AAAAAAAA' }))
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar pedido #BBBBBBBB' }))
    await user.click(screen.getByRole('button', { name: /Vincular seleccionados \(2\)/ }))

    // Loading state mientras el POST está en curso.
    expect(await screen.findByRole('button', { name: 'Vinculando…' })).toBeDisabled()

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith(`/users/${USER_ID}/link-anonymous-orders`, {
      orderIds: [orderA.id, orderB.id],
    })
    // El id del cliente viaja SOLO en el path (forbidNonWhitelisted → 400).
    expect(postMock.mock.calls[0][1]).not.toHaveProperty('userId')

    resolvePost({
      userId: USER_ID,
      linkedOrderIds: [orderA.id, orderB.id],
      deliveredTotalAdded: 50,
      totalSpent: 150,
    })

    expect(await screen.findByText('Vinculados correctamente ✅')).toBeInTheDocument()
    expect(await screen.findByText('No hay pedidos sin cuenta.')).toBeInTheDocument()
    expect(getMock).toHaveBeenCalledTimes(2)
  })

  it('no envía pedidos desmarcados', async () => {
    const user = userEvent.setup()
    getMock.mockResolvedValue(preview([orderA, orderB, orderC]))
    postMock.mockResolvedValue({})
    renderSection()

    await user.click(await screen.findByRole('checkbox', { name: 'Seleccionar todos' }))
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar pedido #BBBBBBBB' }))
    await user.click(screen.getByRole('button', { name: /Vincular seleccionados \(2\)/ }))

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith(`/users/${USER_ID}/link-anonymous-orders`, {
        orderIds: [orderA.id, orderC.id],
      }),
    )
  })

  it('409 al vincular: muestra el mensaje del backend y refresca el preview', async () => {
    const user = userEvent.setup()
    getMock.mockResolvedValue(preview([orderA]))
    postMock.mockRejectedValue(
      apiError(409, 'Estos pedidos no existen, ya tienen cliente o su celular no es 51987654321'),
    )
    renderSection()

    await user.click(await screen.findByRole('checkbox', { name: 'Seleccionar pedido #AAAAAAAA' }))
    await user.click(screen.getByRole('button', { name: /Vincular seleccionados \(1\)/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/ya tienen cliente/)
    expect(screen.queryByText('Vinculados correctamente ✅')).not.toBeInTheDocument()
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2))
  })

  it('error al cargar el preview: muestra el mensaje del backend y permite reintentar', async () => {
    const user = userEvent.setup()
    getMock.mockRejectedValueOnce(
      apiError(400, 'El cliente no tiene un celular válido: no hay con qué buscar sus pedidos anónimos'),
    )
    renderSection()

    expect(await screen.findByText(/no tiene un celular válido/)).toBeInTheDocument()

    getMock.mockResolvedValue(preview([orderA]))
    await user.click(screen.getByRole('button', { name: /Reintentar/i }))
    expect(await screen.findByText('#AAAAAAAA')).toBeInTheDocument()
  })

  it('llama a onLinked con la respuesta del POST (totalSpent actualizado) y el mensaje se va a los 2s', async () => {
    // Fake timers para no esperar 2s reales (intermitente con la suite en
    // paralelo). shouldAdvanceTime deja correr las promesas de React Query.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onLinked = vi.fn()
    const result: LinkAnonymousOrdersResult = {
      userId: USER_ID,
      linkedOrderIds: [orderA.id],
      deliveredTotalAdded: 50,
      totalSpent: 150,
    }
    getMock.mockResolvedValueOnce(preview([orderA])).mockResolvedValue(preview([]))
    postMock.mockResolvedValue(result)
    renderSection(onLinked)

    await user.click(await screen.findByRole('checkbox', { name: 'Seleccionar pedido #AAAAAAAA' }))
    await user.click(screen.getByRole('button', { name: /Vincular seleccionados \(1\)/ }))

    expect(await screen.findByText('Vinculados correctamente ✅')).toBeInTheDocument()
    expect(onLinked).toHaveBeenCalledWith(result)

    act(() => {
      vi.advanceTimersByTime(1900)
    })
    expect(screen.getByText('Vinculados correctamente ✅')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.queryByText('Vinculados correctamente ✅')).not.toBeInTheDocument()
  })

  it('no llama a onLinked si el POST falla', async () => {
    const user = userEvent.setup()
    const onLinked = vi.fn()
    getMock.mockResolvedValue(preview([orderA]))
    postMock.mockRejectedValue(apiError(409, 'Ya tienen cliente'))
    renderSection(onLinked)

    await user.click(await screen.findByRole('checkbox', { name: 'Seleccionar pedido #AAAAAAAA' }))
    await user.click(screen.getByRole('button', { name: /Vincular seleccionados \(1\)/ }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onLinked).not.toHaveBeenCalled()
  })
})
