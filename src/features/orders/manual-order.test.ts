import { describe, expect, it } from 'vitest'
import type { Beverage, ExtraPortion, FriesType, MenuItem, Sauce } from '../menu/types'
import {
  buildAddressSnapshot,
  blockedRequiredGroups,
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

describe('grupos obligatorios sin opciones disponibles (todas inactivas)', () => {
  const offBeverage = { ...beverage('off', 5), active: false }

  it('bebidas obligatorias con todas inactivas → bloqueado, con mensaje propio', () => {
    const item = makeMenuItem({
      beverages: [offBeverage],
      beverageGroupRequired: true,
      beverageAllowWithout: false,
    })
    expect(blockedRequiredGroups(item)).toEqual(['bebidas'])
    expect(selectionErrors(item, line())).toEqual(['No hay opciones disponibles para bebidas'])
  })

  it('reporta cada grupo bloqueado (salsas y porciones extras)', () => {
    const item = makeMenuItem({
      sauces: [sauce('a', false)],
      sauceGroupRequired: true,
      sauceAllowWithout: false,
      extraPortions: [{ ...extra('q', 3), active: false }],
      extraPortionsGroupRequired: true,
      extraPortionsAllowWithout: false,
    })
    expect(blockedRequiredGroups(item)).toEqual(['salsas', 'porciones extras'])
  })

  it('con al menos una opción activa no está bloqueado (pide elegirla)', () => {
    const item = makeMenuItem({
      beverages: [offBeverage, beverage('on', 5)],
      beverageGroupRequired: true,
      beverageAllowWithout: false,
    })
    expect(blockedRequiredGroups(item)).toEqual([])
    expect(selectionErrors(item, line())).toEqual(['Elige al menos una bebida'])
  })

  it('grupo opcional con todas inactivas no bloquea', () => {
    const item = makeMenuItem({ beverages: [offBeverage], beverageGroupRequired: false })
    expect(blockedRequiredGroups(item)).toEqual([])
    expect(selectionErrors(item, line())).toEqual([])
  })

  it('grupo obligatorio SIN opciones asignadas no bloquea (el backend no lo exige)', () => {
    const item = makeMenuItem({ beverages: [], beverageGroupRequired: true, friesTypes: [], friesTypeGroupRequired: true })
    expect(blockedRequiredGroups(item)).toEqual([])
    expect(selectionErrors(item, line())).toEqual([])
  })
})

describe('buildAddressSnapshot con dirección guardada', () => {
  it('usa alias y distrito de la dirección guardada', () => {
    expect(
      JSON.parse(
        buildAddressSnapshot({
          fullAddress: 'Av. Los Álamos 123',
          reference: 'Portón verde',
          latitude: -12.1,
          longitude: -76.9,
          alias: 'Casa',
          district: 'San Juan de Miraflores',
        }),
      ),
    ).toEqual({
      alias: 'Casa',
      fullAddress: 'Av. Los Álamos 123',
      reference: 'Portón verde',
      district: 'San Juan de Miraflores',
      latitude: -12.1,
      longitude: -76.9,
    })
  })
})

describe('buildAddressSnapshot solo con pin', () => {
  it('sin texto usa "Ubicación marcada en el mapa" y conserva referencia y coordenadas', () => {
    expect(
      JSON.parse(
        buildAddressSnapshot({ fullAddress: '  ', reference: 'Casa verde', latitude: -12.17, longitude: -76.98 }),
      ),
    ).toEqual({
      alias: 'Pedido manual',
      fullAddress: 'Ubicación marcada en el mapa',
      reference: 'Casa verde',
      latitude: -12.17,
      longitude: -76.98,
    })
  })
})

describe('"Sin X" en grupos obligatorios (allowWithout, espejo de validateGroupSelection)', () => {
  it('obligatorio + allowWithout: [] es válido; sin allowWithout pide elegir', () => {
    const conSin = makeMenuItem({ sauces: [sauce('mayo')], sauceGroupRequired: true, sauceAllowWithout: true })
    const sinSin = makeMenuItem({ sauces: [sauce('mayo')], sauceGroupRequired: true, sauceAllowWithout: false })
    expect(selectionErrors(conSin, line())).toEqual([])
    expect(selectionErrors(sinSin, line())).toEqual(['Elige al menos una salsa'])
  })

  it('aplica igual a bebidas y porciones extras', () => {
    const item = makeMenuItem({
      beverages: [beverage('x', 5)],
      beverageGroupRequired: true,
      extraPortions: [extra('q', 3)],
      extraPortionsGroupRequired: true,
    })
    expect(selectionErrors(item, line())).toEqual([])
    expect(
      selectionErrors(item, line({ beverageIds: [] })),
    ).toEqual([])
  })

  it('tipos de papas no tiene "Sin": sigue siendo obligatorio (el backend pasa false)', () => {
    const item = makeMenuItem({ friesTypes: [fries('fritas')], friesTypeGroupRequired: true })
    expect(selectionErrors(item, line())).toEqual(['Elige al menos un tipo de papas'])
  })

  it('allowWithout no salta el máximo', () => {
    const item = makeMenuItem({
      beverages: [beverage('x', 5), beverage('y', 5)],
      beverageGroupRequired: true,
      beverageGroupMaxSelectable: 1,
    })
    expect(selectionErrors(item, line({ beverageIds: ['x', 'y'] }))).toEqual(['Máximo 1 bebida(s)'])
  })

  it('obligatorio + allowWithout con todas inactivas: no bloquea y viaja [] explícito (null sería 400)', () => {
    const item = makeMenuItem({ sauces: [sauce('off', false)], sauceGroupRequired: true })
    expect(blockedRequiredGroups(item)).toEqual([])
    expect(selectionErrors(item, line())).toEqual([])

    const payload = buildCreateOrderAdminPayload({
      customer: { mode: 'registered', customerId: 'user-1' },
      lines: [line()],
      menuById: new Map([['burger', item]]),
      address: { fullAddress: 'Av. X 1', reference: '', latitude: null, longitude: null },
    })
    expect(payload.items[0].sauceIds).toEqual([])
  })

  it('opcional con todas inactivas se sigue omitiendo (sin cambio de comportamiento)', () => {
    const item = makeMenuItem({ sauces: [sauce('off', false)], sauceGroupRequired: false })
    const payload = buildCreateOrderAdminPayload({
      customer: { mode: 'registered', customerId: 'user-1' },
      lines: [line()],
      menuById: new Map([['burger', item]]),
      address: { fullAddress: 'Av. X 1', reference: '', latitude: null, longitude: null },
    })
    expect(payload.items[0]).not.toHaveProperty('sauceIds')
  })
})
