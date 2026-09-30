import { useState } from 'react'
import { CheckCircle2, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getApiMessage } from '@/lib/api-errors'
import { formatLima } from '@/lib/dates'
import { useMarkWhatsappSent, useOrderWhatsappLinks } from '../hooks'
import type { Order } from '../types'

/** "51987654321" → "+51 987 654 321" (solo para mostrar). */
function formatPhone(phone: string): string {
  const match = /^51(\d{3})(\d{3})(\d{3})$/.exec(phone)
  return match ? `+51 ${match[1]} ${match[2]} ${match[3]}` : phone
}

interface OrderWhatsappSectionProps {
  order: Order
  /** Pide los links solo con el diálogo abierto. */
  open: boolean
}

/**
 * WhatsApp del pedido. El backend NO envía mensajes: arma links wa.me
 * (GET /orders/admin/:id/whatsapp-links) que el admin abre, manda desde
 * WhatsApp y luego confirma acá (POST /orders/admin/:id/whatsapp-sent).
 *
 * Pedido cancelado: el backend responde 409 ("no corresponde mandarle
 * WhatsApp"), así que ni se consulta. Si los links fallan por otro motivo,
 * queda el link original del pedido (`order.whatsappUrl`) como antes.
 */
export function OrderWhatsappSection({ order, open }: OrderWhatsappSectionProps) {
  const isCancelled = order.status === 'cancelado'
  const linksQuery = useOrderWhatsappLinks(order.id, open && !isCancelled)
  const markSent = useMarkWhatsappSent()
  const [markError, setMarkError] = useState<string | null>(null)

  if (isCancelled) return null

  if (linksQuery.isPending) {
    return <p className="text-muted-foreground text-xs">Cargando links de WhatsApp…</p>
  }

  if (linksQuery.isError) {
    return (
      <Button asChild variant="outline" className="w-full">
        <a href={order.whatsappUrl} target="_blank" rel="noopener noreferrer">
          <MessageCircle />
          Abrir en WhatsApp
        </a>
      </Button>
    )
  }

  const links = linksQuery.data
  // La respuesta de los links es la fuente de verdad (se actualiza en caché al
  // confirmar); el pedido de la lista puede venir desactualizado.
  const sentAt = links.whatsappSentAt ?? order.whatsappSentAt

  async function handleMarkSent() {
    setMarkError(null)
    try {
      await markSent.mutateAsync(order.id)
    } catch (error) {
      setMarkError(getApiMessage(error, 'No se pudo marcar como enviado'))
    }
  }

  return (
    <section
      aria-label="WhatsApp del pedido"
      className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">WhatsApp</h4>
        {sentAt ? (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            Enviado el {formatLima(sentAt)}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">Aún no enviado</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {links.customer ? (
          <Button asChild variant="outline" className="w-full justify-start">
            <a href={links.customer.url} target="_blank" rel="noopener noreferrer">
              <MessageCircle />
              Enviar a cliente ({formatPhone(links.customer.phone)})
            </a>
          </Button>
        ) : (
          <p className="text-muted-foreground text-xs">
            El cliente no tiene un celular válido: solo se puede avisar a la tienda.
          </p>
        )}
        <Button asChild variant="outline" className="w-full justify-start">
          <a href={links.store.url} target="_blank" rel="noopener noreferrer">
            <MessageCircle />
            Enviar a tienda ({formatPhone(links.store.phone)})
          </a>
        </Button>
        {!sentAt ? (
          <Button onClick={handleMarkSent} disabled={markSent.isPending}>
            <CheckCircle2 />
            {markSent.isPending ? 'Guardando…' : 'Ya lo envié'}
          </Button>
        ) : null}
      </div>

      {markError ? <p className="text-celtas-red-light text-xs">{markError}</p> : null}
      <p className="text-muted-foreground text-xs">
        Abre el link, pulsa "Enviar" en WhatsApp y luego confirma aquí.
      </p>
    </section>
  )
}
