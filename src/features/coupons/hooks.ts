import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, post } from '@/lib/api-client'
import type {
  BulkCouponResult,
  Coupon,
  CouponStatus,
  GenerateBulkCouponInput,
  GenerateCouponInput,
  PaginatedCoupons,
} from './types'

const COUPONS_LIST_KEY = ['coupons', 'list'] as const

export function useCoupons(
  page: number,
  limit: number,
  status?: CouponStatus,
  userId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: [
      'coupons',
      'list',
      page,
      limit,
      status ?? 'all',
      userId ?? 'all',
    ],
    queryFn: () =>
      get<PaginatedCoupons>('/coupons', {
        params: {
          page,
          limit,
          ...(status ? { status } : {}),
          ...(userId ? { userId } : {}),
        },
      }),
    enabled,
  })
}

/**
 * Generación manual de un cupón (campaña). El backend valida el 100% para
 * percentage (400) y que el usuario exista (404); el frontend ya valida el
 * 100% en el cliente para evitar el submit inútil.
 */
export function useGenerateCoupon() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: GenerateCouponInput) =>
      post<Coupon>('/coupons/generate', input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: COUPONS_LIST_KEY }),
  })
}

/**
 * Generación masiva de campaña (POST /coupons/generate-bulk): un cupón por
 * cada usuario con role cliente. Acción de impacto real — el componente que
 * la usa exige confirmación explícita antes de llamar a mutateAsync.
 */
export function useGenerateBulkCoupons() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: GenerateBulkCouponInput) =>
      post<BulkCouponResult>('/coupons/generate-bulk', input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: COUPONS_LIST_KEY }),
  })
}