import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { del, get, patch, post } from '@/lib/api-client'
import type { Beverage, CreateBeverageInput, UpdateBeverageInput } from '../types'

const BEVERAGES_KEY = ['menu', 'beverages'] as const

export function useBeverages() {
  return useQuery({
    queryKey: BEVERAGES_KEY,
    queryFn: () => get<Beverage[]>('/beverages'),
  })
}

export function useCreateBeverage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBeverageInput) =>
      post<Beverage>('/beverages', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BEVERAGES_KEY }),
  })
}

export function useUpdateBeverage() {
  const queryClient = useQueryClient()
  return useMutation({
    // El `id` va en el path, NUNCA en el body: UpdateBeverageDto no lo declara y
    // el ValidationPipe del backend usa forbidNonWhitelisted (400 si viaja) —
    // mismo bug de clase ya corregido en categorías/productos/banners/salsas.
    mutationFn: (input: { id: string } & UpdateBeverageInput) => {
      const { id, ...body } = input
      return patch<Beverage>(`/beverages/${id}`, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BEVERAGES_KEY })
      // Un producto puede mostrar la bebida embebida (GET /menu/items) — si se
      // renombra o cambia de precio, esa vista también debe refrescar.
      queryClient.invalidateQueries({ queryKey: ['menu', 'items'] })
    },
  })
}

export function useDeleteBeverage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<void>(`/beverages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BEVERAGES_KEY })
      // Borrar una bebida la quita de la relación de cualquier producto que la
      // tuviera asignada (el backend limpia menu_item_beverages) — refrescar items.
      queryClient.invalidateQueries({ queryKey: ['menu', 'items'] })
    },
  })
}
