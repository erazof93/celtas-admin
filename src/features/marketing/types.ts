/**
 * Tipos del módulo marketing — espejo del contrato real del backend.
 * Confirmados contra la fuente (../backend-celtas/src/modules/notifications/),
 * NO solo contra Swagger: `POST /notifications/broadcast` y
 * `GET /notifications/broadcast-history` no tienen `@ApiResponse({ type })`
 * en el controller, así que `src/types/api.d.ts` no documenta el schema de
 * respuesta (queda como `content?: never`). El tipo real viene de leer
 * `NotificationsService.sendMarketingBroadcast`/`getBroadcastHistory` y la
 * entidad `MarketingNotification` directamente.
 */

/** Body de POST /notifications/broadcast (BroadcastNotificationDto). */
export interface BroadcastNotificationInput {
  title: string
  body: string
  /**
   * Link opcional al que navega la app al tocar la notificación (deep link
   * o URL), máx. 500 caracteres — espejo de `BroadcastNotificationDto.link`
   * (`@IsOptional`/`@MaxLength(500)`, confirmado contra el código fuente
   * real de `backend-celtas`, commit `9c97272`). Ya está en producción y
   * documentado en `api.d.ts` (confirmado corriendo `generate:types` el
   * 2026-09-17, después de agregar este campo — Render desplegó el commit
   * durante esta misma sesión); se mantiene tipado a mano acá por
   * consistencia con `title`/`body` de esta misma interfaz, que ya se
   * escriben a mano por el DTO de respuesta sin `@ApiResponse` (ver
   * comentario del archivo).
   */
  link?: string
}

/**
 * Respuesta de POST /notifications/broadcast. Confirmado contra
 * NotificationsService.sendMarketingBroadcast() (backend real): reenvía el
 * mismo { sent, total } que ya devuelve broadcastPushNotification.
 */
export interface BroadcastResult {
  sent: number
  total: number
}

/**
 * Fila del historial (GET /notifications/broadcast-history). Espejo de la
 * entidad MarketingNotification del backend. `adminId` puede ser `null` (FK
 * ON DELETE SET NULL si se borra la cuenta del admin que la envió). La
 * relación `admin` no se serializa: getBroadcastHistory() no la carga.
 */
export interface MarketingBroadcast {
  id: string
  title: string
  body: string
  link: string | null
  adminId: string | null
  sentCount: number
  totalCount: number
  createdAt: string
}
