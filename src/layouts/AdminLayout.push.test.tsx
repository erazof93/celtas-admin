import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdminLayout from './AdminLayout'

vi.mock('@/lib/firebase', () => ({ registerPushNotifications: vi.fn() }))
vi.mock('@/features/auth/hooks', () => ({ logout: vi.fn() }))

afterEach(() => vi.unstubAllGlobals())

describe('Admin push availability notice', () => {
  it('shows an explicit notice while preserving panel navigation without Web Locks', () => {
    vi.stubGlobal('navigator', { locks: undefined })
    render(
      <MemoryRouter>
        <AdminLayout />
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Las notificaciones push no están disponibles',
    )
    expect(
      screen.getAllByRole('link', { name: 'Pedidos' }).length,
    ).toBeGreaterThan(0)
  })
  it('does not show the limitation when Web Locks is available', () => {
    vi.stubGlobal('navigator', { locks: {} })
    render(
      <MemoryRouter>
        <AdminLayout />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
