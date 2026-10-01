import { useQuery } from '@tanstack/react-query'
import { get } from '@/lib/api-client'
import type { ConversionReport } from '../types/reports'

/**
 * GET /admin/reports/conversion: clientes por teléfono del rango que después
 * compraron por la app. El backend no trae tendencia: para "vs período
 * anterior" la página llama a este mismo hook con el rango anterior.
 */
export function useReportConversion(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['reports', 'conversion', startDate, endDate],
    queryFn: () =>
      get<ConversionReport>('/admin/reports/conversion', {
        params: { startDate, endDate },
      }),
  })
}
