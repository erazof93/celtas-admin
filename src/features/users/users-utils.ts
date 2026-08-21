import type { AdminUser, UserRole } from './types'

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  cliente: 'Cliente',
}

export const USER_ROLE_BADGE: Record<UserRole, string> = {
  admin: 'bg-celtas-gold/15 text-celtas-gold',
  cliente: 'bg-muted text-muted-foreground',
}

/** Formatea el total gastado en soles (el backend lo expone como number). */
export function formatTotalSpent(value: number): string {
  return `S/ ${value.toFixed(2)}`
}

/**
 * URL de la Static Maps API de Geoapify para una dirección con coordenadas
 * (formato confirmado contra la doc real, apidocs.geoapify.com/docs/maps —
 * no asumido). Mapa de solo lectura, sin librería de mapas interactivo.
 * `apiKey` se recibe como parámetro (no lee `import.meta.env` acá) para que
 * la función sea pura y testeable sin depender del entorno de Vite/Vitest.
 */
export function buildAddressMapUrl(
  latitude: number,
  longitude: number,
  apiKey: string,
): string {
  const coords = `lonlat:${longitude},${latitude}`
  return (
    'https://maps.geoapify.com/v1/staticmap' +
    `?style=osm-carto&width=400&height=200&center=${coords}&zoom=15` +
    `&marker=${coords};color:%23ff0000&apiKey=${encodeURIComponent(apiKey)}`
  )
}

/**
 * URL de búsqueda de Google Maps para una dirección con coordenadas (mismo
 * criterio que `order.whatsappUrl` en el detalle de pedido: un link externo
 * que abre en pestaña nueva, `target="_blank" rel="noopener noreferrer"`).
 */
export function buildGoogleMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
}

/**
 * Filtro de búsqueda en el CLIENTE sobre la página actual. El backend de
 * GET /users NO soporta búsqueda server-side (QueryUsersDto solo tiene
 * page/limit) — este filtro es un atajo visual, no una búsqueda global.
 * Busca por nombre o email (case-insensitive, substring).
 */
export function filterUsersByQuery(
  users: AdminUser[],
  query: string,
): AdminUser[] {
  const q = query.trim().toLowerCase()
  if (!q) return users
  return users.filter(
    (u) =>
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q),
  )
}