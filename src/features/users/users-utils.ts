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