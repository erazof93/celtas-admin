export type DeliveryMode = 'DISTANCE' | 'ZONES'
export type Position = [longitude: number, latitude: number]

export interface DeliveryPolygon {
  type: 'Polygon'
  coordinates: [Position[]]
}

export interface DeliveryZoneSummary {
  id: string
  name: string
}

export interface DeliveryZone extends DeliveryZoneSummary {
  polygon: DeliveryPolygon
  fee: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateDeliveryZoneInput {
  name: string
  polygon: DeliveryPolygon
  fee: number
  active?: boolean
}

export type UpdateDeliveryZoneInput = Partial<CreateDeliveryZoneInput>
