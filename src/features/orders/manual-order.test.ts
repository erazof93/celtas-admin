import { describe, expect, it } from 'vitest'
import type { Beverage, ExtraPortion, FriesType, MenuItem, Sauce } from '../menu/types'
import {
  buildAddressSnapshot,
  buildCreateOrderAdminPayload,
  lineSubtotal,
  lineUnitPrice,
  manualOrderSubtotal,
  normalizePeruMobile,
  selectionErrors,
  type ManualOrderLine,
} from './manual-order'

const TS = '2026-09-01T00:00:00.000Z'

const sauce = (id: string, active = true): Sauce => ({
  id, name: `Salsa ${id}`, active, sortOrder: 0, createdAt: TS, updatedAt: TS,
})
const beverage = (id: string, price: number, includeFreeTo: string[] | null = null): Beverage => ({
  id, name: `Bebida ${id}`, price, active: true, sortOrder: 0, includeFreeTo, createdAt: TS, updatedAt: TS,
})
const extra = (id: string, price: number): ExtraPortion => ({
  id, name: `Extra ${id}`, price, active: true, sortOrder: 0, createdAt: TS, updatedAt: TS,
})
const fries = (id: string): FriesType => ({
  id, name: `Papas ${id}`, isDefault: false, createdAt: TS, updatedAt: TS,
})

function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'burger',
    name: 'Celtas Burger',
    description: null,
    price: 18.9,
    image: null,
    available: true,
    redeemableWithStars: false,
    specialReward: false,
    categoryId: 'cat',
    category: {} as MenuItem['category'],
    sauces: [],
    sauceGroupRequired: false,
    sauceGroupMaxSelectable: null,
    beverages: [],
    beverageGroupRequired: false,
    beverageGroupMaxSelectable: 1,
    extraPortions: [],
    extraPortionsGroupRequired: false,
    extraPortionsGroupMaxSelectable: 1,
    sauceAllowWithout: true,
    beverageAllowWithout: true,
    extraPortionsAllowWithout: true,
    friesTypes: [],
    friesTypeGroupRequired: false,
    friesTypeGroupMaxSelectable: 1,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  }
}

function line(overrides: Partial<ManualOrderLine> = {}): ManualOrderLine {
  return {
    key: 'l1',
    menuItemId: 'burger',
    quantity: 1,
    sauceIds: [],
    beverageIds: [],
    extraPortionIds: [],
    friesTypeIds: [],
    comment: '',
    ...overrides,
  }
}

describe('normalizePeruMobile (espejo de phone.util.ts)', () => {
  it('acepta 9 dígitos que empiezan en 9, con +51/espacios/guiones', () => {
    expect(normalizePeruMobile('987654321')).toBe('51987654321')
    expect(normalizePeruMobile('987 654 321')).toBe('51987654321')
    expect(normalizePeruMobile('+51 987-654-321')).toBe('51987654321')
    expect(normalizePeruMobile('51987654321')).toBe('51987654321')
  })

  it('rechaza fijos, largos incorrectos y vacíos', () => {
    expect(normalizePeruMobile('014567890')).toBeNull()
    expect(normalizePeruMobile('98765432')).toBeNull()
    expect(normalizePeruMobile('')).toBeNull()
    expect(normalizePeruMobile(undefined)).toBeNull()
  })
})

describe('precios (espejo de buildItems)', () => {
  const combo = makeMenuItem({
    id: 'combo',
    price: 25,
    beverages: [beverage('coca', 5, ['combo']), beverage('inca', 5)],
    extraPortions: [extra('queso', 3.5), extra('tocino', 4)],
  })

  it('producto + bebida gratis por includeFreeTo + extras', () => {
    expect(
      lineUnitPrice(combo, line({ beverageIds: ['coca'], extraPortionIds: ['queso'] })),
    ).toBe(28.5)
  })

  it('bebida NO incluida en includeFreeTo suma su precio', () => {
    expect(lineUnitPrice(combo, line({ beverageIds: ['inca'] }))).toBe(30)
  })

  it('subtotal = (unitario + extras) * cantidad, redondeado a 2 decimales', () => {
    expect(
      lineSubtotal(combo, line({ quantity: 3, extraPortionIds: ['queso', 'tocino'] })),
    ).toBe(97.5)
    expect(lineSubtotal(makeMenuItem({ price: 0.1 }), line({ quantity: 3 }))).toBe(0.3)
  })

  it('manualOrderSubtotal suma líneas e ignora productos que ya no están en el menú', () => {
    const burger = makeMenuItem()
    const menuById = new Map([
      ['burger', burger],
      ['combo', combo],
    ])
    expect(
      manualOrderSubtotal(
        [
          line({ quantity: 2 }),
          line({ key: 'l2', menuItemId: 'combo', beverageIds: ['inca'] }),
          line({ key: 'l3', menuItemId: 'borrado' }),
        ],
        menuById,
      ),
    ).toBe(67.8)
  })
})

