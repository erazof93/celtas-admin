import type { Setting } from './types'
import type { DeliveryMode } from '../delivery-zones/types'

export const DELIVERY_MODE_KEY = 'delivery_mode'

export function deliveryModeFromSettings(
  settings: Setting[] | undefined,
): DeliveryMode | null {
  if (!settings) return null
  const value =
    settings.find((setting) => setting.key === DELIVERY_MODE_KEY)?.value ??
    'DISTANCE'
  return value === 'DISTANCE' || value === 'ZONES' ? value : null
}
