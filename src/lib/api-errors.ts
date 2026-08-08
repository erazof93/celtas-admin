import { AxiosError } from 'axios'

export interface ApiErrorMessage {
  success?: boolean
  message?: string | string[]
  statusCode?: number
}

/**
 * Extrae el mensaje de error de la API (en español, ya normalizado por el
 * HttpExceptionFilter del backend) o el fallback si no se puede.
 */
export function getApiMessage(error: unknown, fallback = 'Algo salió mal'): string {
  if (error instanceof AxiosError && error.response?.data) {
    const data = error.response.data as ApiErrorMessage
    if (Array.isArray(data.message)) {
      return data.message.join(', ')
    }
    if (typeof data.message === 'string') {
      return data.message
    }
  }
  return fallback
}

/** Status HTTP del error, o null si no hay respuesta del servidor. */
export function getApiStatus(error: unknown): number | null {
  if (error instanceof AxiosError && error.response) {
    return error.response.status
  }
  return null
}

/**
 * True si el error es un 409 (conflicto). Usado para mapear los mensajes de
 * negocio del backend (nombre duplicado, categoría con productos, etc.) al
 * campo correcto del formulario en vez de mostrarlos como error genérico.
 */
export function isConflict(error: unknown): boolean {
  return getApiStatus(error) === 409
}

/** True si el error es un 404 (no encontrado). */
export function isNotFound(error: unknown): boolean {
  return getApiStatus(error) === 404
}