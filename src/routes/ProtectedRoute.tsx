import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { confirmCurrentUser } from '@/lib/api-client'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
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
  const status = useAuthStore((s) => s.roleStatus)
  const sessionId = useAuthStore((s) => s.sessionId)
  useEffect(() => {
    if (accessToken && user?.role === 'admin' && status === 'unverified')
      void confirmCurrentUser().catch(() => undefined)
  }, [accessToken, user?.role, status, sessionId])

  if (!accessToken || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (user.role !== 'admin') {
    return (
      <div className="bg-celtas-black text-celtas-cream flex min-h-screen items-center justify-center p-4">
        <div className="border-celtas-red/40 bg-card max-w-md rounded-lg border p-8 text-center">
          <h1 className="text-celtas-red-light text-2xl font-bold">
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

  if (status === 'error')
    return (
      <ErrorState
        title="No se pudo comprobar el acceso administrativo"
        description="Tu sesión se conserva. Reintenta para confirmar tus permisos."
        onRetry={() => {
          void confirmCurrentUser().catch(() => undefined)
        }}
      />
    )
  if (status !== 'confirmed')
    return <LoadingState label="Comprobando acceso administrativo…" />
  return children
}
