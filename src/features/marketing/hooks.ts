import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, post } from '@/lib/api-client'
import type {
  BroadcastNotificationInput,
  BroadcastResult,
  MarketingBroadcast,
} from './types'

const BROADCAST_HISTORY_KEY = ['marketing', 'broadcast-history'] as const

/** Historial de campañas enviadas (GET /notifications/broadcast-history). */
export function useBroadcastHistory() {
  return useQuery({
    queryKey: BROADCAST_HISTORY_KEY,
    queryFn: () =>
      get<MarketingBroadcast[]>('/notifications/broadcast-history'),
  })
}

/**
 * Envío de campaña de marketing a TODOS los usuarios con fcmToken
 * (POST /notifications/broadcast). Acción de impacto real — el componente
 * que la usa exige confirmación explícita antes de llamar a mutateAsync.
 */
export function useSendBroadcast() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BroadcastNotificationInput) =>
      post<BroadcastResult>('/notifications/broadcast', input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: BROADCAST_HISTORY_KEY }),
  })
}
