import { CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { copyTextToClipboard } from '@/lib/clipboard'
import { useToast } from '@/components/ui/toast'

interface CopyIdButtonProps {
  /** El UUID a copiar. */
  id: string
  /** Nombre del registro (para el aria-label accesible). */
  label: string
}

/**
 * Botón que copia el id (UUID) al portapapeles con confirmación visual breve
 * (toast "ID copiado"). El UUID nunca se muestra como texto en la tabla: es
 * largo y poco legible; este botón es el acceso sin ruido visual.
 */
export function CopyIdButton({ id, label }: CopyIdButtonProps) {
  const { show } = useToast()

  async function handleCopy() {
    const ok = await copyTextToClipboard(id)
    show(ok ? 'ID copiado' : 'No se pudo copiar el ID')
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`Copiar ID de ${label}`}
      title="Copiar ID"
      onClick={handleCopy}
    >
      <CopyIcon />
    </Button>
  )
}
