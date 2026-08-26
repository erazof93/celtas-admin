import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { RewardMilestoneForm } from './RewardMilestoneForm'
import type { RewardMilestone } from './types'

/**
 * Cubre el mapeo del 400 real de RewardMilestonesService.translateUniqueViolation
 * ("Ya existe un premio configurado para esa cantidad de estrellas") al campo
 * starsRequired, y el fallback a error general del form para cualquier otro
 * mensaje.
 */

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))
const { updateMock } = vi.hoisted(() => ({ updateMock: vi.fn() }))

vi.mock('./hooks', () => ({
  useCreateRewardMilestone: () => ({ mutateAsync: createMock }),
  useUpdateRewardMilestone: () => ({ mutateAsync: updateMock }),
}))

function makeAxiosError(status: number, message: string): AxiosError {
  const response = {
    status,
    statusText: 'Error',
    headers: {},
    config: {},
    data: { message },
  } as AxiosResponse
  return new AxiosError(
    `Request failed with status code ${status}`,
    AxiosError.ERR_BAD_REQUEST,
    undefined,
    undefined,
    response,
  )
}

function makeMilestone(
  overrides: Partial<RewardMilestone> = {},
): RewardMilestone {
  return {
    id: 'milestone-1',
    starsRequired: 15,
    isSpecial: false,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('RewardMilestoneForm mapeo de errores del servidor', () => {
  beforeEach(() => {
    createMock.mockReset()
    updateMock.mockReset()
  })

  it('mapea un 400 de colisión de starsRequired al campo, no como error general', async () => {
    const user = userEvent.setup()
    updateMock.mockRejectedValue(
      makeAxiosError(
        400,
        'Ya existe un premio configurado para esa cantidad de estrellas',
      ),
    )
    render(
      <RewardMilestoneForm milestone={makeMilestone()} onClose={() => {}} />,
    )

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText(
        'Ya existe un premio configurado para esa cantidad de estrellas',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('No se pudo guardar')).not.toBeInTheDocument()
  })

  it('un 400 sin colisión de starsRequired se muestra como error general del form', async () => {
    const user = userEvent.setup()
    updateMock.mockRejectedValue(
      makeAxiosError(500, 'Error interno del servidor'),
    )
    render(
      <RewardMilestoneForm milestone={makeMilestone()} onClose={() => {}} />,
    )

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('No se pudo guardar')).toBeInTheDocument()
    expect(screen.getByText('Error interno del servidor')).toBeInTheDocument()
  })

  it('un guardado exitoso no muestra ningún error y llama a onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    updateMock.mockResolvedValue(makeMilestone())
    render(<RewardMilestoneForm milestone={makeMilestone()} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('No se pudo guardar')).not.toBeInTheDocument()
  })
})
