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
    mutationFn: (input: { id: string } & UpdateCategoryInput) =>
      patch<Category>(`/menu/categories/${input.id}`, input),
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