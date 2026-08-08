import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { del, get, patch, post } from '@/lib/api-client'
import type {
  Banner,
  CreateBannerInput,
  ReorderBannerItem,
  UpdateBannerInput,
} from './types'

const BANNERS_KEY = ['banners'] as const

/** GET /banners (admin): TODOS los banners, sin paginar, ordenados por order ASC. */
export function useBanners() {
  return useQuery({
    queryKey: BANNERS_KEY,
    queryFn: () => get<Banner[]>('/banners'),
  })
}

export function useCreateBanner() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBannerInput) => post<Banner>('/banners', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BANNERS_KEY }),
  })
}

export function useUpdateBanner() {
  const queryClient = useQueryClient()
  return useMutation({
    // El `id` va en el path, NUNCA en el body: UpdateBannerDto no lo declara y
    // el ValidationPipe del backend usa forbidNonWhitelisted (400 si viaja).
    mutationFn: (input: { id: string } & UpdateBannerInput) => {
      const { id, ...body } = input
      return patch<Banner>(`/banners/${id}`, body)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BANNERS_KEY }),
  })
}

export function useDeleteBanner() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<void>(`/banners/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BANNERS_KEY }),
  })
}

/**
 * Subida de imagen de un banner. Flujo real del backend: primero se crea el
 * banner y luego se sube la imagen a POST /banners/:id/image (multipart,
 * campo "image", JPG/PNG/WEBP/GIF máx 5 MB) — mismo approach que Menu.
 */
export function useUploadBannerImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData()
      formData.append('image', file)
      return post<Banner>(`/banners/${id}/image`, formData)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BANNERS_KEY }),
  })
}

/**
 * Reordenamiento en batch (PATCH /banners/reorder, body { items: [{id, order}] }).
 * Optimista: reordena el cache al instante y revierte si el backend falla.
 */
export function useReorderBanners() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (items: ReorderBannerItem[]) =>
      patch<Banner[]>('/banners/reorder', { items }),
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: BANNERS_KEY })
      const previous = queryClient.getQueryData<Banner[]>(BANNERS_KEY)
      queryClient.setQueryData<Banner[]>(BANNERS_KEY, (old) => {
        if (!old) return old
        const orderMap = new Map(items.map((item) => [item.id, item.order]))
        return [...old].sort(
          (a, b) =>
            (orderMap.get(a.id) ?? a.order) - (orderMap.get(b.id) ?? b.order),
        )
      })
      return { previous }
    },
    onError: (_error, _items, context) => {
      if (context?.previous) {
        queryClient.setQueryData(BANNERS_KEY, context.previous)
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: BANNERS_KEY }),
  })
}