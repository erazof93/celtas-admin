/**
 * Tipos del módulo users — espejo del contrato real del backend.
 * Confirmados contra la fuente: src/modules/users/{entities,dto} del backend.
 * GET /users (admin) devuelve el User completo SIN password (excluido con
 * @Exclude) — no trae direcciones ni pedidos.
 */

export type UserRole = 'cliente' | 'admin'

export interface AdminUser {
  id: string
  email: string
  fullName: string
  provider: 'local' | 'google'
  googleId: string | null
  phone: string | null
  fcmToken: string | null
  /** Decimal transformado a number por el backend (nunca "0.00"). */
  totalSpent: number
  role: UserRole
  createdAt: string
  updatedAt: string
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

/** Respuesta de GET /users (admin, paginado). */
export interface PaginatedUsers {
  items: AdminUser[]
  meta: PaginationMeta
}

/** Body de PATCH /users/:id/role (el id viaja SOLO en el path). */
export interface UpdateUserRoleInput {
  id: string
  role: UserRole
}

/**
 * Dirección guardada de un usuario — GET /users/:id/addresses (admin).
 * Espejo de Address.entity.ts del backend: array plano (NO paginado),
 * ordenado principal primero (isDefault DESC, createdAt ASC).
 *
 * `latitude`/`longitude` no están en `api.d.ts` porque el endpoint no
 * declara `@ApiResponse({ type })` en Swagger (mismo gap que el módulo de
 * marketing) — tipados a mano confirmados contra el código fuente real de
 * `celtas-backend` (`address.entity.ts`: columnas `double precision`
 * nullable, sin `@Exclude()`; `addresses.service.ts` `findByUser()` y
 * `users.controller.ts` `listUserAddresses()` devuelven la entidad completa
 * sin mapear a un DTO que las omita). Direcciones creadas antes de esta
 * columna, o guardadas sin que el cliente use el mapa/autocompletado,
 * siguen siendo `null` — válido, no es un dato faltante por error.
 */
export interface UserAddress {
  id: string
  alias: string
  fullAddress: string
  reference: string | null
  district: string
  isDefault: boolean
  latitude: number | null
  longitude: number | null
  userId: string
  createdAt: string
  updatedAt: string
}