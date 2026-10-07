import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, patch } from '@/lib/api-client'
import type { Setting, UpdateSettingInput } from './types'
import { DELIVERY_MODE_KEY } from './delivery-mode'

const SETTINGS_KEY = ['settings'] as const

/** GET /settings (admin): TODAS las settings, array de {id, key, value, ...}. */
export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => get<Setting[]>('/settings'),
  })
}

/**
 * Upsert de una setting (PATCH /settings, body { key, value, description? }).
 * El contrato NO tiene id en el body: la key identifica la fila.
 */
export function useUpsertSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateSettingInput) =>
      patch<Setting>('/settings', input),
    onSuccess: async (setting, input) => {
      if (input.key === DELIVERY_MODE_KEY) {
        await queryClient.cancelQueries({ queryKey: ['delivery', 'estimate'] })
        queryClient.setQueryData<Setting[]>(SETTINGS_KEY, (previous) =>
          previous
            ? previous.some((item) => item.key === input.key)
              ? previous.map((item) =>
                  item.key === input.key ? setting : item,
                )
              : [...previous, setting]
            : undefined,
        )
        // Remove previous prices immediately; invalidation alone retains stale data.
        await queryClient.resetQueries({ queryKey: ['delivery', 'estimate'] })
      }
      await queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })
}
