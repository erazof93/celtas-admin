/**
 * Validación de imágenes compartida entre módulos que suben archivos
 * (Menu items y Banners). Límites espejo de image-upload-options del backend:
 * JPG/PNG/WEBP/GIF, máx 5 MB.
 */
export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** Valida el archivo elegido contra los límites del backend (mensajes en español). */
export function validateImageFile(file: File): string | null {
  if (!IMAGE_MIME_TYPES.includes(file.type)) {
    return 'El archivo debe ser una imagen (JPG, PNG, WEBP o GIF)'
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'La imagen no puede superar 5 MB'
  }
  return null
}