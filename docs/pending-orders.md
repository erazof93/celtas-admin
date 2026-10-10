# Bandeja de pedidos por aceptar

`pendiente` es el estado sin aceptar. La acción utiliza la mutación existente:
`PATCH /orders/:id/status`, body `{ "status": "confirmado" }`, solo admin.
Los demás estados reales son `confirmado`, `en_camino`, `entregado` y `cancelado`.
La bandeja no introduce un estado de preparación.

`usePendingOrders` usa una consulta independiente, asociada a identidad/sesión:
`['orders', 'pending', { identity, sessionId }]`. Consulta GET /orders con
status=pendiente y limit=100, recorre todas las páginas y ordena por createdAt
ascendente. El filtro y la página de la tabla general no afectan la bandeja.
Usa los mismos controles de polling, foco, conexión, autorización y cancelación.

No se retira un pedido antes del éxito del PATCH. Después se actualiza la bandeja
y se invalidan lista general, detalles, pendientes y dashboard. Se impide doble
envío local y se deshabilitan aceptaciones mientras hay una mutación de estado.
El backend serializa cambios con FOR UPDATE; una aceptación competidora produce 400. Se muestra el error y se vuelve a consultar REST.

La reconciliación SSE recupera la bandeja activa dentro del mismo lote REST y
la publica antes de confirmar el cursor. Nuevos pedidos, cambios de estado,
reconexión y stream.reset mantienen este flujo. No hay conexiones ni sonidos
adicionales. FCM conserva su invalidación de la raíz orders y deduplicación.

## Límites del contrato existente

- GET /orders pagina por offset, más recientes primero, sin snapshot ni orden
  ascendente seleccionable. Se detectan cambios en total, duplicados y faltantes
  y se rechaza el resultado parcial. No puede garantizar un snapshot atómico
  durante actividad concurrente con el mismo total.
- Se limita la recuperación a 100 páginas (hasta 10 000 pendientes). Si se
  exceden, se presenta error explícito; nunca se muestra un conjunto truncado.
- El contrato no expone una modalidad de entrega/recogida. deliveryMode en el
  snapshot corresponde a la tarifa, no a esa modalidad: no se inventa una etiqueta.
- Las capturas y pruebas de interfaz locales pueden usar REST simulado en
  memoria; no equivalen a aceptación E2E contra PostgreSQL.
