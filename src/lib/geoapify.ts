/**
 * Autocompletado de direcciones con Geoapify, llamado DIRECTO desde el panel
 * (no hay endpoint de autocomplete en backend-celtas). Mismo diseño que
 * celtas-mobile (lib/features/addresses/data/geoapify_repository.dart):
 *
 * - Misma key (`VITE_GEOAPIFY_API_KEY`, la de los tiles del mapa): Geoapify
 *   usa una sola key para Autocomplete + Geocoding + Map Tiles.
 * - Mismos parámetros: `lang=es`, `filter=countrycode:pe`, `limit=5`.
 * - NUNCA lanza: el rate limit (5 req/seg) es compartido por todo el
 *   ecosistema, y un 429 o una caída no deben romper la pantalla — sin
 *   sugerencias, el admin sigue con el botón Buscar (backend) o el mapa.
 * - NO usa api-client: ese cliente apunta al backend y sus interceptores
 *   (Authorization, envelope { success, data }, refresh en 401) no aplican a
 *   api.geoapify.com.
 */

const AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete'

export interface GeoapifySuggestion {
  /** Texto para el input (calle + número + distrito si se pudo armar). */
  fullAddress: string
  /** `properties.formatted`: línea completa, para mostrar en la lista. */
  formatted: string
  district: string | null
  latitude: number
  longitude: number
}

export function geoapifyApiKey(): string | null {
  const key = import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined
  return key && key.trim() ? key : null
}

const nonEmpty = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v : null

/**
 * Espejo de `bestDistrict` de la app: `city` primero — para San Juan de
 * Miraflores Geoapify trae el distrito real en `city` y un barrio OSM más fino
 * en `district`.
 */
function bestDistrict(p: Record<string, unknown>): string | null {
  return nonEmpty(p.city) ?? nonEmpty(p.suburb) ?? nonEmpty(p.district)
}

/**
 * Espejo de `bestFullAddress` de la app: calle + número (+ distrito) antes que
 * `formatted`, que muchas veces arranca con un POI cercano ("I.E. X, Jr. Y…").
 * Cae a `formatted` si no hay calle o si la "calle" es el nombre del POI.
 */
function bestFullAddress(p: Record<string, unknown>, formatted: string): string {
  const street = nonEmpty(p.street)
  if (!street) return formatted
  const name = nonEmpty(p.name)
  if (name && name.trim() === street.trim()) return formatted
  const housenumber = nonEmpty(p.housenumber)
  const streetPart = housenumber ? `${street} ${housenumber}` : street
  const district = bestDistrict(p)
  return district ? `${streetPart}, ${district}` : streetPart
}

/** GeoJSON de Geoapify → sugerencias. Descarta features incompletos; nunca lanza. */
export function parseGeoapifySuggestions(json: unknown): GeoapifySuggestion[] {
  if (!json || typeof json !== 'object') return []
  const features = (json as { features?: unknown }).features
  if (!Array.isArray(features)) return []
  const result: GeoapifySuggestion[] = []
  for (const feature of features) {
    const p = (feature as { properties?: unknown } | null)?.properties
    if (!p || typeof p !== 'object') continue
    const props = p as Record<string, unknown>
    const { lat, lon, formatted } = props
    if (typeof lat !== 'number' || typeof lon !== 'number' || typeof formatted !== 'string') {
      continue
    }
    result.push({
      fullAddress: bestFullAddress(props, formatted),
      formatted,
      district: bestDistrict(props),
      latitude: lat,
      longitude: lon,
    })
  }
  return result
}

/** Sugerencias para `text`; `[]` ante key ausente, texto vacío o cualquier error. */
export async function geoapifyAutocomplete(
  text: string,
  signal?: AbortSignal,
): Promise<GeoapifySuggestion[]> {
  const apiKey = geoapifyApiKey()
  const query = text.trim()
  if (!apiKey || !query) return []
  const params = new URLSearchParams({
    text: query,
    apiKey,
    lang: 'es',
    filter: 'countrycode:pe',
    limit: '5',
  })
  try {
    const response = await fetch(`${AUTOCOMPLETE_URL}?${params.toString()}`, { signal })
    if (!response.ok) return []
    return parseGeoapifySuggestions(await response.json())
  } catch {
    return []
  }
}
