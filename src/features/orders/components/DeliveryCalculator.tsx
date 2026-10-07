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
import { Home, MapPin, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ErrorState } from '@/components/ui/ErrorState'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/LoadingState'
import { storeMapIcon, tileLayerProps } from '@/lib/map-config'
import { useSettings } from '../../settings/hooks'
import { deliveryModeFromSettings } from '../../settings/delivery-mode'
import {
  deliveryErrorMessage,
  isDeliveryUncovered,
  GEOCODE_ADDRESS_MAX_LENGTH,
  storeLocationFromSettings,
  type DeliveryEstimate,
  type LatLng,
  wrapLatLng,
} from '../delivery-estimate'
import type { GeoapifySuggestion } from '@/lib/geoapify'
import { useDeliveryEstimate, useGeocodeAddress, useGeoapifyAutocomplete } from '../hooks'

const MAP_ZOOM = 15

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
 * Mientras se escribe sugiere direcciones: las guardadas del cliente
 * (`savedSuggestions`, filtradas en el navegador) y las de Geoapify
 * (autocompletado directo, ver lib/geoapify.ts). Si Geoapify falla o no
 * sugiere nada, siguen funcionando "Buscar" y el pin manual.
 *
 * `onChange` (opcional) permite reutilizarlo dentro de un formulario (ej.
 * pedido manual): notifica el texto escrito, el punto ubicado y la cotización.
 * `point` es `null` mientras la dirección escrita no coincida con la última
 * ubicada — si el admin edita el texto, el pin anterior ya no la representa.
 * Marcar/arrastrar el pin "adopta" el texto actual (incluso vacío).
 */
export interface DeliveryLocation {
  address: string
  point: LatLng | null
  estimate: DeliveryEstimate | null
  /** La cotización del punto ubicado falló (el calculador ya muestra el error y "Reintentar"). */
  estimateFailed: boolean
  estimatePending?: boolean
  /** Distrito de la sugerencia de Geoapify elegida; `null` si no vino de una. */
  district: string | null
}

/** Dirección guardada del cliente ofrecida como sugerencia. */
export interface SavedAddressSuggestion {
  id: string
  label: string
  fullAddress: string
}

interface DeliveryCalculatorProps {
  onChange?: (location: DeliveryLocation) => void
  /**
   * Dirección precargada (ej. una guardada del cliente). Solo se lee al montar:
   * para cambiarla, el padre remonta el componente con otra `key`. Con `point`
   * el mapa y la cotización aparecen sin buscar; sin `point` (dirección
   * guardada sin coordenadas) solo se precarga el texto y hay que pulsar Buscar.
   */
  initialLocation?: { address: string; point: LatLng | null }
  /** Direcciones guardadas a sugerir mientras se escribe. */
  savedSuggestions?: SavedAddressSuggestion[]
  /** Elegir una guardada: el padre la aplica (normalmente remontando con initialLocation). */
  onPickSaved?: (id: string) => void
  /**
   * Muestra el mapa desde el inicio (centrado en el local) para marcar el
   * punto con un click sin buscar — salida si la búsqueda no encuentra la
   * dirección.
   */
  allowManualPin?: boolean
  /**
   * Sugerencias de Geoapify mientras se escribe (opt-in: consumen el rate limit
   * compartido). Las guardadas se sugieren siempre que se pasen.
   */
  enableAutocomplete?: boolean
}

const MAX_SAVED_SUGGESTIONS = 5

