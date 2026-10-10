import {
  localOrderEventsApi,
  orderEventsApi,
  productionOrderEventsEnabled,
} from '../events/environment'

/** Preserve local alerts; production shares the explicit SSE feature opt-in. */
export function localOrderAlertsEnabled() {
  if (!import.meta.env.DEV)
    return productionOrderEventsEnabled(import.meta.env.VITE_API_BASE_URL)
  const url = orderEventsApi(import.meta.env.VITE_API_BASE_URL)
  return Boolean(url && localOrderEventsApi(url))
}
