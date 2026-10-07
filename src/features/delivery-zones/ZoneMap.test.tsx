import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import L from 'leaflet'
import ZoneMap, { type ZoneMapProps } from './ZoneMap'

// Real Leaflet viewport and Geoman, without network-dependent tiles.
vi.mock('react-leaflet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-leaflet')>()
  return { ...actual, TileLayer: () => null }
})
Object.defineProperty(L.Browser, 'svg', { value: true, configurable: true })
afterEach(() => vi.restoreAllMocks())

describe('viewport del borrador', () => {
  it('no recentra al refrescar catálogo durante una edición; vuelve a ajustar al cerrarla', () => {
    const polygon = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [-77, -12],
          [-76.99, -12],
          [-76.99, -11.99],
          [-77, -12],
        ],
      ],
    } as NonNullable<ZoneMapProps['polygon']>
    const zone = {
      id: 'qa',
      name: 'QA',
      polygon,
      fee: 3,
      active: true,
      createdAt: '',
      updatedAt: '',
    }
    const props: ZoneMapProps = {
      zones: [zone],
      selectedId: 'qa',
      location: null,
      editor: null,
      polygon: null,
      drawing: false,
      busy: false,
      onSelect: vi.fn(),
      onPolygon: vi.fn(),
      onError: vi.fn(),
    }
    const fit = vi.spyOn(L.Map.prototype, 'fitBounds')
    const view = render(<ZoneMap {...props} />)
    expect(fit).toHaveBeenCalled()
    fit.mockClear()
    const editing = { ...props, editor: { id: 'qa', session: 1 }, polygon }
    view.rerender(<ZoneMap {...editing} />)
    view.rerender(<ZoneMap {...editing} zones={[{ ...zone }]} />)
    expect(fit).not.toHaveBeenCalled()
    view.rerender(<ZoneMap {...props} />)
    expect(fit).toHaveBeenCalled()
  })
})
