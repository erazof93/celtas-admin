import { useEffect, useRef, useState, type FormEvent } from 'react'
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
  deliveryErrorMessage,
  GEOCODE_ADDRESS_MAX_LENGTH,
  storeLocationFromSettings,
  type DeliveryEstimate,
  type LatLng,
  wrapLatLng,
} from '../delivery-estimate'
import { useDeliveryEstimate, useGeocodeAddress } from '../hooks'

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
    click: (e) => onPick(wrapLatLng({ lat: e.latlng.lat, lng: e.latlng.lng })),
  })
  return null
}

/**
 * Cotiza el delivery de una dirección: la geocodifica con el backend
 * (GET /orders/geocode), la muestra en un mapa junto al local y permite
 * ajustar el pin (arrastrándolo o haciendo click). Cada posición del pin se
 * cotiza con GET /delivery/estimate — la tarifa la calcula solo el backend.
 *
 * `settings` se usa únicamente para dibujar el pin del local.
 *
 * `onChange` (opcional) permite reutilizarlo dentro de un formulario (ej.
 * pedido manual): notifica el texto escrito, el punto ubicado y la cotización.
 * `point` es `null` mientras la dirección escrita no coincida con la última
 * buscada — si el admin edita el texto, el pin anterior ya no la representa.
 */
export interface DeliveryLocation {
  address: string
  point: LatLng | null
  estimate: DeliveryEstimate | null
  /** La cotización del punto ubicado falló (el calculador ya muestra el error y "Reintentar"). */
  estimateFailed: boolean
}

interface DeliveryCalculatorProps {
  onChange?: (location: DeliveryLocation) => void
}

export function DeliveryCalculator({ onChange }: DeliveryCalculatorProps = {}) {
  const settingsQuery = useSettings()
  const geocodeMutation = useGeocodeAddress()
  const [address, setAddress] = useState('')
  const [searchedAddress, setSearchedAddress] = useState<string | null>(null)
  const [searchTarget, setSearchTarget] = useState<LatLng | null>(null)
  const [pin, setPin] = useState<LatLng | null>(null)
  const [error, setError] = useState<string | null>(null)
  const estimateQuery = useDeliveryEstimate(pin)

  // Ref: el padre suele pasar una función inline; como dependencia del efecto
  // dispararía onChange en cada render.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  const located = searchedAddress !== null && address.trim() === searchedAddress
  const point = located ? pin : null
  const estimateData = located ? (estimateQuery.data ?? null) : null
  const estimateFailed = located && estimateQuery.isError
  useEffect(() => {
    onChangeRef.current?.({ address, point, estimate: estimateData, estimateFailed })
  }, [address, point, estimateData, estimateFailed])

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

  const storeLocation = storeLocationFromSettings(settingsQuery.data)
  if (!storeLocation) {
    return (
      <p className="text-muted-foreground text-sm">
        Configura la ubicación del local en Configuración → Delivery para poder
        cotizar.
      </p>
    )
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const text = address.trim()
    if (!text) {
      setError('Escribe una dirección')
      return
    }
    try {
      const [lat, lng] = await geocodeMutation.mutateAsync(text)
      // Objeto nuevo en cada búsqueda: RecenterOnSearch recentra aunque la
      // dirección (y las coordenadas) sean las mismas que la vez anterior.
      setSearchTarget({ lat, lng })
      setPin({ lat, lng })
      setSearchedAddress(text)
    } catch (err) {
      setError(deliveryErrorMessage(err, 'geocode'))
    }
  }

  const store: LatLng = {
    lat: storeLocation.latitude,
    lng: storeLocation.longitude,
  }
  const estimate = estimateQuery.data

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="space-y-1.5">
        <Label htmlFor="delivery-address">Dirección</Label>
        <div className="flex gap-2">
          <Input
            id="delivery-address"
            value={address}
            maxLength={GEOCODE_ADDRESS_MAX_LENGTH}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ej: Jr. Carabaya 250, Lima"
            aria-invalid={Boolean(error)}
          />
          <Button type="submit" disabled={geocodeMutation.isPending}>
            {geocodeMutation.isPending ? 'Buscando…' : 'Buscar'}
          </Button>
        </div>
        {error ? (
          <p className="text-celtas-red-light text-xs">{error}</p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Incluye el distrito o la ciudad (ej. "…, San Juan de Miraflores").
          </p>
        )}
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
            <MapClickHandler onPick={setPin} />
            <Marker
              position={[pin.lat, pin.lng]}
              draggable
              title="Cliente"
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = (e.target as L.Marker).getLatLng()
                  setPin(wrapLatLng({ lat, lng }))
                },
              }}
            >
              <Popup>Cliente (arrastra para ajustar)</Popup>
            </Marker>
            <Marker position={[store.lat, store.lng]} title="Local">
              <Popup>Celtas (local)</Popup>
            </Marker>
          </MapContainer>

          <div className="bg-muted space-y-1 rounded-lg p-4" aria-live="polite">
            {estimateQuery.isPending ? (
              <p className="text-muted-foreground text-sm">
                Calculando delivery…
              </p>
            ) : estimateQuery.isError ? (
              <div className="space-y-2">
                <p className="text-celtas-red-light text-sm">
                  {deliveryErrorMessage(estimateQuery.error, 'estimate')}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => estimateQuery.refetch()}
                >
                  Reintentar
                </Button>
              </div>
            ) : estimate ? (
              <>
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
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
