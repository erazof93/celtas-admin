import type { OrderStatus } from './types'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  en_camino: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

/** Clases de badge por estado (paleta celtas + semánticos). */
export const ORDER_STATUS_BADGE: Record<OrderStatus, string> = {
  pendiente: 'bg-amber-400/15 text-amber-400',
  confirmado: 'bg-sky-400/15 text-sky-400',
  en_camino: 'bg-celtas-orange/15 text-celtas-orange',
  entregado: 'bg-emerald-400/15 text-emerald-400',
  cancelado: 'bg-celtas-red/15 text-celtas-red-light',
}

/**
 * Matriz de transiciones válidas — espejo exacto de VALID_TRANSITIONS del
 * backend (orders.service.ts). La UI solo ofrece estos botones; el backend
 * rechaza con 400 cualquier otra transición.
 */
export const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pendiente: ['confirmado', 'cancelado'],
  confirmado: ['en_camino', 'cancelado'],
  en_camino: ['entregado', 'cancelado'],
  entregado: [],
  cancelado: [],
}

/** Etiqueta de la acción para cada estado destino (botones de transición). */
export const TRANSITION_ACTION_LABELS: Record<OrderStatus, string> = {
  pendiente: 'Marcar pendiente',
  confirmado: 'Confirmar',
  en_camino: 'En camino',
  entregado: 'Marcar entregado',
  cancelado: 'Cancelar pedido',
}