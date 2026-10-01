import { useQuery } from '@tanstack/react-query'
import { get } from '@/lib/api-client'
import type { ReportGroupBy, ReportSummaryData } from '../types/reports'

/**
 * GET /admin/reports/summary: totales, desglose por canal y una fila por
 * período (day/week/month). El backend no filtra por canal aquí — trae ambos.
 */
export function useReportSummary(
  startDate: string,
  endDate: string,
  groupBy: ReportGroupBy,
) {
  return useQuery({
    queryKey: ['reports', 'summary', startDate, endDate, groupBy],
    queryFn: () =>
      get<ReportSummaryData>('/admin/reports/summary', {
        params: { startDate, endDate, groupBy },
      }),
  })
}
