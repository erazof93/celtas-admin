import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { del, get, patch, post } from '@/lib/api-client'
import type {
  CreateExtraPortionInput,
  ExtraPortion,
  UpdateExtraPortionInput,
} from '../types'

const EXTRA_PORTIONS_KEY = ['menu', 'extra-portions'] as const

export function useExtraPortions() {
  return useQuery({
    queryKey: EXTRA_PORTIONS_KEY,
    queryFn: () => get<ExtraPortion[]>('/extra-portions'),
  })
}

export function useCreateExtraPortion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateExtraPortionInput) =>
      post<ExtraPortion>('/extra-portions', input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: EXTRA_PORTIONS_KEY }),
  })
}

export function useUpdateExtraPortion() {
  const queryClient = useQueryClient()
  return useMutation({
    // El `id` va en el path, NUNCA en el body: UpdateExtraPortionDto no lo
    // declara y el ValidationPipe del backend usa forbidNonWhitelisted (400 si
    // viaja) — mismo bug de clase ya corregido en categorías/productos/banners/salsas.
    mutationFn: (input: { id: string } & UpdateExtraPortionInput) => {
      const { id, ...body } = input
      return patch<ExtraPortion>(`/extra-portions/${id}`, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EXTRA_PORTIONS_KEY })
      // Un producto puede mostrar la porción extra embebida (GET /menu/items)
      // — si se renombra o cambia de precio, esa vista también debe refrescar.
      queryClient.invalidateQueries({ queryKey: ['menu', 'items'] })
    },
  })
}

export function useDeleteExtraPortion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<void>(`/extra-portions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EXTRA_PORTIONS_KEY })
      // Borrar una porción extra la quita de la relación de cualquier producto
      // que la tuviera asignada (el backend limpia menu_item_extra_portions).
      queryClient.invalidateQueries({ queryKey: ['menu', 'items'] })
    },
  })
}
