import { useEffect, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { validateImageFile } from '@/lib/image-upload'

interface ImageUploadProps {
  /** Imagen actual del recurso (si edita). */
  existingImage?: string | null
  /** Se llama con el archivo elegido (null al quitarlo). */
  onChange?: (file: File | null) => void
  /** Error de backend de una subida fallida (ej. 400 de tipo/tamaño). */
  serverError?: string | null
  disabled?: boolean
  /** Label del campo (default "Imagen"). */
  label?: string
  /** Texto alternativo de la imagen (default "Imagen del producto"). */
  altText?: string
}

/**
 * Selector de imagen genérico (productos, banners, etc.). Valida en el cliente
 * los mismos límites del backend (JPG/PNG/WEBP/GIF, máx 5 MB) con mensajes en
 * español. La subida real la hace el formulario del módulo (flujo del backend:
 * crear el recurso y luego subir la imagen a POST /<recurso>/:id/image).
 */
export function ImageUpload({
  existingImage,
  onChange,
  serverError,
  disabled,
  label = 'Imagen',
  altText = 'Imagen del producto',
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [clientError, setClientError] = useState<string | null>(null)

  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  function handleSelect(file: File | undefined | null) {
    if (!file) return
    const validationError = validateImageFile(file)
    if (validationError) {
      setClientError(validationError)
      return
    }
    setClientError(null)
    setFile(file)
    setPreview(URL.createObjectURL(file))
    onChange?.(file)
  }

  function handleClear() {
    setFile(null)
    setPreview(null)
    setClientError(null)
    onChange?.(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const visibleImage = preview ?? existingImage
  const error = clientError ?? serverError

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        {visibleImage ? (
          <img
            src={visibleImage}
            alt={altText}
            className="border-border size-16 shrink-0 rounded-lg border object-cover"
          />
        ) : (
          <div className="bg-muted border-border flex size-16 shrink-0 items-center justify-center rounded-lg border border-dashed">
            <ImagePlus className="text-muted-foreground size-5" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {visibleImage ? 'Cambiar imagen' : 'Seleccionar imagen'}
          </Button>
          {visibleImage ? (
            <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
              Quitar
            </Button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => handleSelect(e.target.files?.[0])}
      />

      {error ? <p className="text-celtas-red text-xs">{error}</p> : null}
      {file ? <p className="text-muted-foreground text-xs">{file.name}</p> : null}
    </div>
  )
}