import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatePicker } from './DatePicker'

/**
 * Caso borde señalado en la auditoría del botón "Limpiar fecha": el botón de
 * limpiar (X) está superpuesto visualmente sobre el trigger del popover, pero
 * es un elemento HERMANO en el DOM (no un hijo del trigger), así que un click
 * en la X no debería abrir el calendario. Estos tests lo verifican de forma
 * aislada, sin pasar por todo BannerForm.
 */
function ControlledDatePicker({
  initial,
  onChangeSpy,
}: {
  initial: Date | null
  onChangeSpy?: (date: Date | null) => void
}) {
  const [value, setValue] = useState<Date | null>(initial)
  return (
    <DatePicker
      value={value}
      onChange={(date) => {
        setValue(date)
        onChangeSpy?.(date)
      }}
      clearLabel="Limpiar fecha"
    />
  )
}

describe('DatePicker — botón de limpiar', () => {
  it('no aparece cuando no hay valor', () => {
    render(<ControlledDatePicker initial={null} />)
    expect(
      screen.queryByRole('button', { name: 'Limpiar fecha' }),
    ).not.toBeInTheDocument()
  })

  it('aparece cuando hay valor y limpia sin abrir el calendario', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    render(
      <ControlledDatePicker
        initial={new Date(2026, 7, 1)}
        onChangeSpy={onChangeSpy}
      />,
    )

    expect(screen.getByText('01/08/2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Limpiar fecha' }))

    // El valor se limpió (onChange llamado con null).
    expect(onChangeSpy).toHaveBeenCalledWith(null)
    expect(screen.getByText('Selecciona una fecha')).toBeInTheDocument()
    // El calendario NO se abrió: ninguna celda de día visible (react-day-picker
    // renderiza gridcells cuando el popover está abierto).
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    // El botón de limpiar desaparece porque ya no hay valor.
    expect(
      screen.queryByRole('button', { name: 'Limpiar fecha' }),
    ).not.toBeInTheDocument()
  })

  // Regresión del hallazgo de auditoría: si el calendario está abierto y se
  // hace click en la X, además de limpiar el valor debe cerrar el popover
  // (setOpen(false) en el handler de limpiar).
  it('limpiar con el calendario abierto limpia el valor y cierra el popover', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    render(
      <ControlledDatePicker
        initial={new Date(2026, 7, 1)}
        onChangeSpy={onChangeSpy}
      />,
    )

    // Abre el popover haciendo click en el trigger (no en la X).
    await user.click(screen.getByRole('button', { name: /01\/08\/2026/i }))
    expect(await screen.findByRole('grid')).toBeInTheDocument()

    // Con el calendario abierto, clic en la X.
    await user.click(screen.getByRole('button', { name: 'Limpiar fecha' }))

    expect(onChangeSpy).toHaveBeenCalledWith(null)
    expect(screen.getByText('Selecciona una fecha')).toBeInTheDocument()
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  })
})
