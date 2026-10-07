import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import '@geoman-io/leaflet-geoman-free'
import { polygonFromLeaflet, positionToLeaflet } from './coordinates'
import type { ZoneMapProps } from './ZoneMap'

export function GeomanEditor(props: ZoneMapProps) {
  const map = useMap()
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })
  const layerRef = useRef<L.Polygon | null>(null)
  const session = props.editor?.session
  const drawing = props.drawing

  useEffect(() => {
    if (session === undefined) return
    let temporary: L.Layer | null = null
    const emit = (layer: L.Polygon) => {
      try {
        latest.current.onPolygon(polygonFromLeaflet(layer))
      } catch {
        latest.current.onError(
          'El dibujo debe ser un Polygon con un único anillo exterior.',
        )
      }
    }
    const created: L.PM.CreateEventHandler = ({ layer, shape }) => {
      if (shape === 'Polygon' && layer instanceof L.Polygon) {
        temporary = layer
        emit(layer)
      }
    }
    const intersect = () =>
      latest.current.onError(
        'Los lados de la zona no pueden cruzarse. Corrige los vértices.',
      )
    map.pm.setLang('es')
    map.on('pm:intersect', intersect)
    if (drawing) {
      map.on('pm:create', created)
      map.pm.enableDraw('Polygon', {
        allowSelfIntersection: false,
        continueDrawing: false,
        // Closure on the first vertex avoids a global Enter listener affecting forms.
        finishOnEnter: false,
        pathOptions: { color: 'var(--color-celtas-orange)', fillOpacity: 0.2 },
      })
    } else if (latest.current.polygon) {
      const layer = L.polygon(
        latest.current.polygon.coordinates[0]
          .slice(0, -1)
          .map(positionToLeaflet),
        {
          color: 'var(--color-celtas-orange)',
          weight: 4,
          fillOpacity: 0.2,
        },
      ).addTo(map)
      layerRef.current = layer
      layer.pm.enable({
        allowSelfIntersection: false,
        allowCutting: false,
        allowRemoval: false,
        allowRotation: false,
        removeLayerBelowMinVertexCount: false,
        addVertexValidation: () => {
          const count = (layer.getLatLngs()[0] as L.LatLng[]).length
          if (count >= 499)
            latest.current.onError('Máximo 499 vértices más el cierre')
          return count < 499
        },
      })
      const changed = () => emit(layer)
      layer.on('pm:change', changed)
      layer.on('pm:intersect', intersect)
      return () => {
        map.off('pm:intersect', intersect)
        layer.off('pm:change', changed)
        layer.off('pm:intersect', intersect)
        layer.pm.disable()
        layer.remove()
        layerRef.current = null
      }
    }
    return () => {
      map.off('pm:create', created)
      map.off('pm:intersect', intersect)
      map.pm.disableDraw()
      temporary?.remove()
    }
  }, [map, session, drawing])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    if (props.busy) layer.pm.disable()
    else layer.pm.enable()
  }, [props.busy, session, drawing])
  return null
}