describe('selectionErrors (espejo de validateGroupSelection)', () => {
  it('grupo obligatorio sin elegir → error; grupo no ofrecido → sin reglas', () => {
    const item = makeMenuItem({
      friesTypes: [fries('fritas'), fries('hilo')],
      friesTypeGroupRequired: true,
      sauceGroupRequired: true, // sin salsas ofrecidas → no aplica
    })
    expect(selectionErrors(item, line())).toEqual(['Elige al menos un tipo de papas'])
    expect(selectionErrors(item, line({ friesTypeIds: ['fritas'] }))).toEqual([])
  })

  it('más del máximo → error; sauceGroupMaxSelectable null = sin límite', () => {
    const item = makeMenuItem({
      sauces: [sauce('a'), sauce('b'), sauce('c')],
      beverages: [beverage('x', 5), beverage('y', 5)],
      beverageGroupMaxSelectable: 1,
    })
    expect(selectionErrors(item, line({ sauceIds: ['a', 'b', 'c'] }))).toEqual([])
    expect(selectionErrors(item, line({ beverageIds: ['x', 'y'] }))).toEqual([
      'Máximo 1 bebida(s)',
    ])
  })
})

describe('buildAddressSnapshot', () => {
  it('JSON string con coordenadas cuando se ubicó en el mapa', () => {
    expect(
      JSON.parse(
        buildAddressSnapshot({
          fullAddress: '  Jr. Carabaya 250, Lima ',
          reference: '',
          latitude: -12.16,
          longitude: -76.97,
        }),
      ),
    ).toEqual({
      alias: 'Pedido manual',
      fullAddress: 'Jr. Carabaya 250, Lima',
      reference: null,
      latitude: -12.16,
      longitude: -76.97,
    })
  })

  it('sin coordenadas no manda latitude/longitude (el backend cobra delivery 0)', () => {
    const parsed = JSON.parse(
      buildAddressSnapshot({
        fullAddress: 'Av. X 1',
        reference: 'Portón verde',
        latitude: null,
        longitude: null,
      }),
    )
    expect(parsed).not.toHaveProperty('latitude')
    expect(parsed.reference).toBe('Portón verde')
  })
})

describe('buildCreateOrderAdminPayload (contrato de CreateOrderAdminDto)', () => {
  const item = makeMenuItem({
    sauces: [sauce('mayo'), sauce('oculta', false)],
    friesTypes: [fries('fritas')],
  })
  const menuById = new Map([['burger', item]])
  const address = { fullAddress: 'Av. X 1', reference: '', latitude: null, longitude: null }

  it('anónimo: customerName + customerPhone, sin customerId', () => {
    const payload = buildCreateOrderAdminPayload({
      customer: { mode: 'anonymous', customerName: ' Rosa ', customerPhone: ' 987654321 ' },
      lines: [line()],
      menuById,
      address,
    })
    expect(payload.customerName).toBe('Rosa')
    expect(payload.customerPhone).toBe('987654321')
    expect(payload).not.toHaveProperty('customerId')
  })

  it('cliente registrado: solo customerId (el backend rechaza mandar ambos)', () => {
    const payload = buildCreateOrderAdminPayload({
      customer: { mode: 'registered', customerId: 'user-1' },
      lines: [line()],
      menuById,
      address,
    })
    expect(payload.customerId).toBe('user-1')
    expect(payload).not.toHaveProperty('customerName')
    expect(payload).not.toHaveProperty('customerPhone')
  })

  it('tri-state: grupo ofrecido viaja como array (aunque vacío); no ofrecido se omite', () => {
    const payload = buildCreateOrderAdminPayload({
      customer: { mode: 'registered', customerId: 'user-1' },
      lines: [line({ quantity: 2, friesTypeIds: ['fritas'], comment: '  sin cebolla ' })],
      menuById,
      address,
    })
    expect(payload.items).toEqual([
      {
        menuItemId: 'burger',
        quantity: 2,
        comment: 'sin cebolla',
        sauceIds: [],
        friesTypeIds: ['fritas'],
      },
    ])
  })

  it('nunca manda campos que CreateOrderAdminDto no declara (deliveryFee, notes, selected*)', () => {
    const payload = buildCreateOrderAdminPayload({
      customer: { mode: 'anonymous', customerName: 'Rosa', customerPhone: '987654321' },
      lines: [line()],
      menuById,
      address,
    })
    expect(Object.keys(payload).sort()).toEqual(
      ['addressSnapshot', 'customerName', 'customerPhone', 'items'].sort(),
    )
    const allowedItemKeys = new Set([
      'menuItemId', 'quantity', 'sauceIds', 'beverageIds', 'extraPortionIds',
      'friesTypeIds', 'comment',
    ])
    for (const it of payload.items) {
      expect(Object.keys(it).filter((k) => !allowedItemKeys.has(k))).toEqual([])
    }
    expect(typeof payload.addressSnapshot).toBe('string')
  })
})
