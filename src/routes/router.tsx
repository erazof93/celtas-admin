import { createBrowserRouter, Navigate } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import AdminLayout from '@/layouts/AdminLayout'
import LoginPage from '@/features/auth/LoginPage'
import DashboardPage from '@/features/dashboard/DashboardPage'
import MenuPage from '@/features/menu/MenuPage'
import OrdersPage from '@/features/orders/OrdersPage'
import CouponsPage from '@/features/coupons/CouponsPage'
import BannersPage from '@/features/banners/BannersPage'
import SettingsPage from '@/features/settings/SettingsPage'
import UsersPage from '@/features/users/UsersPage'

/**
 * Todas las rutas autenticadas viven DENTRO de AdminLayout (sidebar + topbar).
 * Las páginas de módulos pendientes son placeholders que se reemplazan cuando
 * llega su módulo en el ROADMAP.
 */
export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
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
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'menu', element: <MenuPage /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'coupons', element: <CouponsPage /> },
      { path: 'banners', element: <BannersPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'users', element: <UsersPage /> },
    ],
  },
])
