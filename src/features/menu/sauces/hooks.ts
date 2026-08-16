import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { del, get, patch, post } from '@/lib/api-client'
import type { CreateSauceInput, Sauce, UpdateSauceInput } from '../types'

const SAUCES_KEY = ['menu', 'sauces'] as const

export function useSauces() {
  return useQuery({
    queryKey: SAUCES_KEY,
    queryFn: () => get<Sauce[]>('/sauces'),
  })
}

export function useCreateSauce() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSauceInput) => post<Sauce>('/sauces', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SAUCES_KEY }),
  })
}

export function useUpdateSauce() {
  const queryClient = useQueryClient()
  return useMutation({
    // El `id` va en el path, NUNCA en el body: UpdateSauceDto no lo declara y
    // el ValidationPipe del backend usa forbidNonWhitelisted (400 si viaja) —
    // mismo bug de clase ya corregido en categorías/productos/banners.
    mutationFn: (input: { id: string } & UpdateSauceInput) => {
      const { id, ...body } = input
      return patch<Sauce>(`/sauces/${id}`, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SAUCES_KEY })
      // Un producto puede mostrar la salsa embebida (GET /menu/items) — si se
      // renombra o desactiva, esa vista también debe refrescar.
      queryClient.invalidateQueries({ queryKey: ['menu', 'items'] })
    },
  })
}

export function useDeleteSauce() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<void>(`/sauces/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SAUCES_KEY })
      // Borrar una salsa la quita de la relación de cualquier producto que la
      // tuviera asignada (el backend limpia menu_item_sauces) — refrescar items.
      queryClient.invalidateQueries({ queryKey: ['menu', 'items'] })
    },
  })
}
