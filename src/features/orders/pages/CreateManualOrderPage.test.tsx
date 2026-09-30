import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AxiosError, AxiosHeaders } from 'axios'
import CreateManualOrderPage from './CreateManualOrderPage'
import type { Beverage, ExtraPortion, FriesType, MenuItem } from '../../menu/types'
import type { AdminUser, UserAddress } from '../../users/types'
import type { DeliveryLocation } from '../components/DeliveryCalculator'
import type { CreateOrderAdminInput } from '../manual-order'

vi.setConfig({ testTimeout: 15_000 })

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))

const menuState: { data: MenuItem[] | undefined; isLoading: boolean; isError: boolean; refetch: () => void } =
  { data: [], isLoading: false, isError: false, refetch: vi.fn() }
const usersState: {
  data: { items: AdminUser[]; meta: { page: number; limit: number; total: number; totalPages: number } } | undefined
  isLoading: boolean
  isError: boolean
} = { data: undefined, isLoading: false, isError: false }

vi.mock('../../menu/items/hooks', () => ({ useMenuItems: () => menuState }))
const addressesState: { data: UserAddress[] | undefined; isLoading: boolean; isError: boolean } =
  { data: [], isLoading: false, isError: false }
const { useUserAddressesMock } = vi.hoisted(() => ({ useUserAddressesMock: vi.fn() }))

vi.mock('../../users/hooks', () => ({
  useUsers: () => usersState,
  useUserAddresses: useUserAddressesMock,
}))
vi.mock('../hooks', () => ({ useCreateAdminOrder: () => ({ mutateAsync: createMock }) }))

/**
 * El mapa real (Leaflet + geocoding) ya tiene sus tests: acá se reemplaza por
 * botones que disparan `onChange` como lo haría el componente real. Igual que
 * el real, al montar notifica su `initialLocation` (con cotización si trae
 * punto: S/ 7.00) y la expone en `calc-initial` para verificar la precarga.
 */
vi.mock('../components/DeliveryCalculator', async () => {
  const { useEffect } = await import('react')
  type Props = {
    onChange: (l: DeliveryLocation) => void
    initialLocation?: { address: string; point: { lat: number; lng: number } | null }
  }
  function DeliveryCalculator({ onChange, initialLocation }: Props) {
    useEffect(() => {
      onChange({
        address: initialLocation?.address ?? '',
        point: initialLocation?.point ?? null,
        estimate: initialLocation?.point
          ? { deliveryFee: 7, isFarOrder: false, distanceMeters: 1500 }
          : null,
        estimateFailed: false,
      })
      // Solo al montar, como el real con su initialLocation.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return (
      <div>
        <p data-testid="calc-initial">{JSON.stringify(initialLocation ?? null)}</p>
        <button
          type="button"
          onClick={() =>
            onChange({
              address: 'Jr. Carabaya 250, Lima',
              point: { lat: -12.16, lng: -76.97 },
              estimate: { deliveryFee: 5, isFarOrder: false, distanceMeters: 900 },
              estimateFailed: false,
            })
          }
        >
          ubicar-dirección
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({ address: 'Av. Sin Mapa 1', point: null, estimate: null, estimateFailed: false })
          }
        >
          solo-texto
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({
              address: 'Jr. Carabaya 250, Lima',
              point: { lat: -12.16, lng: -76.97 },
              estimate: null,
              estimateFailed: true,
            })
          }
        >
          cotizacion-falla
        </button>
      </div>
    )
  }
  return { DeliveryCalculator }
})

const TS = '2026-09-01T00:00:00.000Z'
const coca: Beverage = { id: 'coca', name: 'Coca-Cola', price: 5, active: true, sortOrder: 0, includeFreeTo: null, createdAt: TS, updatedAt: TS }
const queso: ExtraPortion = { id: 'queso', name: 'Queso extra', price: 3.5, active: true, sortOrder: 0, createdAt: TS, updatedAt: TS }
const fritas: FriesType = { id: 'fritas', name: 'Papas fritas', isDefault: true, createdAt: TS, updatedAt: TS }

