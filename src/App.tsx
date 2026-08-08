import { RouterProvider } from 'react-router-dom'
import { router } from '@/routes/router'
import { useBootstrap } from '@/features/auth/hooks'

/**
 * Al montar la app: si hay refreshToken en localStorage pero el store está
 * vacío (recién recargó), se intenta refrescar ANTES de decidir si mostrar
 * login o el panel. Mientras tanto, pantalla de carga.
 */
export default function App() {
  const bootstrap = useBootstrap()

  if (bootstrap.isLoading) {
    return (
      <div className="bg-celtas-black text-celtas-cream flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="border-celtas-orange mx-auto h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
          <p className="text-muted-foreground mt-4 text-sm">
            Cargando sesión… Esto puede tardar un poco la primera vez.
          </p>
        </div>
      </div>
    )
  }

  return <RouterProvider router={router} />
}