export function DeliveryCalculator({
  onChange,
  initialLocation,
  savedSuggestions = [],
  onPickSaved,
  allowManualPin = false,
  enableAutocomplete = false,
}: DeliveryCalculatorProps = {}) {
  const settingsQuery = useSettings()
  const geocodeMutation = useGeocodeAddress()
  const initialPoint = initialLocation?.point ?? null
  const [address, setAddress] = useState(initialLocation?.address ?? '')
  // Texto que representa el pin actual (null = el pin no representa ningún texto).
  const [locatedText, setLocatedText] = useState<string | null>(
    initialPoint ? (initialLocation?.address.trim() ?? '') : null,
  )
  const [searchTarget, setSearchTarget] = useState<LatLng | null>(initialPoint)
  const [pin, setPin] = useState<LatLng | null>(initialPoint)
  const [pickedDistrict, setPickedDistrict] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  // Índice resaltado con las flechas (-1 = ninguno).
  const [activeIndex, setActiveIndex] = useState(-1)
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)
  }, [])
  const mode = deliveryModeFromSettings(settingsQuery.data)
  const estimateQuery = useDeliveryEstimate(pin, mode)
  const geoSuggestions = useGeoapifyAutocomplete(
    suggestionsOpen ? address : '',
    enableAutocomplete,
  )

  // Ref: el padre suele pasar una función inline; como dependencia del efecto
  // dispararía onChange en cada render.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  const located = locatedText !== null && address.trim() === locatedText
  const point = located ? pin : null
  const estimateData =
    located && !estimateQuery.isFetching && !estimateQuery.isError
      ? (estimateQuery.data ?? null)
      : null
  const estimateFailed = located && estimateQuery.isError
  const estimatePending = located && (estimateQuery.isPending || estimateQuery.isFetching)
  const district = located ? pickedDistrict : null
  useEffect(() => {
    onChangeRef.current?.({ address, point, estimate: estimateData, estimateFailed, estimatePending, district })
  }, [address, point, estimateData, estimateFailed, estimatePending, district])

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

  /** Coloca el pin en un punto elegido y lo asocia a `text`. */
  function locate(target: LatLng, text: string, districtName: string | null = null) {
    // Objeto nuevo en cada búsqueda: RecenterOnSearch recentra aunque las
    // coordenadas sean las mismas que la vez anterior.
    setSearchTarget({ ...target })
    setPin(target)
    setLocatedText(text.trim())
    setPickedDistrict(districtName)
  }

  /** Click o arrastre en el mapa: el pin adopta el texto actual. */
  function placePinManually(target: LatLng) {
    setError(null)
    setPin(target)
    setLocatedText(address.trim())
    // Si el texto no cambió, el distrito de la sugerencia sigue valiendo.
    if (address.trim() !== locatedText) setPickedDistrict(null)
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuggestionsOpen(false)
    const text = address.trim()
    if (!text) {
      setError('Escribe una dirección')
      return
    }
    try {
      const [lat, lng] = await geocodeMutation.mutateAsync(text)
      locate({ lat, lng }, text)
    } catch (err) {
      setError(deliveryErrorMessage(err, 'geocode'))
    }
  }

  function pickGeoapify(suggestion: GeoapifySuggestion) {
    setAddress(suggestion.fullAddress)
    setError(null)
    setSuggestionsOpen(false)
    locate(
      { lat: suggestion.latitude, lng: suggestion.longitude },
      suggestion.fullAddress,
      suggestion.district,
    )
  }

  function pickSaved(suggestion: SavedAddressSuggestion) {
    setSuggestionsOpen(false)
    onPickSaved?.(suggestion.id)
  }

  const store: LatLng = {
    lat: storeLocation.latitude,
    lng: storeLocation.longitude,
  }
  const estimate = estimateData

  const query = address.trim().toLowerCase()
  const savedMatches = query
    ? savedSuggestions
        .filter(
          (s) =>
            s.fullAddress.toLowerCase().includes(query) ||
            s.label.toLowerCase().includes(query),
        )
        .slice(0, MAX_SAVED_SUGGESTIONS)
    : []
  const geoMatches = geoSuggestions
  const options: (
    | { kind: 'saved'; key: string; saved: SavedAddressSuggestion }
    | { kind: 'geo'; key: string; geo: GeoapifySuggestion }
  )[] = [
    ...savedMatches.map((saved) => ({ kind: 'saved' as const, key: `saved-${saved.id}`, saved })),
    ...geoMatches.map((geo) => ({
      kind: 'geo' as const,
      key: `geo-${geo.latitude},${geo.longitude},${geo.formatted}`,
      geo,
    })),
  ]
  const showSuggestions = suggestionsOpen && options.length > 0
  const highlighted = showSuggestions && activeIndex < options.length ? activeIndex : -1
  const mapCenter = searchTarget ?? pin ?? store
  const showMap = pin !== null || allowManualPin

  function pickOption(option: (typeof options)[number]) {
    setActiveIndex(-1)
    if (option.kind === 'saved') pickSaved(option.saved)
    else pickGeoapify(option.geo)
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="space-y-1.5">
        <Label htmlFor="delivery-address">Dirección</Label>
        <div className="relative flex gap-2">
          <Input
            id="delivery-address"
            role="combobox"
            value={address}
            maxLength={GEOCODE_ADDRESS_MAX_LENGTH}
            onChange={(e) => {
              setAddress(e.target.value)
              setSuggestionsOpen(true)
              setActiveIndex(-1)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSuggestionsOpen(false)
                setActiveIndex(-1)
              } else if (showSuggestions && e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIndex((i) => (i + 1) % options.length)
              } else if (showSuggestions && e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1))
              } else if (e.key === 'Enter' && highlighted >= 0) {
                // Enter con una sugerencia resaltada la elige en vez de "Buscar".
                e.preventDefault()
                pickOption(options[highlighted])
              }
            }}
            // Si vuelve el foco antes de que venza el cierre por blur, se cancela.
            onFocus={() => {
              if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)
            }}
            // Retraso: deja que el click en una sugerencia se registre antes de cerrar.
            onBlur={() => {
              blurTimeoutRef.current = setTimeout(() => setSuggestionsOpen(false), 150)
            }}
            placeholder="Ej: Jr. Carabaya 250, Lima"
            aria-invalid={Boolean(error)}
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
            aria-controls={showSuggestions ? 'delivery-suggestions' : undefined}
            aria-activedescendant={highlighted >= 0 ? `delivery-option-${highlighted}` : undefined}
            autoComplete="off"
          />
          <Button type="submit" disabled={geocodeMutation.isPending}>
            {geocodeMutation.isPending ? 'Buscando…' : 'Buscar'}
          </Button>
          {showSuggestions ? (
            <div className="border-border bg-popover absolute top-full right-0 left-0 z-[1000] mt-1 overflow-hidden rounded-lg border shadow-lg">
              <ul id="delivery-suggestions" role="listbox" aria-label="Sugerencias de dirección">
                {options.map((option, index) => (
                  <li
                    key={option.key}
                    id={`delivery-option-${index}`}
                    role="option"
                    aria-selected={index === highlighted}
                    className={cn(
                      'hover:bg-muted flex cursor-pointer items-start gap-2 px-3 py-2 text-sm',
                      index === highlighted && 'bg-muted',
                    )}
                    // Evita el blur del input antes del click.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickOption(option)}
                  >
                    {option.kind === 'saved' ? (
                      <>
                        <Home className="text-celtas-orange mt-0.5 size-4 shrink-0" aria-label="Guardada" />
                        <span>{option.saved.label}</span>
                      </>
                    ) : (
                      <>
                        <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-label="Geoapify" />
                        <span>
                          {option.geo.fullAddress}
                          {option.geo.formatted !== option.geo.fullAddress ? (
                            <span className="text-muted-foreground block text-xs">
                              {option.geo.formatted}
                            </span>
                          ) : null}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground border-border border-t px-3 py-1.5 text-xs">
                Verifica el pin en el mapa y agrega una referencia.
              </p>
            </div>
          ) : null}
        </div>
        {error ? (
          <p className="text-celtas-red-light text-xs">{error}</p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Incluye el distrito o la ciudad (ej. "…, San Juan de Miraflores").
            {allowManualPin ? ' Si no la encuentra, marca el punto en el mapa.' : ''}
          </p>
        )}
      </form>

      {showMap ? (
        <>
          <MapContainer
            center={[mapCenter.lat, mapCenter.lng]}
            zoom={MAP_ZOOM}
            className="isolate z-0 h-80 w-full rounded-lg"
          >
            <TileLayer {...tileLayerProps()} />
            {searchTarget ? <RecenterOnSearch target={searchTarget} /> : null}
            <MapClickHandler onPick={placePinManually} />
            {pin ? (
              <Marker
                icon={storeMapIcon}
                position={[pin.lat, pin.lng]}
                draggable
                title="Cliente"
                eventHandlers={{
                  dragend: (e) => {
                    const { lat, lng } = (e.target as L.Marker).getLatLng()
                    placePinManually(wrapLatLng({ lat, lng }))
                  },
                }}
              >
                <Popup>Cliente (arrastra para ajustar)</Popup>
              </Marker>
            ) : null}
            <Marker position={[store.lat, store.lng]} title="Local" icon={storeMapIcon}>
              <Popup>Celtas (local)</Popup>
            </Marker>
          </MapContainer>

          <div className="bg-muted space-y-1 rounded-lg p-4" aria-live="polite">
            {!point ? (
              <p className="text-muted-foreground text-sm">
                Haz click en el mapa para marcar la ubicación del cliente.
              </p>
            ) : estimatePending ? (
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
                {isDeliveryUncovered(estimate) ? (
                  <div role="alert" className="text-celtas-red-light space-y-1">
                    <p className="font-semibold">Fuera de cobertura</p>
                    <p className="text-sm">
                      Esta ubicación no pertenece a ninguna zona de delivery activa.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-lg font-bold">
                      Tarifa de delivery: S/ {estimate.deliveryFee.toFixed(2)}
                    </p>
                    {estimate.deliveryMode === 'ZONES' && (
                      <div className="text-sm">
                        <p>Zona: {estimate.zone?.name ?? 'Zona activa'}</p>
                        <p className="text-muted-foreground">Tarifa según zona</p>
                      </div>
                    )}
                  </>
                )}
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
