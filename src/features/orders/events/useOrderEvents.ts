import { useEffect, useSyncExternalStore } from 'react'
import { orderEventsService } from './coordinated-service'

export function useOrderEvents() {
  useEffect(() => orderEventsService.mount(), [])
  return useSyncExternalStore(
    orderEventsService.subscribe,
    orderEventsService.getSnapshot,
  )
}
