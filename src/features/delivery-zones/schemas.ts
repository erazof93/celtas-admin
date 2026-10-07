import { z } from 'zod'

const positionSchema = z.tuple([
  z
    .number('La longitud debe ser finita')
    .min(-180, 'Longitud fuera de rango')
    .max(180, 'Longitud fuera de rango'),
  z
    .number('La latitud debe ser finita')
    .min(-90, 'Latitud fuera de rango')
    .max(90, 'Latitud fuera de rango'),
])

export const deliveryPolygonSchema = z
  .strictObject({
    type: z.literal('Polygon'),
    coordinates: z.tuple([
      z
        .array(positionSchema)
        .min(4, 'Dibuja al menos tres vértices')
        .max(500, 'Máximo 499 vértices más el cierre'),
    ]),
  })
  .superRefine(({ coordinates: [ring] }, ctx) => {
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (!first || !last) return
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (first[0] !== last[0] || first[1] !== last[1])
      issue('El polígono debe estar cerrado')
    const vertices = ring.slice(0, -1)
    const distinct = new Set(vertices.map(([lng, lat]) => `${lng},${lat}`))
    if (distinct.size < 3) issue('Se necesitan tres vértices distintos')
    if (distinct.size !== vertices.length)
      issue('El polígono tiene vértices repetidos')
    if (
      Math.max(...ring.map((p) => p[0])) - Math.min(...ring.map((p) => p[0])) >=
      180
    )
      issue('El polígono debe ser local y no cruzar el antimeridiano')
    let twiceArea = 0
    for (let i = 1; i < ring.length - 1; i++) {
      twiceArea +=
        (ring[i][0] - first[0]) * (ring[i + 1][1] - first[1]) -
        (ring[i][1] - first[1]) * (ring[i + 1][0] - first[0])
    }
    if (Math.abs(twiceArea) <= 2e-20)
      issue('El polígono no puede tener área cero')
    for (let i = 0; i < ring.length - 1; i++) {
      if (
        Math.hypot(ring[i + 1][0] - ring[i][0], ring[i + 1][1] - ring[i][1]) <=
        1e-10
      ) {
        issue('El polígono tiene segmentos degenerados')
        break
      }
    }
  })

const feeSchema = z
  .number('La tarifa debe ser un número finito')
  .min(0, 'La tarifa no puede ser negativa')
  .max(99999999.99, 'La tarifa excede el máximo permitido')
  .refine((value) => {
    const [coefficient, exponent = '0'] = value.toString().split('e')
    return (coefficient.split('.')[1]?.length ?? 0) - Number(exponent) <= 2
  }, 'La tarifa admite como máximo dos decimales')

export const createDeliveryZoneSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(100, 'Máximo 100 caracteres'),
  polygon: deliveryPolygonSchema,
  fee: feeSchema,
  active: z.boolean().optional(),
})

export const updateDeliveryZoneSchema = createDeliveryZoneSchema.partial()

export const zoneFormSchema = createDeliveryZoneSchema.extend({
  fee: z
    .string()
    .trim()
    .min(1, 'La tarifa es obligatoria')
    .transform(Number)
    .pipe(feeSchema),
  active: z.boolean(),
  polygon: deliveryPolygonSchema
    .nullable()
    .refine((polygon) => polygon !== null, 'Dibuja y finaliza el polígono'),
})

export type ZoneFormInput = z.input<typeof zoneFormSchema>
export type ZoneFormValues = z.output<typeof zoneFormSchema>
