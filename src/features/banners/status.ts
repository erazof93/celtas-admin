import type { BannerActionType, BannerVigencia } from './types'

export const BANNER_VIGENCIA_LABELS: Record<BannerVigencia, string> = {
  vigente: 'Vigente ahora',
  programado: 'Programado',
  vencido: 'Vencido',
  inactivo: 'Inactivo',
}

export const BANNER_VIGENCIA_BADGE: Record<BannerVigencia, string> = {
  vigente: 'bg-emerald-400/15 text-emerald-400',
  programado: 'bg-sky-400/15 text-sky-400',
  vencido: 'bg-celtas-red/15 text-celtas-red',
  inactivo: 'bg-muted text-muted-foreground',
}

export const BANNER_ACTION_TYPE_LABELS: Record<BannerActionType, string> = {
  none: 'Sin acción',
  category: 'Categoría',
  menuItem: 'Producto',
  external_url: 'URL externa',
}