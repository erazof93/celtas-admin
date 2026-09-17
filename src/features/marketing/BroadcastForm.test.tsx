import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BroadcastForm } from './BroadcastForm'

/**
 * POST /notifications/broadcast manda un push a TODOS los usuarios con
 * fcmToken — es una acción de impacto real e inmediata (sin scheduler, sin
 * deshacer). Mismo riesgo de bug de clase que GenerateBulkCouponForm: el
 * submit del form NO debe disparar la mutación directamente. Estos tests
 * verifican que mutateAsync SOLO se llama tras el clic en "Sí, enviar
 * ahora", nunca antes.
 */

const { mutateAsyncMock } = vi.hoisted(() => ({ mutateAsyncMock: vi.fn() }))

vi.mock('./hooks', () => ({
  useSendBroadcast: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}))

describe('BroadcastForm', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset()
  })

  it('exige título y cuerpo antes de mostrar la confirmación', async () => {
    const user = userEvent.setup()
    render(<BroadcastForm />)

    await user.click(screen.getByRole('button', { name: 'Enviar ahora' }))

    expect(
      await screen.findByText('El título es obligatorio'),
    ).toBeInTheDocument()
    expect(screen.getByText('El cuerpo es obligatorio')).toBeInTheDocument()
    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })

  it('un formulario válido pasa a confirmación SIN llamar a la API todavía', async () => {
    const user = userEvent.setup()
    render(<BroadcastForm />)

    await user.type(
      screen.getByLabelText('Título'),
      'A pocos días del día del padre y Celtas lo sabe',
    )
    await user.type(
      screen.getByLabelText('Cuerpo'),
      'Aprovecha nuestras promos especiales.',
    )
    await user.click(screen.getByRole('button', { name: 'Enviar ahora' }))

    expect(
      await screen.findByText(
        '¿Confirmas enviar esta notificación a todos los clientes?',
      ),
    ).toBeInTheDocument()
    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })

  it('"Cancelar" en la confirmación descarta sin llamar a la API', async () => {
    const user = userEvent.setup()
    render(<BroadcastForm />)

    await user.type(screen.getByLabelText('Título'), 'Título')
    await user.type(screen.getByLabelText('Cuerpo'), 'Cuerpo')
    await user.click(screen.getByRole('button', { name: 'Enviar ahora' }))
    await screen.findByText(
      '¿Confirmas enviar esta notificación a todos los clientes?',
    )
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(
      screen.queryByText(
        '¿Confirmas enviar esta notificación a todos los clientes?',
      ),
    ).not.toBeInTheDocument()
    expect(mutateAsyncMock).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Enviar ahora' }),
    ).toBeInTheDocument()
  })

  it('"Sí, enviar ahora" llama a la API con el payload correcto y muestra sent/total', async () => {
    const user = userEvent.setup()
    mutateAsyncMock.mockResolvedValue({ sent: 8, total: 10 })
    render(<BroadcastForm />)

    await user.type(
      screen.getByLabelText('Título'),
      'A pocos días del día del padre y Celtas lo sabe',
    )
    await user.type(
      screen.getByLabelText('Cuerpo'),
      'Aprovecha nuestras promos especiales.',
    )
    await user.click(screen.getByRole('button', { name: 'Enviar ahora' }))
    await screen.findByText(
      '¿Confirmas enviar esta notificación a todos los clientes?',
    )
    await user.click(screen.getByRole('button', { name: 'Sí, enviar ahora' }))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        title: 'A pocos días del día del padre y Celtas lo sabe',
        body: 'Aprovecha nuestras promos especiales.',
      })
    })

    expect(await screen.findByText('Notificación enviada')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('link inválido muestra error y no pasa a confirmación', async () => {
    const user = userEvent.setup()
    render(<BroadcastForm />)

    await user.type(screen.getByLabelText('Título'), 'Título')
    await user.type(screen.getByLabelText('Cuerpo'), 'Cuerpo')
    await user.type(screen.getByLabelText('Link (opcional)'), 'texto random')
    await user.click(screen.getByRole('button', { name: 'Enviar ahora' }))

    expect(
      await screen.findByText('El link debe ser una URL válida'),
    ).toBeInTheDocument()
    expect(mutateAsyncMock).not.toHaveBeenCalled()
    expect(
      screen.queryByText(
        '¿Confirmas enviar esta notificación a todos los clientes?',
      ),
    ).not.toBeInTheDocument()
  })

  it('link vacío es válido — el payload no incluye la clave', async () => {
    const user = userEvent.setup()
    mutateAsyncMock.mockResolvedValue({ sent: 1, total: 1 })
    render(<BroadcastForm />)

    await user.type(screen.getByLabelText('Título'), 'Título')
    await user.type(screen.getByLabelText('Cuerpo'), 'Cuerpo')
    await user.click(screen.getByRole('button', { name: 'Enviar ahora' }))
    await screen.findByText(
      '¿Confirmas enviar esta notificación a todos los clientes?',
    )
    await user.click(screen.getByRole('button', { name: 'Sí, enviar ahora' }))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        title: 'Título',
        body: 'Cuerpo',
        link: undefined,
      })
    })
  })

  it('un link válido se muestra en la confirmación y se manda en el payload', async () => {
    const user = userEvent.setup()
    mutateAsyncMock.mockResolvedValue({ sent: 1, total: 1 })
    render(<BroadcastForm />)

    await user.type(screen.getByLabelText('Título'), 'Título')
    await user.type(screen.getByLabelText('Cuerpo'), 'Cuerpo')
    await user.type(
      screen.getByLabelText('Link (opcional)'),
      'https://celtas.com/promos/dia-del-padre',
    )
    await user.click(screen.getByRole('button', { name: 'Enviar ahora' }))

    expect(
      await screen.findByText('https://celtas.com/promos/dia-del-padre'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sí, enviar ahora' }))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        title: 'Título',
        body: 'Cuerpo',
        link: 'https://celtas.com/promos/dia-del-padre',
      })
    })
  })

  it('un error del servidor se muestra y permite reintentar sin perder el formulario', async () => {
    const user = userEvent.setup()
    mutateAsyncMock.mockRejectedValue(new Error('fallo de red'))
    render(<BroadcastForm />)

    await user.type(screen.getByLabelText('Título'), 'Título')
    await user.type(screen.getByLabelText('Cuerpo'), 'Cuerpo')
    await user.click(screen.getByRole('button', { name: 'Enviar ahora' }))
    await screen.findByText(
      '¿Confirmas enviar esta notificación a todos los clientes?',
    )
    await user.click(screen.getByRole('button', { name: 'Sí, enviar ahora' }))

    // El fallback de getApiMessage aparece como título Y descripción del
    // alert (mismo patrón que GenerateBulkCouponForm) — dos nodos, no uno.
    expect(
      await screen.findAllByText('No se pudo enviar la notificación'),
    ).toHaveLength(2)
    // Vuelve al formulario (no se queda trabado en la confirmación).
    expect(
      screen.getByRole('button', { name: 'Enviar ahora' }),
    ).toBeInTheDocument()
  })
})
