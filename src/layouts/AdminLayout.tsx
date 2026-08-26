import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Axe,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Settings,
  ShoppingBag,
  Star,
  TicketPercent,
  Users,
  Utensils,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { registerPushNotifications } from '@/lib/firebase'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/features/auth/store'
import { logout } from '@/features/auth/hooks'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/menu', label: 'Menú', icon: Utensils },
  { to: '/orders', label: 'Pedidos', icon: ShoppingBag },
  { to: '/coupons', label: 'Cupones', icon: TicketPercent },
  { to: '/banners', label: 'Banners', icon: ImageIcon },
  { to: '/star-promotions', label: 'Estrellas', icon: Star },
  { to: '/marketing', label: 'Marketing', icon: Megaphone },
  { to: '/settings', label: 'Configuración', icon: Settings },
  { to: '/users', label: 'Usuarios', icon: Users },
]

function Sidebar({
  onNavigate,
  onClose,
}: {
  /** Cierra el drawer en mobile tras navegar. */
  onNavigate?: () => void
  /** Solo en el drawer: muestra un botón X para cerrarlo. */
  onClose?: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <Axe className="text-celtas-orange size-5" />
        <span className="text-lg font-bold tracking-tight">
          Celtas <span className="text-celtas-gold">Admin</span>
        </span>
        {onClose ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Cerrar menú"
            className="ml-auto md:hidden"
            onClick={onClose}
          >
            <X />
          </Button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="text-muted-foreground px-3 pb-2 text-xs font-medium tracking-widest uppercase">
          Navegación
        </p>
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-celtas-orange/15 text-celtas-orange font-medium'
                  : 'text-muted-foreground hover:bg-celtas-orange/5 hover:text-celtas-cream',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    'size-4 shrink-0',
                    isActive
                      ? 'text-celtas-orange'
                      : 'text-muted-foreground group-hover:text-celtas-gold',
                  )}
                />
                <span className="flex-1">{label}</span>
                {isActive ? (
                  <span className="bg-celtas-orange size-1.5 rounded-full" />
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-border shrink-0 border-t px-4 py-3">
        <p className="text-muted-foreground text-xs">
          Celtas — panel de gestión
        </p>
      </div>
    </div>
  )
}

/**
 * Layout base del panel (MÓDULO 2): sidebar con navegación a todos los módulos
 * + topbar con el admin logueado y logout.
 *
 * Responsive: en desktop el sidebar es fijo; en pantallas chicas se convierte
 * en un drawer colapsable (el admin lo usa desde el celular/tablet del local).
 */
export default function AdminLayout() {
  const user = useAuthStore((s) => s.user)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // AdminLayout solo se monta en rutas autenticadas (detrás de
  // ProtectedRoute): es el punto temprano de la sesión donde pedir permiso
  // de notificaciones y registrar el token FCM. Cubre login fresco y sesión
  // restaurada al recargar. Best-effort, nunca bloquea el panel (ver
  // src/lib/firebase.ts) — no necesita cleanup ni dependerse del resultado.
  useEffect(() => {
    void registerPushNotifications()
  }, [])

  // Cierra con Escape, pensando en accesibilidad del drawer en mobile.
  useEffect(() => {
    if (!drawerOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen])

  const initials =
    user?.fullName
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() ||
    user?.email?.[0]?.toUpperCase() ||
    'U'

  return (
    <div className="bg-celtas-black text-celtas-cream flex min-h-screen">
      {/* Sidebar fijo — desktop */}
      <aside className="border-border bg-card sticky top-0 hidden h-screen w-64 shrink-0 border-r md:block">
        <Sidebar />
      </aside>

      {/* Drawer — mobile */}
      <aside
        className={cn(
          'border-border bg-card fixed inset-y-0 left-0 z-50 w-64 border-r shadow-xl transition-transform duration-200 md:hidden',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Sidebar
          onNavigate={() => setDrawerOpen(false)}
          onClose={() => setDrawerOpen(false)}
        />
      </aside>

      {/* Overlay del drawer */}
      {drawerOpen ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        />
      ) : null}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="border-border bg-celtas-black/80 sticky top-0 z-30 flex h-14 items-center justify-between border-b px-3 backdrop-blur sm:px-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Abrir menú"
              className="md:hidden"
              onClick={() => setDrawerOpen(true)}
            >
              {drawerOpen ? <X /> : <Menu />}
            </Button>
            <span className="text-sm font-semibold md:hidden">
              Celtas <span className="text-celtas-gold">Admin</span>
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm leading-tight font-medium">
                {user?.fullName}
              </p>
              <p className="text-muted-foreground text-xs leading-tight">
                {user?.email}
              </p>
            </div>
            <div className="bg-celtas-orange/15 ring-celtas-orange/30 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-celtas-gold ring-1 ring-inset">
              {initials}
            </div>
            <Button
              variant="ghost"
              onClick={logout}
              className="text-muted-foreground hover:text-celtas-red-light hover:bg-celtas-red/10"
              title="Cerrar sesión"
            >
              <LogOut />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </header>

        <main className="w-full flex-1 p-4 sm:p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
