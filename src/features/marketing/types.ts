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
  adminId: string | null
  sentCount: number
  totalCount: number
  createdAt: string
}
