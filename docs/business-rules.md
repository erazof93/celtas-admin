# Reglas de negocio del frontend

Invariantes contrastadas con código y backend el 2026-10-04. Los cálculos
locales son presentación o preview; el backend decide validación, cobro y
persistencia. Antes de cambiar una regla, revisar los DTOs/servicios implicados.

## Pedidos y snapshots

| Estado                   | Transiciones permitidas   |
| ------------------------ | ------------------------- |
| `pendiente`              | `confirmado`, `cancelado` |
| `confirmado`             | `en_camino`, `cancelado`  |
| `en_camino`              | `entregado`, `cancelado`  |
| `entregado`, `cancelado` | Ninguna                   |

Cancelar desde `en_camino` exige motivo trimmed, máximo 500 caracteres;
en estados anteriores es opcional. El diálogo de confirmación bloquea doble
submit mientras está pendiente. No eliminar confirmaciones por conveniencia.
Marcar entregado actualiza `totalSpent` en backend; el frontend no suma dinero.

El PATCH de estado devuelve pedido sin relaciones: `merge.ts` conserva `items`
y `user` del detalle. `userId`/`user` pueden ser null en pedidos anónimos;
usar `orderCustomer()` para resolver identidad. No recomponer nombres/precios
históricos desde el menú actual.

`OrderItem` contiene snapshots de nombre, precio unitario y opciones;
`addressSnapshot` es un **JSON string**, con dirección/referencia/distrito y
coordenadas cuando existen. `selectedSauces` tiene tres estados distintos:
null = no aplica/legado; `[]` = eligió explícitamente sin salsas; nombres =
selección histórica. El comentario por ítem (máximo 140) aplica a todas sus unidades.

Backend guarda también snapshots de bebidas/extras (nombre y precio) y tipos
de papas. El tipo/detalle del frontend aún omite esas tres selecciones: deuda
actual, no ausencia de datos en backend. El subtotal real incorpora bebidas y
extras por unidad multiplicados por cantidad; no asumir `unitPrice * quantity`.
El total ya incluye delivery. El descuento mostrado se infiere de subtotales,
total y delivery con redondeo a dos decimales, no de un descuento enviado por UI.

## Pedido manual y opciones

`POST /orders/admin` recibe **customerId o customerName/customerPhone**, nunca
ambos. Celular peruano: nueve dígitos empezando en 9, con prefijo 51 opcional;
se normaliza a `51XXXXXXXXX`. Nombre máximo 100, cantidad entera 1–99,
comentario por línea máximo 140. El DTO admite IDs de producto/opciones,
cantidad/comentario y dirección; no enviar notas globales, deliveryFee,
precios ni snapshots `selected*` fabricados.

Una dirección guardada se convierte a snapshot para conservar ajustes del pin;
no sustituirlo por addressId perdiendo coordenadas editadas. Solo pin requiere
referencia y usa `Ubicación marcada en el mapa` como fullAddress. El límite de
80 caracteres de referencia es de entrada UI; referencias guardadas más largas
no se deben truncar incidentalmente. Cambiar cliente/modo sigue las decisiones
de conservación del mapa del componente actual.

- Opciones asignadas y opciones activas son conceptos diferentes. Backend
  considera el grupo asignado aunque todas estén inactivas; UI ofrece solo activas.
- Si un grupo requerido queda sin opciones activas, bloquear agregar salvo que
  permita explícitamente “Sin X”. En ese caso enviar `[]`, no omitir la clave.
  Un grupo opcional sin opciones activas puede omitirse.
- `sauceAllowWithout`, `beverageAllowWithout` y `extraPortionsAllowWithout`
  permiten selección vacía explícita en grupos requeridos. Papas no tiene esa opción.
- `sauceGroupMaxSelectable: null` significa sin límite; no reemplazarlo por 0
  o undefined. Bebidas/extras/papas conservan sus máximos numéricos y required.
- Las opciones inactivas siguen visibles en edición del menú como ocultas para
  conservar asignaciones existentes. No borrarlas al abrir/guardar un producto.
- `Beverage.includeFreeTo` hace gratis una bebida para ciertos productos solo
  si también está asignada entre sus bebidas. No crea una relación de oferta.
- Tipos de papas tienen default; backend mantiene uno al cambiarlo. El panel
  conserva las relaciones y reglas de selección sin inventar cargos de papas.

## Delivery y fechas

