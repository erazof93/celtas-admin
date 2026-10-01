import { useQuery } from '@tanstack/react-query'
import { get } from '@/lib/api-client'
import { previousPeriod, toPeriodParam } from '../report-utils'
import type { ReportComparison } from '../types/reports'

/**
 * GET /admin/reports/comparison: el rango elegido contra el período anterior
 * de la misma duración. El backend recibe `current` y `previous` como
 * "YYYY-MM-DD:YYYY-MM-DD" (no startDate/endDate).
 */
export function useReportComparison(startDate: string, endDate: string) {
  const prev = previousPeriod(startDate, endDate)
  const current = toPeriodParam(startDate, endDate)
  const previous = toPeriodParam(prev.startDate, prev.endDate)

  return useQuery({
    queryKey: ['reports', 'comparison', current, previous],
    queryFn: () =>
      get<ReportComparison>('/admin/reports/comparison', {
        params: { current, previous },
      }),
  })
}
