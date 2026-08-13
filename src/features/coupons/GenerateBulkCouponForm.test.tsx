import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GenerateBulkCouponForm } from './GenerateBulkCouponForm'

/**
 * POST /coupons/generate-bulk manda un cupón a TODOS los clientes — es una
 * acción de impacto real e irreversible. La regla del ROADMAP exige una
 * confirmación explícita antes de enviar; el riesgo concreto de bug de clase
 * aquí es que el submit del form dispare la mutación directamente sin pasar
 * por la confirmación. Estos tests verifican que mutateAsync SOLO se llama
 * tras el clic en "Sí, generar cupones", nunca antes.
 */

const { mutateAsyncMock } = vi.hoisted(() => ({ mutateAsyncMock: vi.fn() }))

vi.mock('./hooks', () => ({
  useGenerateBulkCoupons: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}))

describe('GenerateBulkCouponForm', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset()
  })

  it('rechaza percentage > 100 en el cliente, sin mostrar confirmación ni llamar a la API', async () => {
    const user = userEvent.setup()
    render(<GenerateBulkCouponForm onClose={() => {}} />)

    await user.type(screen.getByLabelText(/Nombre de campaña/i), 'padre2026')
    await user.type(screen.getByLabelText(/^Valor$/i), '150')
    await user.click(
      screen.getByRole('button', { name: 'Generar campaña para todos los clientes' }),
    )

    expect(
      await screen.findByText('El porcentaje de descuento no puede superar el 100%'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('¿Confirmas generar cupones para todos los clientes?'),
    ).not.toBeInTheDocument()
    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })

  it('exige campaignName antes de mostrar la confirmación', async () => {
    const user = userEvent.setup()
    render(<GenerateBulkCouponForm onClose={() => {}} />)

    await user.type(screen.getByLabelText(/^Valor$/i), '10')
    await user.click(
      screen.getByRole('button', { name: 'Generar campaña para todos los clientes' }),
    )

    expect(
      await screen.findByText('El nombre de la campaña es requerido'),
    ).toBeInTheDocument()
    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })

  it('un formulario válido pasa a confirmación SIN llamar a la API todavía', async () => {
    const user = userEvent.setup()
    render(<GenerateBulkCouponForm onClose={() => {}} />)

    await user.type(screen.getByLabelText(/Nombre de campaña/i), 'padre2026')
    await user.type(screen.getByLabelText(/^Valor$/i), '10')
    await user.click(
      screen.getByRole('button', { name: 'Generar campaña para todos los clientes' }),
    )

    expect(
      await screen.findByText('¿Confirmas generar cupones para todos los clientes?'),
    ).toBeInTheDocument()
    expect(screen.getByText('Esta acción no se puede deshacer.')).toBeInTheDocument()
    // La API todavía NO se llamó — solo se muestra el resumen de confirmación.
    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })

  it('"Cancelar" en la confirmación descarta sin llamar a la API', async () => {
    const user = userEvent.setup()
    render(<GenerateBulkCouponForm onClose={() => {}} />)

    await user.type(screen.getByLabelText(/Nombre de campaña/i), 'padre2026')
    await user.type(screen.getByLabelText(/^Valor$/i), '10')
    await user.click(
      screen.getByRole('button', { name: 'Generar campaña para todos los clientes' }),
    )
    await screen.findByText('¿Confirmas generar cupones para todos los clientes?')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(
      screen.queryByText('¿Confirmas generar cupones para todos los clientes?'),
    ).not.toBeInTheDocument()
    expect(mutateAsyncMock).not.toHaveBeenCalled()
    // El formulario vuelve a estar visible para reintentar.
    expect(
      screen.getByRole('button', { name: 'Generar campaña para todos los clientes' }),
    ).toBeInTheDocument()
  })

  it('"Sí, generar cupones" llama a la API con el payload correcto y muestra el conteo', async () => {
    const user = userEvent.setup()
    mutateAsyncMock.mockResolvedValue({ count: 42 })
    render(<GenerateBulkCouponForm onClose={() => {}} />)

    await user.type(screen.getByLabelText(/Nombre de campaña/i), 'padre2026')
    await user.click(screen.getByRole('combobox', { name: /Tipo de descuento/i }))
    await user.click(await screen.findByRole('option', { name: /Monto fijo/i }))
    await user.type(screen.getByLabelText(/^Valor$/i), '15')
    await user.type(screen.getByLabelText(/Monto mínimo de compra/i), '50')
    await user.click(
      screen.getByRole('button', { name: 'Generar campaña para todos los clientes' }),
    )
    await screen.findByText('¿Confirmas generar cupones para todos los clientes?')
    await user.click(screen.getByRole('button', { name: 'Sí, generar cupones' }))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        discountType: 'fixed_amount',
        discountValue: 15,
        campaignName: 'padre2026',
        minPurchaseAmount: 50,
        expiresAt: undefined,
      })
    })

    expect(await screen.findByText('Campaña generada')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('envía minPurchaseAmount null cuando se deja vacío (no 0)', async () => {
    const user = userEvent.setup()
    mutateAsyncMock.mockResolvedValue({ count: 5 })
    render(<GenerateBulkCouponForm onClose={() => {}} />)

    await user.type(screen.getByLabelText(/Nombre de campaña/i), 'promo')
    await user.type(screen.getByLabelText(/^Valor$/i), '10')
    await user.click(
      screen.getByRole('button', { name: 'Generar campaña para todos los clientes' }),
    )
    await screen.findByText('¿Confirmas generar cupones para todos los clientes?')
    await user.click(screen.getByRole('button', { name: 'Sí, generar cupones' }))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        discountType: 'percentage',
        discountValue: 10,
        campaignName: 'promo',
        minPurchaseAmount: null,
        expiresAt: undefined,
      })
    })
  })
})
