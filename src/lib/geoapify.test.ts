import { afterEach, describe, expect, it, vi } from 'vitest'
import { geoapifyAutocomplete, parseGeoapifySuggestions } from './geoapify'

function feature(properties: Record<string, unknown>) {
  return { type: 'Feature', properties }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('parseGeoapifySuggestions (espejo de GeoapifySuggestion de la app)', () => {
  it('calle + número + distrito (city) antes que formatted', () => {
    const [s] = parseGeoapifySuggestions({
      features: [
        feature({
          lat: -12.158,
          lon: -76.972,
          formatted: 'I.E. San Juan, Avenida Los Héroes 1080, San Juan de Miraflores, Lima, Perú',
          street: 'Avenida Los Héroes',
          housenumber: '1080',
          city: 'San Juan de Miraflores',
          district: 'El Arenal',
        }),
      ],
    })
    expect(s).toEqual({
      fullAddress: 'Avenida Los Héroes 1080, San Juan de Miraflores',
      formatted: 'I.E. San Juan, Avenida Los Héroes 1080, San Juan de Miraflores, Lima, Perú',
      district: 'San Juan de Miraflores',
      latitude: -12.158,
      longitude: -76.972,
    })
  })

  it('sin calle, o calle igual al nombre del POI → usa formatted', () => {
    const [noStreet, poi] = parseGeoapifySuggestions({
      features: [
        feature({ lat: 1, lon: 2, formatted: 'Pampas de San Juan, Lima' }),
        feature({ lat: 3, lon: 4, formatted: 'Parque Cáceres, SJM', street: 'Parque Cáceres', name: 'Parque Cáceres' }),
      ],
    })
    expect(noStreet.fullAddress).toBe('Pampas de San Juan, Lima')
    expect(poi.fullAddress).toBe('Parque Cáceres, SJM')
  })

  it('descarta features incompletos y nunca lanza con basura', () => {
    expect(
      parseGeoapifySuggestions({
        features: [feature({ lat: 1, formatted: 'sin lon' }), null, 'x', feature({ lat: 1, lon: 2, formatted: 'ok' })],
      }).map((s) => s.fullAddress),
    ).toEqual(['ok'])
    expect(parseGeoapifySuggestions(null)).toEqual([])
    expect(parseGeoapifySuggestions({ features: 'no' })).toEqual([])
  })
})

describe('geoapifyAutocomplete', () => {
  it('llama a Geoapify con los mismos parámetros que la app (es, Perú, 5)', async () => {
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-key')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [feature({ lat: 1, lon: 2, formatted: 'Jr. X 1' })] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await geoapifyAutocomplete('  Jr. X  ')

    expect(result.map((s) => s.fullAddress)).toEqual(['Jr. X 1'])
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe('https://api.geoapify.com/v1/geocode/autocomplete')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      text: 'Jr. X',
      apiKey: 'test-key',
      lang: 'es',
      filter: 'countrycode:pe',
      limit: '5',
    })
  })

  it('429 / error de red → [] sin lanzar', async () => {
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    await expect(geoapifyAutocomplete('Jr. X')).resolves.toEqual([])

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(geoapifyAutocomplete('Jr. X')).resolves.toEqual([])
  })

  it('sin key configurada → [] sin llamar a Geoapify', async () => {
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(geoapifyAutocomplete('Jr. X')).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
