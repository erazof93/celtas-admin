import { StrictMode, useEffect } from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import L from 'leaflet'
import { MapContainer, useMap } from 'react-leaflet'
import { GeomanEditor } from './GeomanEditor'
import { positionToLeaflet } from './coordinates'
import type { ZoneMapProps } from './ZoneMap'

// Actual Leaflet/Geoman, no tiles/network. jsdom lacks SVG capability detection;
// this enables its SVG DOM renderer, but cannot validate browser layout or drag.
Object.defineProperty(L.Browser, 'svg', { value: true, configurable: true })
const polygon: NonNullable<ZoneMapProps['polygon']> = {
  type: 'Polygon',
  coordinates: [
    [
      [-77, -12],
      [-76.99, -12],
      [-76.99, -11.99],
      [-77, -12],
    ],
  ],
}
function Probe({ onMap }: { onMap: (map: L.Map) => void }) {
  const map = useMap()
  useEffect(() => {
    onMap(map)
  }, [map, onMap])
  return null
}
function polygons(map: L.Map) {
  const layers: L.Polygon[] = []
  map.eachLayer((layer) => {
    if (layer instanceof L.Polygon) layers.push(layer)
  })
  return layers
}
function initialProps(): ZoneMapProps {
  return {
    zones: [],
    selectedId: null,
    location: null,
    editor: { id: 'a', session: 1 },
    polygon,
    drawing: false,
    busy: false,
    onSelect: vi.fn(),
    onPolygon: vi.fn(),
    onError: vi.fn(),
  }
}
describe('lifecycle con Leaflet/Geoman reales en jsdom', () => {
  it('StrictMode crea una sola capa editable; mover no reconstruye; cancelar limpia', async () => {
    let map: L.Map | undefined
    const onMap = (value: L.Map) => {
      map = value
    }
    const props = initialProps()
    const view = (current: ZoneMapProps) => (
      <StrictMode>
        <MapContainer center={[-12, -77]} zoom={15}>
          <Probe onMap={onMap} />
          <GeomanEditor {...current} />
        </MapContainer>
      </StrictMode>
    )
    const result = render(view(props))
    await waitFor(() => expect(map && polygons(map)).toHaveLength(1))
    const layer = polygons(map!)[0]
    expect(layer.pm.enabled()).toBe(true)
    const changed = {
      ...polygon,
      coordinates: [
        [
          [-77, -12],
          [-76.98123456789, -12],
          [-76.99, -11.99],
          [-77, -12],
        ],
      ],
    } as typeof polygon
    act(() => {
      layer.setLatLngs(
        changed.coordinates[0].slice(0, -1).map(positionToLeaflet),
      )
      layer.fire('pm:change')
    })
    expect(props.onPolygon).toHaveBeenCalledWith(changed)
    result.rerender(view({ ...props, polygon: changed }))
    expect(polygons(map!)[0]).toBe(layer)
    result.rerender(view({ ...props, busy: true }))
    expect(layer.pm.enabled()).toBe(false)
    result.rerender(view({ ...props, editor: null, polygon: null }))
    expect(polygons(map!)).toHaveLength(0)
    const calls = vi.mocked(props.onPolygon).mock.calls.length
    act(() => {
      layer.fire('pm:change')
    })
    expect(props.onPolygon).toHaveBeenCalledTimes(calls)
    result.rerender(view({ ...props, editor: { id: 'a', session: 2 } }))
    expect(polygons(map!)[0].toGeoJSON(false).geometry).toEqual(polygon)
    result.unmount()
  })
  it('dibujo únicamente Polygon y cleanup de listeners/capas temporales', async () => {
    let map: L.Map | undefined
    const onMap = (value: L.Map) => {
      map = value
    }
    const props = { ...initialProps(), polygon: null, drawing: true }
    const view = (current: ZoneMapProps) => (
      <StrictMode>
        <MapContainer center={[-12, -77]} zoom={15}>
          <Probe onMap={onMap} />
          <GeomanEditor {...current} />
        </MapContainer>
      </StrictMode>
    )
    const result = render(view(props))
    await waitFor(() => expect(map?.pm.Draw.getActiveShape()).toBe('Polygon'))
    expect(map!.pm.globalCutModeEnabled()).toBe(false)
    act(() => {
      for (const position of polygon.coordinates[0].slice(0, -1)) {
        map!.fire('click', { latlng: L.latLng(positionToLeaflet(position)) })
      }
    })
    expect(props.onPolygon).not.toHaveBeenCalled()
    act(() => {
      map!.fire('click', {
        latlng: L.latLng(positionToLeaflet(polygon.coordinates[0][0])),
      })
    })
    const layer = polygons(map!)[0]
    expect(props.onPolygon).toHaveBeenCalledTimes(1)
    expect(props.onPolygon).toHaveBeenCalledWith(polygon)
    result.rerender(view({ ...props, editor: null, drawing: false }))
    expect(map!.hasLayer(layer)).toBe(false)
    expect(map!.pm.globalDrawModeEnabled()).toBe(false)
    act(() => {
      map!.fire('pm:create', { shape: 'Polygon', layer })
    })
    expect(props.onPolygon).toHaveBeenCalledTimes(1)
    result.unmount()
  })
})
