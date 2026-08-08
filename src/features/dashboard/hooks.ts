import { useQuery } from '@tanstack/react-query'
import { get } from '@/lib/api-client'
import type { DashboardSummary, TopProductsResult } from './types'

/**
 * Hooks de React Query del dashboard — los componentes nunca llaman a Axios
 * directo. Ambos endpoints son opcionales en from/to: si no se pasan, el
 * backend usa "hoy" en America/Lima (la lógica de fechas vive en el backend,
 * no se reinventa aquí).
 */

export function useDashboardSummary(from?: string, to?: string) {
  return useQuery({
    queryKey: ['dashboard', 'summary', from, to],
    queryFn: () =>
      get<DashboardSummary>('/admin/dashboard/summary', {
        params: { from, to },
      }),
  })
}

export function useDashboardTopProducts(
  from?: string,
  to?: string,
  limit = 10,
) {
  return useQuery({
    queryKey: ['dashboard', 'top-products', from, to, limit],
    queryFn: () =>
      get<TopProductsResult>('/admin/dashboard/top-products', {
        params: { from, to, limit },
      }),
  })
}