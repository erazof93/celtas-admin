import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyIdButton } from './CopyIdButton'
import { ToastProvider } from './toast'
import { copyTextToClipboard } from '@/lib/clipboard'

/**
 * Mejora de UX del módulo Menú: botón de copiar el id (UUID) de productos y
 * categorías. Se testea la lógica que importa: que el texto copiado es el id
 * real (no otro valor), que el toast de éxito dice "ID copiado" y que el
 * fallback de error se comunica cuando el portapapeles falla.
 */

vi.mock('@/lib/clipboard', () => ({
  copyTextToClipboard: vi.fn(),
}))

function renderWithToast(ui: React.ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

describe('CopyIdButton', () => {
  beforeEach(() => {
    vi.mocked(copyTextToClipboard).mockReset()
  })

  it('copia el id real y muestra el toast "ID copiado"', async () => {
    const user = userEvent.setup()
    vi.mocked(copyTextToClipboard).mockResolvedValue(true)

    renderWithToast(
      <CopyIdButton id="item-abc-123" label="Celtas Burger Clásica" />,
    )

    await user.click(
      screen.getByRole('button', { name: /Copiar ID de Celtas Burger Clásica/i }),
    )

    expect(copyTextToClipboard).toHaveBeenCalledWith('item-abc-123')
    expect(await screen.findByText('ID copiado')).toBeInTheDocument()
  })

  it('muestra un toast de error si el portapapeles falla', async () => {
    const user = userEvent.setup()
    vi.mocked(copyTextToClipboard).mockResolvedValue(false)

    renderWithToast(<CopyIdButton id="cat-xyz" label="Burgers" />)

    await user.click(screen.getByRole('button', { name: /Copiar ID de Burgers/i }))

    expect(
      await screen.findByText('No se pudo copiar el ID'),
    ).toBeInTheDocument()
  })
})
