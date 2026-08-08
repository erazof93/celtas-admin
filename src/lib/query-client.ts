import { QueryClient } from '@tanstack/react-query'

/**
 * Instancia única de TanStack Query.
 *
 * `retry: 1` + `retryDelay` creciente: el backend de Render puede tardar
 * 30-50s en despertar tras inactividad — no queremos 3 reintentos inmediatos,
 * pero sí un reintento por si el primer intento falla por el cold start.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})
