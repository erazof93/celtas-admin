/**
 * Tipos del módulo banners — espejo del contrato real del backend.
 * Confirmados contra la fuente: src/modules/banners/{entities,dto} del backend.
 */

export type BannerActionType = 'none' | 'category' | 'menuItem' | 'external_url'

/** Vigencia EFECTIVA calculada en el frontend (active + fechas). */
export type BannerVigencia = 'vigente' | 'programado' | 'vencido' | 'inactivo'

export interface Banner {
  id: string
  title: string
  /** URL de la imagen (Cloudinary), se sube aparte con POST /banners/:id/image. */
  imageUrl: string | null
  actionType: BannerActionType
  /** Slug de categoría, id de producto o URL externa según actionType. */
  actionValue: string | null
  /** Opcionales: si no hay fechas, el banner es vigente mientras active sea true. */
  startDate: string | null
  endDate: string | null
  active: boolean
  /**
   * Días de la semana en que se muestra el banner (0=domingo ... 6=sábado).
   * null o vacío = todos los días.
   */
  daysOfWeek: number[] | null
  /** Posición de visualización (ascendente). */
  order: number
  createdAt: string
  updatedAt: string
}

export interface CreateBannerInput {
  title: string
  actionType: BannerActionType
  /** Obligatorio si actionType no es none. */
  actionValue?: string
  /** ISO string (el backend lo parsea con @Type(() => Date)). */
  startDate?: string
  endDate?: string
  active?: boolean
  /** 0=domingo ... 6=sábado. null/omitido = todos los días. */
  daysOfWeek?: number[] | null
}

export type UpdateBannerInput = Partial<CreateBannerInput>

/** Item del body de PATCH /banners/reorder: { items: [{ id, order }] }. */
export interface ReorderBannerItem {
  id: string
  order: number
}