/**
 * Tipos del módulo settings — espejo del contrato real del backend.
 * Confirmados contra la fuente: src/modules/settings/{entities,dto} del backend.
 */

/** Fila de la tabla settings (GET /settings devuelve un ARRAY de estas). */
export interface Setting {
  id: string
  key: string
  value: string
  description: string | null
  createdAt: string
  updatedAt: string
}

/** Body de PATCH /settings (upsert por key — el id NO viaja en el body). */
export interface UpdateSettingInput {
  key: string
  value: string
  description?: string
}