function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'burger', name: 'Celtas Burger', description: null, price: 18.9, image: null,
    available: true, redeemableWithStars: false, specialReward: false, categoryId: 'cat',
    category: {} as MenuItem['category'],
    sauces: [], sauceGroupRequired: false, sauceGroupMaxSelectable: null,
    beverages: [], beverageGroupRequired: false, beverageGroupMaxSelectable: 1,
    extraPortions: [], extraPortionsGroupRequired: false, extraPortionsGroupMaxSelectable: 1,
    sauceAllowWithout: true, beverageAllowWithout: true, extraPortionsAllowWithout: true,
    friesTypes: [], friesTypeGroupRequired: false, friesTypeGroupMaxSelectable: 1,
    createdAt: TS, updatedAt: TS,
    ...overrides,
  }
}

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'user-rosa', email: 'rosa@mail.com', fullName: 'Rosa Quispe', provider: 'local',
    googleId: null, phone: '987654321', fcmToken: null, totalSpent: 0, role: 'cliente',
    createdAt: TS, updatedAt: TS,
    ...overrides,
  }
}

function OrdersRoute() {
  const location = useLocation()
  return <div data-testid="orders-page">{location.search}</div>
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/orders/create-manual']}>
      <Routes>
        <Route path="/orders/create-manual" element={<CreateManualOrderPage />} />
        <Route path="/orders" element={<OrdersRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

type User = ReturnType<typeof userEvent.setup>

async function addProduct(user: User, name: string, options: string[] = [], quantity?: string) {
  await user.click(screen.getByRole('button', { name: 'Agregar producto' }))
  const dialog = await screen.findByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: new RegExp(name) }))
  if (quantity) {
    await user.clear(within(dialog).getByLabelText('Cantidad'))
    await user.type(within(dialog).getByLabelText('Cantidad'), quantity)
  }
  for (const option of options) {
    await user.click(within(dialog).getByRole('checkbox', { name: new RegExp(option) }))
  }
  await user.click(within(dialog).getByRole('button', { name: 'Agregar al pedido' }))
}

async function fillAnonymous(user: User, name = 'Juan Pérez', phone = '987 654 321') {
  await user.type(screen.getByLabelText('Nombre'), name)
  await user.type(screen.getByLabelText('Celular'), phone)
}

function lastPayload(): CreateOrderAdminInput {
  return createMock.mock.calls.at(-1)?.[0] as CreateOrderAdminInput
}

beforeEach(() => {
  createMock.mockReset()
  createMock.mockResolvedValue({ id: 'order-new' })
  addressesState.data = []
  addressesState.isLoading = false
  addressesState.isError = false
  useUserAddressesMock.mockReset()
  // Como el hook real: sin userId la query está deshabilitada (sin data).
  useUserAddressesMock.mockImplementation((userId: string | undefined) =>
    userId ? addressesState : { data: undefined, isLoading: false, isError: false },
  )
  menuState.data = [
    makeMenuItem(),
    makeMenuItem({
      id: 'combo', name: 'Combo Celtas', price: 25,
      beverages: [coca], extraPortions: [queso],
      friesTypes: [fritas], friesTypeGroupRequired: true,
    }),
    makeMenuItem({ id: 'agotado', name: 'Producto agotado', available: false }),
  ]
  menuState.isLoading = false
  menuState.isError = false
  usersState.data = {
    items: [makeUser(), makeUser({ id: 'admin-1', fullName: 'Rosa Admin', role: 'admin' })],
    meta: { page: 1, limit: 100, total: 2, totalPages: 1 },
  }
  usersState.isLoading = false
  usersState.isError = false
})

