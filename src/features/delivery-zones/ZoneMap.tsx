import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import { GeomanEditor } from './GeomanEditor'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { Button } from '@/components/ui/button'
import { storeMapIcon, tileLayerProps } from '@/lib/map-config'
import type { StoreLocation } from '../settings/types'
import { positionToLeaflet } from './coordinates'
import type { DeliveryPolygon, DeliveryZone } from './types'

export interface ZoneMapProps {
  zones: DeliveryZone[]
  selectedId: string | null
  location: StoreLocation | null
  editor: { id: string | null; session: number } | null
  polygon: DeliveryPolygon | null
  drawing: boolean
  busy: boolean
  onSelect: (zone: DeliveryZone) => void
  onPolygon: (polygon: DeliveryPolygon) => void
  onError: (message: string) => void
}

function MapViewport({
  zones,
  selectedId,
  location,
  editing,
}: Pick<ZoneMapProps, 'zones' | 'selectedId' | 'location'> & {
  editing: boolean
}) {
  const map = useMap()
  const initiallyFitted = useRef(false)
  useEffect(() => {
    // Catalog refreshes (including a 409) must not move an unsaved draft.
    if (editing) {
      map.invalidateSize()
      return
    }
    const selected = zones.find((zone) => zone.id === selectedId)
    if (selected)
      map.fitBounds(
        L.latLngBounds(selected.polygon.coordinates[0].map(positionToLeaflet)),
        { padding: [24, 24], maxZoom: 16 },
      )
    else if (!initiallyFitted.current) {
      if (zones.length)
        map.fitBounds(
          L.latLngBounds(
            zones.flatMap((zone) =>
              zone.polygon.coordinates[0].map(positionToLeaflet),
            ),
          ),
          { padding: [24, 24], maxZoom: 15 },
        )
      else if (location)
        map.setView([location.latitude, location.longitude], 15)
      initiallyFitted.current = true
    }
    map.invalidateSize()
  }, [map, zones, selectedId, location, editing])
  return null
}

export default function ZoneMap(props: ZoneMapProps) {
  const [tileError, setTileError] = useState(false)
  const [tileAttempt, setTileAttempt] = useState(0)
  const location = props.location
  const firstZone = props.zones[0]?.polygon.coordinates[0][0]
  // Lima is only a viewport fallback, never a fabricated store location.
  const center: [number, number] = location
    ? [location.latitude, location.longitude]
    : firstZone
      ? positionToLeaflet(firstZone)
      : [-12.0464, -77.0428]
  return (
    <div className="space-y-2">
      {tileError && (
        <div
          role="alert"
          className="text-celtas-gold flex flex-wrap items-center gap-2 text-sm"
        >
          No se pudo cargar el mapa base. Tu borrador se conserva.
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTileError(false)
              setTileAttempt((value) => value + 1)
            }}
          >
            Reintentar mapa
          </Button>
        </div>
      )}
      {!location && (
        <p className="text-muted-foreground text-xs">
          Ubicación del local sin configurar. El mapa se centra en las zonas o
          en Lima.
        </p>
      )}
      <div className="relative isolate z-0 overflow-hidden rounded-lg border">
        <MapContainer
          center={center}
          zoom={15}
          className="h-[28rem] w-full"
          aria-label="Editor de zonas de delivery"
        >
          <TileLayer
            key={tileAttempt}
            {...tileLayerProps()}
            eventHandlers={{ tileerror: () => setTileError(true) }}
          />
          <MapViewport
            zones={props.zones}
            selectedId={props.selectedId}
            location={location}
            editing={props.editor !== null}
          />
          {location && (
            <Marker
              position={[location.latitude, location.longitude]}
              icon={storeMapIcon}
              pmIgnore
            >
              <Popup>Celtas (local)</Popup>
            </Marker>
          )}
          {props.zones
            .filter((zone) => zone.id !== props.editor?.id)
            .map((zone) => (
              <Polygon
                key={zone.id}
                positions={zone.polygon.coordinates[0].map(positionToLeaflet)}
                pmIgnore
                pathOptions={{
                  color:
                    zone.id === props.selectedId
                      ? 'var(--color-celtas-orange)'
                      : 'var(--color-celtas-gold)',
                  weight: zone.id === props.selectedId ? 4 : 2,
                  fillOpacity: zone.active ? 0.16 : 0.04,
                  dashArray: zone.active ? undefined : '6 5',
                }}
                eventHandlers={{
                  click: () => {
                    if (!props.busy && !props.drawing) props.onSelect(zone)
                  },
                }}
              >
                <Tooltip sticky>
                  {zone.name} · S/ {zone.fee.toFixed(2)} ·{' '}
                  {zone.active ? 'Activa' : 'Inactiva'}
                </Tooltip>
              </Polygon>
            ))}
          <GeomanEditor {...props} />
        </MapContainer>
      </div>
      <p className="text-muted-foreground text-xs">
        Solo polígonos sin huecos. Máximo 499 vértices. En edición, arrastra los
        vértices; pulsa los puntos intermedios para añadir y el botón derecho
        para quitar.
      </p>
    </div>
  )
}
