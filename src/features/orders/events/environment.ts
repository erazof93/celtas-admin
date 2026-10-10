/** Reject ambiguous URLs and credentials; API prefixes remain supported. */
export function orderEventsApi(value: string | undefined): URL | undefined {
  if (!value) return
  try {
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return
    return url
  } catch {
    return
  }
}

export function localOrderEventsApi(url: URL): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

/** Build-time opt-in. HTTP is allowed only for isolated loopback validation. */
export function productionOrderEventsEnabled(
  value: string | undefined,
): boolean {
  if (
    import.meta.env.DEV ||
    import.meta.env.VITE_ORDER_EVENTS_PRODUCTION_ENABLED !== 'true'
  )
    return false
  const url = orderEventsApi(value)
  return Boolean(url && (url.protocol === 'https:' || localOrderEventsApi(url)))
}
