/**
 * Tipos del módulo menu — espejo del contrato real del backend.
 * Confirmados contra la fuente: src/modules/menu/{entities,dto} del backend.
 * Swagger no documenta los schemas de respuesta (content?: never).
 */

export interface Category {
  id: string
  name: string
  description: string | null
  image: string | null
  active: boolean
  sortOrder: number
  /** Relación cargada por GET /menu/categories. */
  items: MenuItem[]
  createdAt: string
  updatedAt: string
}

export interface MenuItem {
  id: string
  name: string
  description: string | null
  /** Precio en soles (la API expone number, no "24.90"). */
  price: number
  image: string | null
  available: boolean
  /**
   * Si el producto puede canjearse con estrellas del programa de fidelización.
   * El catálogo de canje del cliente es `redeemableWithStars = true AND
   * available = true` (confirmado contra menu-item.entity.ts del backend).
   */
  redeemableWithStars: boolean
  /**
   * Si el producto es parte del catálogo de premio especial —
   * INDEPENDIENTE de `redeemableWithStars`, no excluyente: un producto
   * puede tener cualquier combinación de los dos switches (confirmado
   * contra menu-item.entity.ts y create-menu-item.dto.ts del backend). Lo
   * que sí es exclusivo es el CANJE: un `RewardRedemption` valida contra un
   * solo catálogo a la vez (normal o especial), nunca la unión de ambos.
   */
  specialReward: boolean
  categoryId: string
  /** Relación cargada por GET /menu/items. */
  category: Category
  /**
   * Salsas/cremas que este producto ofrece (relación ManyToMany, cargada por
   * GET /menu/items). Vacío = el producto no ofrece selector en la app (ej.
   * arroz chaufa) — no es opcional/undefined, el backend siempre devuelve el
   * array (confirmado contra menu.service.ts findAllItems/createItem/updateItem).
   */
  sauces: Sauce[]
  /** Si el grupo de salsas es obligatorio. Sin efecto si `sauces` está vacío. */
  sauceGroupRequired: boolean
  /** Máximo de salsas que el cliente puede elegir para este producto. */
  sauceGroupMaxSelectable: number
  /**
   * Bebidas que este producto ofrece (relación ManyToMany, cargada por GET
   * /menu/items). Vacío = sin selector de bebidas en la app. Mismo criterio
   * que `sauces` (confirmado contra menu-item.entity.ts del backend).
   */
  beverages: Beverage[]
  /** Si el grupo de bebidas es obligatorio. Sin efecto si `beverages` está vacío. */
  beverageGroupRequired: boolean
  /** Máximo de bebidas que el cliente puede elegir para este producto. */
  beverageGroupMaxSelectable: number
  /**
   * Porciones extras que este producto ofrece (relación ManyToMany, cargada
   * por GET /menu/items). Vacío = sin selector de porciones extras en la app.
   * Mismo criterio que `sauces`/`beverages`.
   */
  extraPortions: ExtraPortion[]
  /** Si el grupo de porciones extras es obligatorio. Sin efecto si `extraPortions` está vacío. */
  extraPortionsGroupRequired: boolean
  /** Máximo de porciones extras que el cliente puede elegir para este producto. */
  extraPortionsGroupMaxSelectable: number
  createdAt: string
  updatedAt: string
}

/** Catálogo global de salsas/cremas (ej. Mayonesa, Mostaza, Ketchup). */
export interface Sauce {
  id: string
  name: string
  active: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/**
 * Catálogo global de bebidas (ej. Coca-Cola, Inca Kola, Agua). Mismo patrón
 * que `Sauce`, con `price` — elegir una bebida suma al total del pedido
 * (confirmado contra beverage.entity.ts del backend).
 */
export interface Beverage {
  id: string
  name: string
  /** Precio en soles (la API expone number, no "5.00"). */
  price: number
  active: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/**
 * Catálogo global de porciones extras (ej. Papas extra, Tocino extra, Queso
 * extra). Mismo patrón que `Beverage` (confirmado contra
 * extra-portion.entity.ts del backend).
 */
export interface ExtraPortion {
  id: string
  name: string
  /** Precio en soles (la API expone number, no "8.00"). */
  price: number
  active: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CreateCategoryInput {
  name: string
  description?: string
  image?: string
  active?: boolean
  sortOrder?: number
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>

export interface CreateMenuItemInput {
  name: string
  description?: string
  price: number
  image?: string
  available?: boolean
  categoryId: string
  /**
   * UUIDs de las salsas del catálogo que este producto ofrece. Omitido o vacío
   * = sin selector de salsas en la app (ej. arroz chaufa).
   */
  sauceIds?: string[]
  /** Si el grupo de salsas es obligatorio (default false). Sin efecto si sauceIds queda vacío. */
  sauceGroupRequired?: boolean
  /** Máximo de salsas que el cliente puede elegir para este producto (default 1). */
  sauceGroupMaxSelectable?: number
  specialReward?: boolean
  /**
   * UUIDs de las bebidas del catálogo que este producto ofrece. Omitido o
   * vacío = sin selector de bebidas.
   */
  beverageIds?: string[]
  /** Si el grupo de bebidas es obligatorio (default false). Sin efecto si beverageIds queda vacío. */
  beverageGroupRequired?: boolean
  /** Máximo de bebidas que el cliente puede elegir para este producto (default 1). */
  beverageGroupMaxSelectable?: number
  /**
   * UUIDs de las porciones extras del catálogo que este producto ofrece.
   * Omitido o vacío = sin selector de porciones extras.
   */
  extraPortionIds?: string[]
  /** Si el grupo de porciones extras es obligatorio (default false). Sin efecto si extraPortionIds queda vacío. */
  extraPortionsGroupRequired?: boolean
  /** Máximo de porciones extras que el cliente puede elegir para este producto (default 1). */
  extraPortionsGroupMaxSelectable?: number
}

export type UpdateMenuItemInput = Partial<CreateMenuItemInput>

/** Resultado de POST /menu/items/:id/image (el item con la URL nueva). */
export type UploadImageResult = MenuItem

export interface CreateSauceInput {
  name: string
  active?: boolean
  sortOrder?: number
}

export type UpdateSauceInput = Partial<CreateSauceInput>

export interface CreateBeverageInput {
  name: string
  price: number
  active?: boolean
  sortOrder?: number
}

export type UpdateBeverageInput = Partial<CreateBeverageInput>

export interface CreateExtraPortionInput {
  name: string
  price: number
  active?: boolean
  sortOrder?: number
}

export type UpdateExtraPortionInput = Partial<CreateExtraPortionInput>