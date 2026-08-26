/**
 * Tipos del módulo star-promotions — espejo del contrato real del backend.
 * Confirmados contra la fuente: src/modules/rewards/{entities,dto} y
 * star-promotions.controller.ts del backend. Sin DELETE: desactivar es
 * `active: false`, nunca se borra un registro.
 */

export interface StarPromotion {
  id: string
  /** Texto interno para el admin (ej. "Navidad 2026"), no se muestra al cliente. */
  label: string
  multiplier: number
  /** YYYY-MM-DD, calendario (columna `date`, sin hora) — no es un timestamp. */
  startDate: string
  /** YYYY-MM-DD, calendario (columna `date`, sin hora), inclusive. */
  endDate: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateStarPromotionInput {
  label: string
  multiplier: number
  startDate: string
  endDate: string
  active?: boolean
}

export type UpdateStarPromotionInput = Partial<CreateStarPromotionInput>
