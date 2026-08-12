/**
 * Copia texto al portapapeles con fallback para contextos donde
 * `navigator.clipboard` no está disponible (http no-secure, navegadores viejos).
 * Devuelve true si la copia se completó.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Si el Clipboard API falla (permisos, contexto), caemos al fallback.
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    try {
      textarea.select()
      return document.execCommand('copy')
    } finally {
      // El textarea se limpia SIEMPRE, incluso si execCommand lanza — si no,
      // quedaría un elemento invisible colgado en el DOM.
      document.body.removeChild(textarea)
    }
  } catch {
    return false
  }
}