El backend estima distancia Haversine desde `store_location`; calcula la tarifa
con distancia real y tramos `<= maxDistanceKm` (último puede no tener límite).
La distancia mostrada se redondea a 50 m; `isFar` usa comparación estricta con
el radio y no prohíbe por sí solo crear un pedido. Pedidos sin coordenadas pueden
tener delivery 0. La cotización actual consulta `/delivery/estimate`; no mantener
el antiguo simulador local como fuente de cobro.

Fechas de negocio en **America/Lima**. Días `YYYY-MM-DD` no son timestamps UTC.
Dashboard usa `from/to`; reportes `startDate/endDate`, y comparación rangos
current/previous. Los ingresos/productos se agrupan por `deliveredAt`, no
createdAt. Reportes diferencia app/teléfono; solo top-products recibe `channel`,
summary admite `groupBy`. Conversión puede llegar como string; respetar totales
del servidor y no reinterpretar su aritmética.

## Banners, estrellas e hitos

Banners: título nullable; fechas vacías se envían como **null** para borrarlas,
omitirlas mantiene las anteriores en el PATCH. Los días seleccionados van
0 domingo a 6 sábado; null/`[]` significan todos. Los inputs de día se convierten
a inicio/fin de día en Lima; backend compara instantes start < end.
Acciones de categoría/producto usan UUID, no slugs. Reordenamiento optimista
debe conservar rollback al fallar; el DTO legítimamente contiene IDs.

Promociones de estrellas: días `YYYY-MM-DD`, inicio <= fin (mismo día válido),
multiplicador 0.01–99.99. Backend exige dos decimales; el formulario aún necesita
alinear ese límite explícito. `redeemableWithStars` y `specialReward` son switches
independientes; el canje valida su catálogo correspondiente, no la unión.

Hitos: umbral entero único y premio especial; las recompensas del cliente se
guardan como snapshots, no una FK que desaparece al borrar el hito. La
configuración vigente usa `soles_por_estrella`; no reintroducir el viejo
`estrellas_por_premio` como parámetro del esquema actual.

## Configuración, campañas y confirmaciones

Horario permite cruzar medianoche (cierre menor que apertura); horas iguales
se rechazan para un día abierto. Guardado actual: schedule, motivo de cierre,
toggle manual, en ese orden; el push del cambio de estado lee el motivo de BD.
Motivo vacío se resuelve como `Cerrado temporalmente`. Son PATCH separados,
sin atomicidad: un fallo parcial puede dejar configuración intermedia. Delivery
también guarda varias keys por separado. Los defaults defensivos del frontend
no representan necesariamente la semilla/estado del negocio.

Cupones percentage <=100; fixed_amount puede superar 100. Compra mínima vacía
o 0 se normaliza a null. La expiración individual se calcula en backend; campaña
masiva tiene su DTO/expiración y confirmación antes de mutar. No enviar el body
del formulario sin distinguir campaña y cupón individual.

Cupones automáticos: PUT reemplaza los cuatro campos discountType,
discountValue, thresholdAmount y expirationDays. Importes positivos hasta
99,999,999.99, máximo dos decimales; porcentaje <=100; vigencia entera 1–365.
Cambios afectan cupones nuevos, no reescriben los ya emitidos.

Marketing v1 es broadcast **manual** con confirmación, título/body y link
opcional máximo 500. No hay scheduler. UI valida URL; backend admite string
limitado: no ampliar a deep links sin decidirlo. `sent/total` no demuestra
recepción en dispositivos. Un envío de prueba puede notificar usuarios reales.

WhatsApp abre links calculados desde snapshots con teléfono actual del negocio.
`whatsapp-sent` registra confirmación manual, idempotente sobre la primera fecha;
**no envía mensajes**. Cancelados no habilitan estos links; fallback existente
puede usar `whatsappUrl` guardado.

Cambios de rol requieren confirmación y evitan autodegradación en UI. Vincular
pedidos anónimos exige preview y confirmación: un POST con `orderIds` (UUIDs
únicos, máximo 100), todo o nada; 409 si ya no son vinculables. Usar el
`totalSpent` absoluto de la respuesta, no sumarle un delta al perfil. No inventar
un filtro `customerPhone` de pedidos ni un endpoint de vinculación por pedido.

Fuentes: utilidades/forms/hooks de orders, menu, banners, coupons, settings,
star-promotions, reward-milestones, reports, users y marketing; DTOs/services
correspondientes en backend. Riesgos abiertos: [ROADMAP](../ROADMAP.md).
