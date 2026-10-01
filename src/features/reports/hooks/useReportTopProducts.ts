import { useQuery } from '@tanstack/react-query'
import { get } from '@/lib/api-client'
import type { ReportChannel, TopProduct } from '../types/reports'

/**
 * GET /admin/reports/top-products: array plano, ordenado por cantidad. Es el
 * único reporte donde el backend filtra por canal. limit: 1-50.
 */
export function useReportTopProducts(
  startDate: string,
  endDate: string,
  channel: ReportChannel,
  limit = 10,
) {
  return useQuery({
    queryKey: ['reports', 'top-products', startDate, endDate, channel, limit],
    queryFn: () =>
      get<TopProduct[]>('/admin/reports/top-products', {
        params: { startDate, endDate, channel, limit },
      }),
  })
}