describe('CreateManualOrderPage', () => {
  it('crea un pedido anónimo: POST /orders/admin con nombre + celular, y redirige al detalle', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillAnonymous(user)
    await addProduct(user, 'Celtas Burger')
    await user.click(await screen.findByRole('button', { name: 'ubicar-dirección' }))
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }))

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    const payload = lastPayload()
    expect(payload).toMatchObject({
      customerName: 'Juan Pérez',
      customerPhone: '987 654 321',
      items: [{ menuItemId: 'burger', quantity: 1 }],
    })
    expect(payload).not.toHaveProperty('customerId')
    expect(JSON.parse(payload.addressSnapshot)).toMatchObject({
      fullAddress: 'Jr. Carabaya 250, Lima',
      latitude: -12.16,
      longitude: -76.97,
    })
    expect(await screen.findByTestId('orders-page')).toHaveTextContent('?order=order-new')
  })

  it('crea con cliente existente: lo busca, lo elige y manda solo customerId', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Buscar cliente registrado'), 'rosa')
    const results = screen.getByRole('listbox', { name: 'Clientes encontrados' })
    // Las cuentas admin no se ofrecen: el backend rechaza customerId de rol admin.
    expect(within(results).queryByText('Rosa Admin')).not.toBeInTheDocument()
    await user.click(within(results).getByRole('button', { name: /Rosa Quispe/ }))

    expect(screen.getByText('Rosa Quispe')).toBeInTheDocument()
    expect(screen.queryByLabelText('Celular')).not.toBeInTheDocument()

    await addProduct(user, 'Celtas Burger')
    await user.click(await screen.findByRole('button', { name: 'ubicar-dirección' }))
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }))

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    const payload = lastPayload()
    expect(payload.customerId).toBe('user-rosa')
    expect(payload).not.toHaveProperty('customerName')
    expect(payload).not.toHaveProperty('customerPhone')
  })

  it('cliente no encontrado → "Usar como cliente sin cuenta" prellena el formulario inline', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Buscar cliente registrado'), 'Pedro Gómez')
    expect(screen.getByText('No se encontró ese cliente.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Usar como cliente sin cuenta' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Pedro Gómez')

    await user.type(screen.getByLabelText('Buscar cliente registrado'), '912 345 678')
    await user.click(screen.getByRole('button', { name: 'Usar como cliente sin cuenta' }))
    expect(screen.getByLabelText('Celular')).toHaveValue('912 345 678')
    expect(screen.getByLabelText('Nombre')).toHaveValue('Pedro Gómez')

    await addProduct(user, 'Celtas Burger')
    await user.click(await screen.findByRole('button', { name: 'ubicar-dirección' }))
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }))

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    expect(lastPayload()).toMatchObject({ customerName: 'Pedro Gómez', customerPhone: '912 345 678' })
  })

  it('sin productos no envía: "Agrega al menos un producto"', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillAnonymous(user)
    await user.click(await screen.findByRole('button', { name: 'ubicar-dirección' }))
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }))

    expect(await screen.findByText('Agrega al menos un producto')).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('valida celular peruano, nombre y dirección antes de enviar', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Celular'), '12345')
    await addProduct(user, 'Celtas Burger')
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }))

    expect(await screen.findByText('Celular peruano de 9 dígitos (ej. 987 654 321)')).toBeInTheDocument()
    expect(screen.getByText('El nombre es obligatorio si el cliente no tiene cuenta')).toBeInTheDocument()
    expect(screen.getByText('Escribe la dirección de entrega')).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('calcula subtotal, delivery y total en tiempo real', async () => {
    const user = userEvent.setup()
    renderPage()

    // Combo 25 + Coca 5 + Queso 3.5 = 33.50 × 2 = 67.00; + Burger 18.90 = 85.90
    await addProduct(user, 'Combo Celtas', ['Coca-Cola', 'Queso extra', 'Papas fritas'], '2')
    await addProduct(user, 'Celtas Burger')

    const table = screen.getByRole('table')
    expect(within(table).getByText('S/ 67.00')).toBeInTheDocument()
    expect(within(table).getByText('Coca-Cola, Queso extra, Papas fritas')).toBeInTheDocument()

    const summary = screen.getByRole('heading', { name: '4. Resumen' }).parentElement as HTMLElement
    // Sin ubicar: subtotal y total coinciden (delivery 0).
    expect(within(summary).getAllByText('S/ 85.90')).toHaveLength(2)
    expect(within(summary).getByText('S/ 0.00')).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'ubicar-dirección' }))
    expect(within(summary).getByText('S/ 5.00')).toBeInTheDocument()
    expect(within(summary).getByText('S/ 90.90')).toBeInTheDocument()

    // Editar la cantidad en la tabla recalcula.
    await user.clear(screen.getByLabelText('Cantidad de Celtas Burger'))
    await user.type(screen.getByLabelText('Cantidad de Celtas Burger'), '3')
    expect(within(summary).getByText('S/ 123.70')).toBeInTheDocument()

    // Eliminar una línea recalcula.
    await user.click(screen.getByRole('button', { name: 'Eliminar Combo Celtas' }))
    expect(within(summary).getByText('S/ 56.70')).toBeInTheDocument()
  })

  it('el diálogo no ofrece productos no disponibles y bloquea un grupo obligatorio sin elegir', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Agregar producto' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText('Producto agotado')).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /Combo Celtas/ }))
    expect(within(dialog).getByText('Elige al menos un tipo de papas')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Agregar al pedido' })).toBeDisabled()

    // Al elegir el tipo de papas, el grupo obligatorio queda cumplido.
    await user.click(within(dialog).getByRole('checkbox', { name: /Papas fritas/ }))
    expect(within(dialog).getByRole('button', { name: 'Agregar al pedido' })).toBeEnabled()
  })

  it('dirección sin ubicar en el mapa: avisa que el delivery será S/ 0.00 y manda el snapshot sin coordenadas', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillAnonymous(user)
    await addProduct(user, 'Celtas Burger')
    await user.click(await screen.findByRole('button', { name: 'solo-texto' }))
    expect(screen.getByText(/Sin ubicar en el mapa el servidor cobra delivery S\/ 0.00/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Crear pedido' }))
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    const snapshot = JSON.parse(lastPayload().addressSnapshot)
    expect(snapshot.fullAddress).toBe('Av. Sin Mapa 1')
    expect(snapshot).not.toHaveProperty('latitude')
  })

  it('error del backend (400) se muestra tal cual y no redirige', async () => {
    const user = userEvent.setup()
    const headers = new AxiosHeaders()
    createMock.mockRejectedValue(
      new AxiosError('Bad Request', '400', { headers }, null, {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: { headers },
        data: { statusCode: 400, message: 'El producto "Celtas Burger" no está disponible' },
      }),
    )
    renderPage()

    await fillAnonymous(user)
    await addProduct(user, 'Celtas Burger')
    await user.click(await screen.findByRole('button', { name: 'ubicar-dirección' }))
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }))

    expect(
      await screen.findByText('El producto "Celtas Burger" no está disponible'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('orders-page')).not.toBeInTheDocument()
  })

  it('error cargando el menú → ErrorState con reintento y sin poder agregar productos', () => {
    menuState.data = undefined
    menuState.isError = true
    renderPage()
    expect(screen.getByText('No se pudo cargar el menú')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar producto' })).toBeDisabled()
  })
})

