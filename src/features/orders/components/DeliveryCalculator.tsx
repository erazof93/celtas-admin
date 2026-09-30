import { useEffect, useState, type FormEvent } from 'react'
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/ErrorState'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/LoadingState'
import { useSettings } from '../../settings/hooks'
import {
  deliveryConfigFromSettings,
  estimateDeliveryLocally,
  mockGeocode,
  type DeliveryEstimate,
  type LatLng,
} from '../delivery-estimate'

// Con Vite, Leaflet no resuelve solo las imágenes del ícono por defecto.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const MAP_ZOOM = 15

function tileLayerProps() {
  const geoapifyApiKey = import.meta.env.VITE_GEOAPIFY_API_KEY as
    string | undefined
  if (geoapifyApiKey) {
    return {
      url: `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${geoapifyApiKey}`,
      attribution:
        'Powered by <a href="https://www.geoapify.com/">Geoapify</a> | &copy; OpenStreetMap contributors',
    }
  }
  return {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  }
}

/** `center` de MapContainer solo aplica al montar: recentra en cada búsqueda. */
function RecenterOnSearch({ target }: { target: LatLng }) {
  const map = useMap()
  useEffect(() => {
    map.setView([target.lat, target.lng], map.getZoom())
  }, [map, target])
  return null
}

function MapClickHandler({ onPick }: { onPick: (point: LatLng) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }),
  })
  return null
}

/**
 * Cotiza el delivery de una dirección: la geocodifica, la muestra en un mapa
 * junto al local y permite ajustar el pin (arrastrándolo o haciendo click).
 *
 * MOCK temporal — ver `delivery-estimate.ts`: la geocodificación es una tabla
 * fija y la estimación replica el cálculo del backend con la config real de
 * Configuración, hasta que `GET /delivery/estimate` esté desplegado.
 */
export function DeliveryCalculator() {
  const settingsQuery = useSettings()
  const [address, setAddress] = useState('')
  const [searchTarget, setSearchTarget] = useState<LatLng | null>(null)
  const [pin, setPin] = useState<LatLng | null>(null)
  const [estimate, setEstimate] = useState<DeliveryEstimate | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (settingsQuery.isLoading) {
    return <LoadingState label="Cargando configuración de delivery…" />
  }
  if (settingsQuery.isError) {
    return (
      <ErrorState
        title="No se pudo cargar la configuración de delivery"
        onRetry={() => settingsQuery.refetch()}
      />
    )
  }

  const config = deliveryConfigFromSettings(settingsQuery.data)
  if (!config) {
    return (
      <p className="text-muted-foreground text-sm">
        Configura la ubicación del local en Configuración → Delivery para poder
        cotizar.
      </p>
    )
  }

  function placePin(point: LatLng) {
    if (!config) return
    setPin(point)
    setEstimate(estimateDeliveryLocally(point, config))
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!address.trim()) {
      setError('Escribe una dirección')
      return
    }
    const coords = mockGeocode(address)
    if (!coords) {
      setError('Dirección no encontrada')
      return
    }
    // Objeto nuevo en cada búsqueda: mockGeocode devuelve la misma referencia
    // para la misma dirección y RecenterOnSearch no volvería a recentrar.
    setSearchTarget({ ...coords })
    placePin(coords)
  }

  const store: LatLng = {
    lat: config.store.latitude,
    lng: config.store.longitude,
  }

  return (
    <div className="space-y-4">
      <p className="bg-celtas-gold/15 text-celtas-gold rounded-md px-3 py-2 text-xs">
        Modo simulado: la búsqueda solo reconoce direcciones de prueba (ej. "Jr.
        Carabaya 250") y la tarifa se calcula en el navegador con tus tramos de
        Configuración.
      </p>

      <form onSubmit={handleSearch} className="space-y-1.5">
        <Label htmlFor="delivery-address">Dirección</Label>
        <div className="flex gap-2">
          <Input
            id="delivery-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ej: Jr. Carabaya 250"
            aria-invalid={Boolean(error)}
          />
          <Button type="submit">Buscar</Button>
        </div>
        {error ? (
          <p className="text-celtas-red-light text-xs">{error}</p>
        ) : null}
      </form>

      {searchTarget && pin ? (
        <>
          <MapContainer
            center={[searchTarget.lat, searchTarget.lng]}
            zoom={MAP_ZOOM}
            className="h-80 w-full rounded-lg"
          >
            <TileLayer {...tileLayerProps()} />
            <RecenterOnSearch target={searchTarget} />
            <MapClickHandler onPick={placePin} />
            <Marker
              position={[pin.lat, pin.lng]}
              draggable
              title="Cliente"
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = (e.target as L.Marker).getLatLng()
                  placePin({ lat, lng })
                },
              }}
            >
              <Popup>Cliente (arrastra para ajustar)</Popup>
            </Marker>
            <Marker position={[store.lat, store.lng]} title="Local">
              <Popup>Celtas (local)</Popup>
            </Marker>
          </MapContainer>

          {estimate ? (
            <div
              className="bg-muted space-y-1 rounded-lg p-4"
              aria-live="polite"
            >
              <p className="text-sm">
                Distancia aprox.: {estimate.distanceMeters ?? '—'} m
              </p>
              <p className="text-lg font-bold">
                Delivery: S/ {estimate.deliveryFee.toFixed(2)}
              </p>
              {estimate.isFarOrder ? (
                <p className="text-celtas-red-light flex items-center gap-1 text-sm font-medium">
                  <TriangleAlert className="size-4" />
                  Fuera de zona habitual
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
