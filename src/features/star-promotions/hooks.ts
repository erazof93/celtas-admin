import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, patch, post } from '@/lib/api-client'
import type {
  CreateStarPromotionInput,
  StarPromotion,
  UpdateStarPromotionInput,
} from './types'

const STAR_PROMOTIONS_KEY = ['star-promotions'] as const

/** GET /star-promotions (admin): TODAS las promociones, sin paginar. */
export function useStarPromotions() {
  return useQuery({
    queryKey: STAR_PROMOTIONS_KEY,
    queryFn: () => get<StarPromotion[]>('/star-promotions'),
  })
}

export function useCreateStarPromotion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStarPromotionInput) =>
      post<StarPromotion>('/star-promotions', input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: STAR_PROMOTIONS_KEY }),
  })
}

export function useUpdateStarPromotion() {
  const queryClient = useQueryClient()
  return useMutation({
    // El `id` va en el path, NUNCA en el body: UpdateStarPromotionDto no lo
    // declara y el ValidationPipe del backend usa forbidNonWhitelisted (400
    // si viaja).
    mutationFn: (input: { id: string } & UpdateStarPromotionInput) => {
      const { id, ...body } = input
      return patch<StarPromotion>(`/star-promotions/${id}`, body)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: STAR_PROMOTIONS_KEY }),
  })
}
