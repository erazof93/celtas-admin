import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { del, get, patch, post } from '@/lib/api-client'
import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../types'

const CATEGORIES_KEY = ['menu', 'categories'] as const

export function useCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => get<Category[]>('/menu/categories'),
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCategoryInput) =>
      post<Category>('/menu/categories', input),
    onSuccess: () => {
      // Una categoría nueva/renombrada también cambia la vista de productos
      // (los items embed la categoría), así que se invalidan ambas listas.
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY })
      queryClient.invalidateQueries({ queryKey: ['menu', 'items'] })
    },
  })
}

export function useUpdateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    // El `id` va en el path, NUNCA en el body: UpdateCategoryDto no lo declara
    // y el ValidationPipe del backend usa forbidNonWhitelisted (400 si viaja).
    mutationFn: (input: { id: string } & UpdateCategoryInput) => {
      const { id, ...body } = input
      return patch<Category>(`/menu/categories/${id}`, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY })
      queryClient.invalidateQueries({ queryKey: ['menu', 'items'] })
    },
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<void>(`/menu/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY })
      queryClient.invalidateQueries({ queryKey: ['menu', 'items'] })
    },
  })
}