describe('CreateManualOrderPage - cotización fallida', () => {
  it('no se queda en "Calculando…": avisa y permite crear igual (el servidor calcula el delivery)', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillAnonymous(user)
    await addProduct(user, 'Celtas Burger')
    await user.click(await screen.findByRole('button', { name: 'cotizacion-falla' }))

    const summary = screen.getByRole('heading', { name: '4. Resumen' }).parentElement as HTMLElement
    expect(within(summary).getByText('No se pudo calcular')).toBeInTheDocument()
    expect(within(summary).queryByText('Calculando…')).not.toBeInTheDocument()
    expect(within(summary).getByText(/el servidor lo calcula al crearlo/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Crear pedido' }))
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    expect(JSON.parse(lastPayload().addressSnapshot)).toMatchObject({ latitude: -12.16, longitude: -76.97 })
  })
})

function makeAddress(overrides: Partial<UserAddress> = {}): UserAddress {
  return {
    id: 'addr-casa',
    alias: 'Casa',
    fullAddress: 'Av. Los Álamos 123, SJM',
    reference: 'Portón verde',
    district: 'San Juan de Miraflores',
    isDefault: true,
    latitude: -12.155,
    longitude: -76.965,
    userId: 'user-rosa',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  }
}

const trabajo = () =>
  makeAddress({
    id: 'addr-trabajo',
    alias: 'Trabajo',
    fullAddress: 'Jr. Lima 450, Cercado',
    reference: null,
    district: 'Cercado de Lima',
    isDefault: false,
    latitude: -12.046,
    longitude: -77.03,
  })

async function chooseRosa(user: User) {
  await user.type(screen.getByLabelText('Buscar cliente registrado'), 'rosa')
  await user.click(screen.getByRole('button', { name: /Rosa Quispe/ }))
}

function calcInitial() {
  return JSON.parse(screen.getByTestId('calc-initial').textContent ?? 'null') as
    | { address: string; point: { lat: number; lng: number } | null }
    | null
}

/** Valor de la fila "Delivery" del resumen. */
function deliveryValue() {
  const row = within(summary()).getByText('Delivery').parentElement as HTMLElement
  return row.querySelector('dd')?.textContent?.trim()
}

function summary() {
  return screen.getByRole('heading', { name: '4. Resumen' }).parentElement as HTMLElement
}

describe('CreateManualOrderPage - direcciones guardadas del cliente', () => {
  it('cliente sin direcciones guardadas → no muestra el selector', async () => {
    const user = userEvent.setup()
    addressesState.data = []
    renderPage()
    await chooseRosa(user)

    expect(useUserAddressesMock).toHaveBeenLastCalledWith('user-rosa')
    expect(screen.queryByLabelText('Direcciones guardadas')).not.toBeInTheDocument()
    expect(await screen.findByTestId('calc-initial')).toHaveTextContent('null')
  })

  it('pedido sin cuenta → no consulta direcciones ni muestra el selector', async () => {
    addressesState.data = [makeAddress()]
    renderPage()
    await screen.findByTestId('calc-initial')
    expect(useUserAddressesMock).toHaveBeenLastCalledWith(undefined)
    expect(screen.queryByLabelText('Direcciones guardadas')).not.toBeInTheDocument()
  })

  it('cliente con direcciones → aparece el selector con la principal preseleccionada y cargada en el mapa', async () => {
    const user = userEvent.setup()
    addressesState.data = [makeAddress(), trabajo()]
    renderPage()
    await chooseRosa(user)

    expect(screen.getByLabelText('Direcciones guardadas')).toHaveTextContent(
      'Casa - Av. Los Álamos 123, SJM',
    )
    await waitFor(() =>
      expect(calcInitial()).toEqual({
        address: 'Av. Los Álamos 123, SJM',
        point: { lat: -12.155, lng: -76.965 },
      }),
    )
    expect(screen.getByLabelText('Referencia (opcional)')).toHaveValue('Portón verde')
  })

  it('elegir otra dirección la carga en el mapa y recalcula el delivery', async () => {
    const user = userEvent.setup()
    addressesState.data = [makeAddress(), trabajo()]
    renderPage()
    await chooseRosa(user)

    await user.click(screen.getByLabelText('Direcciones guardadas'))
    await user.click(await screen.findByRole('option', { name: 'Trabajo - Jr. Lima 450, Cercado' }))

    await waitFor(() =>
      expect(calcInitial()).toEqual({
        address: 'Jr. Lima 450, Cercado',
        point: { lat: -12.046, lng: -77.03 },
      }),
    )
    // Sin referencia guardada: se limpia la de la dirección anterior.
    expect(screen.getByLabelText('Referencia (opcional)')).toHaveValue('')
    expect(deliveryValue()).toBe('S/ 7.00')
  })

  it('"+ Nueva dirección" limpia el mapa y la referencia, y permite buscar', async () => {
    const user = userEvent.setup()
    addressesState.data = [makeAddress()]
    renderPage()
    await chooseRosa(user)
    await waitFor(() => expect(calcInitial()).not.toBeNull())

    await user.click(screen.getByLabelText('Direcciones guardadas'))
    await user.click(await screen.findByRole('option', { name: '+ Nueva dirección' }))

    await waitFor(() => expect(calcInitial()).toBeNull())
    expect(screen.getByLabelText('Referencia (opcional)')).toHaveValue('')
    // Sin dirección ubicada: delivery S/ 0.00 hasta buscar.
    expect(deliveryValue()).toBe('S/ 0.00')

    await user.click(screen.getByRole('button', { name: 'ubicar-dirección' }))
    expect(deliveryValue()).toBe('S/ 5.00')
  })

  it('el delivery y el pedido usan la dirección guardada: snapshot con alias, distrito, referencia y coordenadas', async () => {
    const user = userEvent.setup()
    addressesState.data = [makeAddress()]
    renderPage()
    await chooseRosa(user)
    await addProduct(user, 'Celtas Burger')

    // 18.90 + delivery 7.00 (cotización del punto guardado) = 25.90
    await waitFor(() => expect(within(summary()).getByText('S/ 7.00')).toBeInTheDocument())
    expect(within(summary()).getByText('S/ 25.90')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Crear pedido' }))
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    const payload = lastPayload()
    expect(payload.customerId).toBe('user-rosa')
    expect(payload).not.toHaveProperty('addressId')
    expect(JSON.parse(payload.addressSnapshot)).toEqual({
      alias: 'Casa',
      fullAddress: 'Av. Los Álamos 123, SJM',
      reference: 'Portón verde',
      district: 'San Juan de Miraflores',
      latitude: -12.155,
      longitude: -76.965,
    })
  })

  it('dirección guardada sin coordenadas → precarga solo el texto y avisa que hay que buscarla', async () => {
    const user = userEvent.setup()
    addressesState.data = [makeAddress({ latitude: null, longitude: null })]
    renderPage()
    await chooseRosa(user)

    await waitFor(() =>
      expect(calcInitial()).toEqual({ address: 'Av. Los Álamos 123, SJM', point: null }),
    )
    expect(screen.getByText(/no tiene ubicación guardada/)).toBeInTheDocument()
  })

  it('cambiar a otro cliente registrado vuelve a preseleccionar SU principal; pasar a sin cuenta limpia la dirección', async () => {
    const user = userEvent.setup()
    const pedro = makeUser({ id: 'user-pedro', fullName: 'Pedro Ramos', email: 'pedro@mail.com', phone: '912345678' })
    usersState.data = {
      items: [makeUser(), pedro],
      meta: { page: 1, limit: 100, total: 2, totalPages: 1 },
    }
    const byUser: Record<string, UserAddress[]> = {
      'user-rosa': [makeAddress(), trabajo()],
      'user-pedro': [
        makeAddress({
          id: 'addr-pedro', alias: 'Depa', fullAddress: 'Calle Pedro 9', reference: 'Piso 3',
          district: 'Surco', userId: 'user-pedro', latitude: -12.1, longitude: -76.99,
        }),
      ],
    }
    useUserAddressesMock.mockImplementation((userId: string | undefined) =>
      userId ? { data: byUser[userId], isLoading: false, isError: false } : { data: undefined, isLoading: false, isError: false },
    )
    renderPage()
    await chooseRosa(user)

    // Rosa: elige explícitamente "Trabajo" (savedChoice deja de ser automático).
    await user.click(screen.getByLabelText('Direcciones guardadas'))
    await user.click(await screen.findByRole('option', { name: 'Trabajo - Jr. Lima 450, Cercado' }))
    await waitFor(() => expect(calcInitial()?.address).toBe('Jr. Lima 450, Cercado'))

    // Cambia a Pedro: debe preseleccionar la principal de Pedro, no arrastrar la elección de Rosa.
    await user.click(screen.getByRole('button', { name: 'Quitar cliente' }))
    await user.type(screen.getByLabelText('Buscar cliente registrado'), 'pedro')
    await user.click(screen.getByRole('button', { name: /Pedro Ramos/ }))

    expect(useUserAddressesMock).toHaveBeenLastCalledWith('user-pedro')
    expect(screen.getByLabelText('Direcciones guardadas')).toHaveTextContent('Depa - Calle Pedro 9')
    await waitFor(() =>
      expect(calcInitial()).toEqual({ address: 'Calle Pedro 9', point: { lat: -12.1, lng: -76.99 } }),
    )
    expect(screen.getByLabelText('Referencia (opcional)')).toHaveValue('Piso 3')

    // Pasa a sin cuenta: sin selector, mapa y referencia vacíos.
    await user.click(screen.getByRole('button', { name: 'Quitar cliente' }))
    expect(screen.queryByLabelText('Direcciones guardadas')).not.toBeInTheDocument()
    await waitFor(() => expect(calcInitial()).toBeNull())
    expect(screen.getByLabelText('Referencia (opcional)')).toHaveValue('')
  })

  it('si el admin cambia el texto de la dirección guardada, el snapshot NO lleva alias ni distrito de la guardada', async () => {
    const user = userEvent.setup()
    addressesState.data = [makeAddress()]
    renderPage()
    await chooseRosa(user)
    await addProduct(user, 'Celtas Burger')
    await waitFor(() => expect(calcInitial()).not.toBeNull())

    // El calculador reporta otra dirección (texto editado + nueva búsqueda).
    await user.click(screen.getByRole('button', { name: 'ubicar-dirección' }))
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }))

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    const snapshot = JSON.parse(lastPayload().addressSnapshot)
    expect(snapshot).toMatchObject({
      alias: 'Pedido manual',
      fullAddress: 'Jr. Carabaya 250, Lima',
      latitude: -12.16,
      longitude: -76.97,
    })
    expect(snapshot).not.toHaveProperty('district')
  })

  it('cargando direcciones → aviso de carga y sin selector', async () => {
    const user = userEvent.setup()
    addressesState.data = undefined
    addressesState.isLoading = true
    renderPage()
    await chooseRosa(user)

    expect(screen.getByText('Cargando direcciones guardadas…')).toBeInTheDocument()
    expect(screen.queryByLabelText('Direcciones guardadas')).not.toBeInTheDocument()
  })

  it('error cargando direcciones → aviso y el mapa queda para una dirección nueva', async () => {
    const user = userEvent.setup()
    addressesState.data = undefined
    addressesState.isError = true
    renderPage()
    await chooseRosa(user)

    expect(screen.getByText(/No se pudieron cargar las direcciones guardadas/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Direcciones guardadas')).not.toBeInTheDocument()
  })
})

describe('CreateManualOrderPage - grupos obligatorios sin opciones disponibles', () => {
  const inactiveCoca: Beverage = { ...coca, id: 'coca-off', name: 'Coca apagada', active: false }

  it('bebidas obligatorias con todas inactivas → aviso en la lista, error rojo y "Agregar" deshabilitado', async () => {
    const user = userEvent.setup()
    menuState.data = [
      makeMenuItem({
        id: 'combo-off', name: 'Combo sin bebidas', beverages: [inactiveCoca], beverageGroupRequired: true,
      }),
    ]
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Agregar producto' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Sin opciones disponibles para bebidas')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /Combo sin bebidas/ }))
    expect(within(dialog).getByText('No hay opciones disponibles para bebidas')).toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: /Coca apagada/ })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Agregar al pedido' })).toBeDisabled()
  })

  it('con una bebida activa el ítem se desbloquea al elegirla', async () => {
    const user = userEvent.setup()
    menuState.data = [
      makeMenuItem({
        id: 'combo-ok', name: 'Combo con bebida', beverages: [inactiveCoca, coca], beverageGroupRequired: true,
      }),
    ]
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Agregar producto' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText(/Sin opciones disponibles/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /Combo con bebida/ }))

    expect(within(dialog).queryByText(/No hay opciones disponibles/)).not.toBeInTheDocument()
    expect(within(dialog).getByText('Elige al menos una bebida')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Agregar al pedido' })).toBeDisabled()

    await user.click(within(dialog).getByRole('checkbox', { name: /Coca-Cola/ }))
    expect(within(dialog).getByRole('button', { name: 'Agregar al pedido' })).toBeEnabled()
  })
})

