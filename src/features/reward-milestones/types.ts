/**
 * Tipos del módulo reward-milestones — espejo del contrato real del backend.
 * Confirmados contra la fuente: src/modules/rewards/{entities,dto} y
 * reward-milestones.controller.ts del backend (Swagger no documenta el
 * schema de respuesta, content?: never). A diferencia de StarPromotion, esta
 * entidad SÍ admite DELETE real — RewardRedemption guarda su propio snapshot
 * (milestoneStars/isSpecial), no una FK, así que borrar o editar un hito
 * después nunca afecta premios ya otorgados.
 */

export interface RewardMilestone {
  id: string
  /** Estrellas necesarias para ganar este premio. Único entre hitos. */
  starsRequired: number
  /**
   * Si este hito entrega el premio del catálogo `MenuItem.specialReward` en
   * vez del catálogo normal (`redeemableWithStars`). Campo explícito, no se
   * infiere del umbral. "Exclusivo" es por CANJE individual (un
   * `RewardRedemption` valida contra un solo catálogo a la vez, nunca la
   * unión) — no significa que los dos switches del producto sean excluyentes
   * entre sí: un `MenuItem` puede tener cualquier combinación de
   * `redeemableWithStars`/`specialReward` (confirmado contra
   * menu-item.entity.ts y create-menu-item.dto.ts del backend).
   */
  isSpecial: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateRewardMilestoneInput {
  starsRequired: number
  isSpecial?: boolean
}

export type UpdateRewardMilestoneInput = Partial<CreateRewardMilestoneInput>
