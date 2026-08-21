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

/**
 * Horario de un día (dentro de `business_hours_schedule`). `open`/`close` en
 * formato `HH:mm`, hora local de Lima. `close <= open` es un cruce de
 * medianoche VÁLIDO (ej. abre 11:00, cierra 01:00 del día siguiente) — espejo
 * de `DaySchedule` en settings.service.ts del backend.
 */
export interface DaySchedule {
  closed: boolean
  open: string
  close: string
}

/** Claves "0" (domingo) a "6" (sábado), igual convención que `Banner.daysOfWeek`. */
export type WeeklySchedule = Record<string, DaySchedule>

/**
 * Ubicación del local (JSON de `store_location`). Espejo de `StoreLocation`
 * en settings.service.ts del backend — sembrada SIN configurar (value `''`)
 * hasta que el admin la carga desde esta pantalla.
 */
export interface StoreLocation {
  latitude: number
  longitude: number
}

/**
 * Un tramo de la tabla de tarifas de delivery: aplica a pedidos con distancia
 * `<= maxMeters`. `maxMeters: null` = tarifa plana sin techo (debe ser el
 * ÚLTIMO tramo del array) — espejo exacto de `DeliveryFeeTier` en
 * settings.service.ts del backend.
 */
export interface DeliveryFeeTier {
  maxMeters: number | null
  fee: number
}