describe('CreateManualOrderPage - dirección escrita antes de elegir cliente', () => {
  it('elegir un cliente SIN direcciones guardadas no borra la dirección ya ubicada ni la referencia', async () => {
    const user = userEvent.setup()
    addressesState.data = []
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'ubicar-dirección' }))
    await user.type(screen.getByLabelText('Referencia (opcional)'), 'Casa azul')
    expect(deliveryValue()).toBe('S/ 5.00')

    await chooseRosa(user)

    // Sin remontar el calculador: sigue la dirección ubicada y su delivery.
    expect(deliveryValue()).toBe('S/ 5.00')
    expect(screen.getByLabelText('Referencia (opcional)')).toHaveValue('Casa azul')

    await addProduct(user, 'Celtas Burger')
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }))
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    expect(JSON.parse(lastPayload().addressSnapshot)).toMatchObject({
      fullAddress: 'Jr. Carabaya 250, Lima',
      reference: 'Casa azul',
      latitude: -12.16,
    })
  })

  it('elegir un cliente CON dirección principal sí la reemplaza (preselección)', async () => {
    const user = userEvent.setup()
    addressesState.data = [makeAddress()]
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'ubicar-dirección' }))
    expect(deliveryValue()).toBe('S/ 5.00')
    await chooseRosa(user)

    await waitFor(() => expect(deliveryValue()).toBe('S/ 7.00'))
    expect(calcInitial()).toMatchObject({ address: 'Av. Los Álamos 123, SJM' })
  })
})
