import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from './clipboard'

/**
 * Fallback del portapapeles (módulo Menú — botón de copiar ID).
 * La lógica crítica de la feature: en http no-secure (deploy del panel en
 * free tier) `navigator.clipboard` no está disponible o writeText rechaza,
 * y el helper debe caer a document.execCommand('copy'). Sin este fallback,
 * el botón "copiar ID" sería inútil en producción.
 *
 * jsdom NO define `document.execCommand` (los navegadores reales sí), así que
 * el test la instala como mock antes de cada caso.
 */

function setClipboardApi(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    value,
    configurable: true,
  })
}

describe('copyTextToClipboard', () => {
  beforeEach(() => {
    // jsdom no implementa execCommand; en navegadores reales existe. Sin el
    // stub, el fallback lanza TypeError y devuelve false en TODOS los casos.
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn(() => false),
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // limpiar cualquier textarea que el fallback haya dejado colgado
    document.querySelectorAll('textarea').forEach((t) => t.remove())
  })

  it('usa navigator.clipboard.writeText cuando está disponible', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboardApi({ writeText })
    const execCommand = vi.mocked(document.execCommand)

    await expect(copyTextToClipboard('item-abc-123')).resolves.toBe(true)

    expect(writeText).toHaveBeenCalledExactlyOnceWith('item-abc-123')
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('cae al fallback execCommand si navigator.clipboard no existe (http no-secure)', async () => {
    setClipboardApi(undefined)
    const execCommand = vi.mocked(document.execCommand).mockReturnValue(true)

    await expect(copyTextToClipboard('item-abc-123')).resolves.toBe(true)

    expect(execCommand).toHaveBeenCalledExactlyOnceWith('copy')
    // el textarea temporal se limpia del DOM tras copiar
    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })

  it('cae al fallback si writeText rechaza (permisos / contexto no seguro)', async () => {
    setClipboardApi({
      writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')),
    })
    const execCommand = vi.mocked(document.execCommand).mockReturnValue(true)

    await expect(copyTextToClipboard('item-abc-123')).resolves.toBe(true)

    expect(execCommand).toHaveBeenCalledExactlyOnceWith('copy')
  })

  it('devuelve false si execCommand falla (portapapeles no disponible)', async () => {
    setClipboardApi(undefined)
    const execCommand = vi.mocked(document.execCommand).mockReturnValue(false)

    await expect(copyTextToClipboard('item-abc-123')).resolves.toBe(false)

    expect(execCommand).toHaveBeenCalledExactlyOnceWith('copy')
    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })

  it('devuelve false si execCommand lanza', async () => {
    setClipboardApi(undefined)
    vi.mocked(document.execCommand).mockImplementation(() => {
      throw new Error('boom')
    })

    await expect(copyTextToClipboard('item-abc-123')).resolves.toBe(false)
  })
})
