/* eslint-disable react-refresh/only-export-components -- router.tsx es un
   archivo de configuración de rutas, no un componente: los lazy() que define
   no son componentes propios y Fast Refresh no aplica aquí. */
import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import AdminLayout from '@/layouts/AdminLayout'
import { LoadingState } from '@/components/ui/LoadingState'

/**
 * Lazy loading por feature: cada página se descarga en su propio chunk al
 * navegar (code-splitting). El fallback es el LoadingState genérico del panel.
 */
const LoginPage = lazy(() => import('@/features/auth/LoginPage'))
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const MenuPage = lazy(() => import('@/features/menu/MenuPage'))
const OrdersPage = lazy(() => import('@/features/orders/OrdersPage'))
const CouponsPage = lazy(() => import('@/features/coupons/CouponsPage'))
const BannersPage = lazy(() => import('@/features/banners/BannersPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))
const UsersPage = lazy(() => import('@/features/users/UsersPage'))

function PageFallback() {
  return <LoadingState label="Cargando módulo…" />
}

/**
 * Todas las rutas autenticadas viven DENTRO de AdminLayout (sidebar + topbar).
 * Cada página es un chunk separado (React.lazy) — el bundle principal queda
 * chico y cada módulo se descarga al navegar a él.
 */
export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <Suspense fallback={<PageFallback />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: 'dashboard',
        element: (
          <Suspense fallback={<PageFallback />}>
            <DashboardPage />
          </Suspense>
        ),
      },
      {
        path: 'menu',
        element: (
          <Suspense fallback={<PageFallback />}>
            <MenuPage />
          </Suspense>
        ),
      },
      {
        path: 'orders',
        element: (
          <Suspense fallback={<PageFallback />}>
            <OrdersPage />
          </Suspense>
        ),
      },
      {
        path: 'coupons',
        element: (
          <Suspense fallback={<PageFallback />}>
            <CouponsPage />
          </Suspense>
        ),
      },
      {
        path: 'banners',
        element: (
          <Suspense fallback={<PageFallback />}>
            <BannersPage />
          </Suspense>
        ),
      },
      {
        path: 'settings',
        element: (
          <Suspense fallback={<PageFallback />}>
            <SettingsPage />
          </Suspense>
        ),
      },
      {
        path: 'users',
        element: (
          <Suspense fallback={<PageFallback />}>
            <UsersPage />
          </Suspense>
        ),
      },
    ],
  },
])