import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/store'

/**
 * Guard de rutas autenticadas.
 *
 * - Sin sesión (sin accessToken o sin user): redirige a /login.
 * - Con sesión pero role !== 'admin': rechaza con mensaje claro. No debería
 *   pasar nunca vía este panel (el login es de admin), pero se cubre por si
 *   un cliente logueado intenta entrar.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  if (!accessToken || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (user.role !== 'admin') {
    return (
      <div className="bg-celtas-black text-celtas-cream flex min-h-screen items-center justify-center p-4">
        <div className="border-celtas-red/40 bg-card max-w-md rounded-lg border p-8 text-center">
          <h1 className="text-celtas-red text-2xl font-bold">
            Acceso denegado
          </h1>
          <p className="text-muted-foreground mt-3">
            Tu cuenta ({user.email}) no tiene permisos de administrador para
            usar este panel. Si crees que es un error, contacta al dueño del
            negocio.
          </p>
        </div>
      </div>
    )
  }

  return children
}
