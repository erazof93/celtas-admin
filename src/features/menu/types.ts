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
  categoryId: string
  /** Relación cargada por GET /menu/items. */
  category: Category
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
}

export type UpdateMenuItemInput = Partial<CreateMenuItemInput>

/** Resultado de POST /menu/items/:id/image (el item con la URL nueva). */
export type UploadImageResult = MenuItem