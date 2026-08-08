import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { del, get, patch, post } from '@/lib/api-client'
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  validateImageFile,
} from '@/lib/image-upload'
import type {
  CreateMenuItemInput,
  MenuItem,
  UpdateMenuItemInput,
} from '../types'

// Re-export de la validación compartida (src/lib/image-upload.ts) para no
// romper imports existentes. Los límites son los mismos para Menu y Banners.
export { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES, validateImageFile }

const ITEMS_KEY = ['menu', 'items'] as const

export function useMenuItems() {
  return useQuery({
    queryKey: ITEMS_KEY,
    queryFn: () => get<MenuItem[]>('/menu/items'),
  })
}

export function useCreateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMenuItemInput) =>
      post<MenuItem>('/menu/items', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ITEMS_KEY }),
  })
}

export function useUpdateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string } & UpdateMenuItemInput) =>
      patch<MenuItem>(`/menu/items/${input.id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ITEMS_KEY }),
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<void>(`/menu/items/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ITEMS_KEY }),
  })
}

/**
 * Toggle de disponibilidad rápido desde la lista (PATCH con { available }).
 * No es optimista: el switch queda deshabilitado mientras la mutación corre y
 * el valor real llega del backend en el refetch — si falla, la UI no queda
 * desincronizada.
 */
export function useToggleItemAvailable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; available: boolean }) =>
      patch<MenuItem>(`/menu/items/${input.id}`, { available: input.available }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ITEMS_KEY }),
  })
}

/**
 * Subida de imagen de un producto. Flujo real del backend: primero se crea el
 * item y luego se sube la imagen a POST /menu/items/:id/image (multipart,
 * campo "image", JPG/PNG/WEBP/GIF máx 5 MB).
 */
export function useUploadItemImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData()
      formData.append('image', file)
      return post<MenuItem>(`/menu/items/${id}/image`, formData)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ITEMS_KEY }),
  })
}