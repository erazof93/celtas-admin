import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { del, get, patch, post } from '@/lib/api-client'
import type {
  CreateRewardMilestoneInput,
  RewardMilestone,
  UpdateRewardMilestoneInput,
} from './types'

const REWARD_MILESTONES_KEY = ['reward-milestones'] as const

/** GET /reward-milestones (admin): todos los hitos, ASC por starsRequired. */
export function useRewardMilestones() {
  return useQuery({
    queryKey: REWARD_MILESTONES_KEY,
    queryFn: () => get<RewardMilestone[]>('/reward-milestones'),
  })
}

export function useCreateRewardMilestone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRewardMilestoneInput) =>
      post<RewardMilestone>('/reward-milestones', input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: REWARD_MILESTONES_KEY }),
  })
}

export function useUpdateRewardMilestone() {
  const queryClient = useQueryClient()
  return useMutation({
    // El `id` va en el path, NUNCA en el body: UpdateRewardMilestoneDto no lo
    // declara y el ValidationPipe del backend usa forbidNonWhitelisted (400
    // si viaja).
    mutationFn: (input: { id: string } & UpdateRewardMilestoneInput) => {
      const { id, ...body } = input
      return patch<RewardMilestone>(`/reward-milestones/${id}`, body)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: REWARD_MILESTONES_KEY }),
  })
}

/** DELETE real: un hito borrado no afecta premios ya otorgados (snapshot, no FK). */
export function useDeleteRewardMilestone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<void>(`/reward-milestones/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: REWARD_MILESTONES_KEY }),
  })
}
