import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { del, get, patch, post } from '@/lib/api-client'
import type {
  CreateFriesTypeInput,
  FriesType,
  UpdateFriesTypeInput,
} from '../types'

const FRIES_TYPES_KEY = ['menu', 'fries-types'] as const

export function useFriesTypes() {
  return useQuery({
    queryKey: FRIES_TYPES_KEY,
    queryFn: () => get<FriesType[]>('/fries-types'),
  })
}

export function useCreateFriesType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateFriesTypeInput) =>
      post<FriesType>('/fries-types', input),
    // Crear uno con isDefault=true desmarca el default anterior en el backend:
    // se refresca la lista entera, no solo se agrega el nuevo.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FRIES_TYPES_KEY }),
  })
}

export function useUpdateFriesType() {
  const queryClient = useQueryClient()
  return useMutation({
    // El `id` va en el path, NUNCA en el body: UpdateFriesTypeDto no lo declara
    // y el ValidationPipe del backend usa forbidNonWhitelisted (400 si viaja) —
    // mismo bug de clase ya corregido en categorías/productos/banners/salsas.
    mutationFn: (input: { id: string } & UpdateFriesTypeInput) => {
      const { id, ...body } = input
      return patch<FriesType>(`/fries-types/${id}`, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FRIES_TYPES_KEY })
      // Los productos embeben sus tipos de papas (GET /menu/items).
      queryClient.invalidateQueries({ queryKey: ['menu', 'items'] })
    },
  })
}

export function useDeleteFriesType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<void>(`/fries-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FRIES_TYPES_KEY })
      // El backend limpia menu_item_fries_types antes de borrar — refrescar items.
      queryClient.invalidateQueries({ queryKey: ['menu', 'items'] })
    },
  })
}
