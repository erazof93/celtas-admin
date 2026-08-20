import { Home, MapPin } from 'lucide-react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { buildAddressMapUrl } from './users-utils'
import type { UserAddress } from './types'

interface UserAddressesSectionProps {
  query: UseQueryResult<UserAddress[], Error>
}

/**
 * Direcciones del usuario (tab del detalle). Consume
 * GET /users/:id/addresses — array plano, no paginado, principal primero.
 * Maneja los 3 estados: loading, error y vacío ("Este cliente no tiene
 * direcciones guardadas"). Debajo de cada tarjeta con coordenadas se
 * renderiza un mapa de solo lectura (Geoapify Static Maps API, un <img>
 * simple, sin librería de mapas interactivo). Muchas direcciones siguen sin
 * lat/lng (creadas antes de esa columna, o editadas sin tocar el mapa) — es
 * un estado válido, no se muestra ningún placeholder de "sin mapa" ahí.
 */
export function UserAddressesSection({ query }: UserAddressesSectionProps) {
  const geoapifyApiKey = import.meta.env.VITE_GEOAPIFY_API_KEY as
    | string
    | undefined

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Direcciones guardadas</h3>

      {query.isLoading ? (
        <LoadingState label="Cargando direcciones…" />
      ) : query.isError ? (
        <ErrorState
          title="No se pudieron cargar las direcciones"
          description="Revisa tu conexión y vuelve a intentar."
          onRetry={() => query.refetch()}
        />
      ) : query.data && query.data.length === 0 ? (
        <div className="bg-muted/40 border-border flex items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-sm">
          <Home className="text-muted-foreground size-4" />
          <p className="text-muted-foreground">
            Este cliente no tiene direcciones guardadas.
          </p>
        </div>
      ) : query.data ? (
        <ul className="space-y-2">
          {query.data.map((address) => (
            <li
              key={address.id}
              className="border-border rounded-lg border px-3 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <MapPin className="text-celtas-orange size-3.5" />
                  {address.alias}
                </p>
                {address.isDefault ? (
                  <Badge className="bg-celtas-gold/15 text-celtas-gold border border-transparent">
                    Principal
                  </Badge>
                ) : null}
              </div>
              <p className="text-celtas-cream mt-1 text-sm">
                {address.fullAddress}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {address.district}
              </p>
              {address.reference ? (
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Ref: {address.reference}
                </p>
              ) : null}
              {address.latitude !== null &&
              address.longitude !== null &&
              geoapifyApiKey ? (
                <div className="border-border mt-2 overflow-hidden rounded-lg border">
                  <img
                    src={buildAddressMapUrl(
                      address.latitude,
                      address.longitude,
                      geoapifyApiKey,
                    )}
                    alt={`Mapa de ${address.alias}`}
                    className="block w-full"
                    width={400}
                    height={200}
                    loading="lazy"
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
