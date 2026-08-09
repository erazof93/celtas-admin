import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, patch } from '@/lib/api-client'
import type { Setting, UpdateSettingInput } from './types'

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })
}