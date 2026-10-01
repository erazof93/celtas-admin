import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Order } from '@/features/orders/types'
import type { AdminUser } from './types'

/**
 * Integración (QA): diálogo + hooks REALES + api-client mockeado. Regresión
 * del "Total gastado" desactualizado: UsersPage le pasa al diálogo una copia
 * del cliente tomada al abrirlo, así que tras vincular pedidos anónimos
 * entregados el Perfil seguía mostrando el total viejo hasta cerrar y
 * reabrir. Ahora se muestra el `totalSpent` que devuelve el POST.
 */

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock('@/lib/api-client', () => ({
  get: getMock,
  post: postMock,
  patch: vi.fn(),
  del: vi.fn(),
}))

vi.mock('@/features/auth/store', () => ({
  useAuthStore: (selector: (s: { user: { id: string; role: string } }) => unknown) =>
    selector({ user: { id: 'admin-1', role: 'admin' } }),
}))

import { UserDetailDialog } from './UserDetailDialog'

const customer: AdminUser = {
  id: 'user-1',
  email: 'cliente@example.com',
  fullName: 'Cliente Uno',
  provider: 'local',
  googleId: null,
  phone: '987654321',
  fcmToken: null,
  totalSpent: 100,
  role: 'cliente',
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
}

const anonymousOrder: Order = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  userId: null,
  customerName: 'Cliente',
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
}

const emptyPage = { items: [], meta: { page: 1, limit: 5, total: 0, totalPages: 0 } }

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
})

describe('UserDetailDialog — totalSpent tras vincular pedidos anónimos', () => {
  it('"Total gastado" se actualiza al instante con el totalSpent del POST, sin cerrar el diálogo', async () => {
    const user = userEvent.setup()
    let previewCalls = 0
    getMock.mockImplementation((url: string) => {
      if (url === '/users/user-1/anonymous-orders') {
        previewCalls += 1
        return Promise.resolve({
          userId: 'user-1',
          phone: '51987654321',
          orders: previewCalls === 1 ? [anonymousOrder] : [],
        })
      }
      if (url === '/users/user-1/addresses') return Promise.resolve([])
      return Promise.resolve(emptyPage)
    })
    postMock.mockResolvedValue({
      userId: 'user-1',
      linkedOrderIds: [anonymousOrder.id],
      deliveredTotalAdded: 50,
      totalSpent: 150,
    })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        {/* El prop `user` NO cambia: es la copia que guarda UsersPage. */}
        <UserDetailDialog user={customer} onOpenChange={() => {}} />
      </QueryClientProvider>,
    )

    const totalLabel = screen.getByText('Total gastado')
    const totalBlock = totalLabel.parentElement as HTMLElement
    expect(within(totalBlock).getByText('S/ 100.00')).toBeInTheDocument()

    await user.click(
      await screen.findByRole('checkbox', { name: 'Seleccionar pedido #AAAAAAAA' }),
    )
    await user.click(screen.getByRole('button', { name: /Vincular seleccionados \(1\)/ }))

    expect(await within(totalBlock).findByText('S/ 150.00')).toBeInTheDocument()
    expect(screen.getByText('Vinculados correctamente ✅')).toBeInTheDocument()
    expect(await screen.findByText('No hay pedidos sin cuenta.')).toBeInTheDocument()
  })
})
