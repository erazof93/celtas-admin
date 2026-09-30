import { describe, expectTypeOf, it } from 'vitest'
import type { components } from '@/types/api'
import type { CreateOrderAdminInput, CreateOrderAdminItemInput } from './manual-order'

/**
 * Contrato a nivel de TIPOS (lo verifica `tsc -b`, que incluye los tests):
 * el body que arma el panel (`CreateOrderAdminInput`, escrito a mano) debe
 * ser asignable al DTO generado desde Swagger. Si alguien agrega un campo que
 * el backend no declara (ej. `deliveryFee`, `notes`, `selectedSauces`) —que el
 * ValidationPipe con forbidNonWhitelisted rechaza con 400— o cambia el tipo de
 * uno existente, `pnpm run type-check` falla.
 */
type Dto = components['schemas']['CreateOrderAdminDto']
type ItemDto = components['schemas']['CreateOrderItemDto']

/** Claves del input que el DTO NO declara (debe ser `never`). */
type ExtraKeys<Input, Target> = Exclude<keyof Input, keyof Target>

describe('CreateOrderAdminInput vs CreateOrderAdminDto generado', () => {
  it('el body es asignable al DTO generado', () => {
    expectTypeOf<CreateOrderAdminInput>().toExtend<Dto>()
    expectTypeOf<CreateOrderAdminItemInput>().toExtend<ItemDto>()
  })

  it('no hay claves fuera del whitelist del backend', () => {
    expectTypeOf<ExtraKeys<CreateOrderAdminInput, Dto>>().toEqualTypeOf<never>()
    expectTypeOf<ExtraKeys<CreateOrderAdminItemInput, ItemDto>>().toEqualTypeOf<never>()
  })
})
