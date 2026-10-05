# Integración con backend-celtas

Implementación contrastada con `src/` y `../backend-celtas` el 2026-10-04.
El backend hermano es NestJS; su código es una fuente verificable, pero no debe
modificarse desde una tarea del frontend sin autorización. La documentación de
Swagger no sustituye los DTOs, servicios y entidades reales.

## URL, cliente y respuestas

`src/lib/api-client.ts` crea una instancia Axios con
`import.meta.env.VITE_API_BASE_URL`, sin fallback, timeout ni proxy local.
Usar sus helpers `get/post/patch/put/del` desde los hooks de las features;
no crear clientes paralelos. Variables necesarias: [README](../README.md).

El interceptor añade `Authorization: Bearer <accessToken>` y desenvuelve
`{ success: true, data: ... }`: los hooks reciben directamente `data`.
El filtro de excepciones del backend devuelve
`{ success: false, message, statusCode }`; los mensajes de class-validator pueden
llegar unidos en un string. No asumir siempre un array. Los errores permanecen
como errores Axios y se interpretan en utilidades/formularios locales.

Usuarios, pedidos y cupones devuelven `{ items, meta }`, donde `meta` incluye
`page`, `limit`, `total` y `totalPages`. Banners, settings y catálogos devuelven
arrays: **banners no es paginado**. Revisar cada endpoint antes de reutilizar
un componente de listado. El backend usa ValidationPipe con whitelist,
forbidNonWhitelisted y transform: un campo ajeno al DTO provoca 400.

## Sesión y autorización

- Login tradicional: `POST /auth/login` con email/password; recibe usuario y
  tokens. No hay registro ni Google login en este panel.
- Access token y usuario solo en el store de Zustand. Refresh token en
  localStorage bajo `celtas_refresh_token`; no persistir access token.
- Bootstrap: `POST /auth/refresh` con `{ refreshToken }` antes de resolver las
  rutas. Guarda los nuevos tokens; sin refresh muestra login. El query tiene
  retry desactivado y `staleTime: Infinity`.
- Un 401 ajeno a login/refresh inicia refresh; otras solicitudes esperan en
  una cola. Tras éxito se reenvían con el access token nuevo. Un 401 del refresh
  limpia sesión y redirige; fallos transitorios conservan el refresh token.
  La cola tiene un riesgo pendiente de marca `_retry` incompleta; no prometer
  un máximo de un retry para todas las solicitudes.
- En bootstrap un fallo transitorio devuelve null conservando el refresh;
  no hay un flujo explícito de recuperación/reintento en la pantalla de login.
- Logout limpia sesión/localStorage y navega a `/login`. No revoca el refresh
  en el servidor ni elimina el token FCM registrado. El backend emite refresh
  nuevo, pero esto no demuestra invalidación del anterior.
- ProtectedRoute exige rol `admin`. Los controllers del backend aplican JWT y
  roles; geocodificación, estimación de delivery y FCM tienen sus propios guards.
  No confiar en ocultar botones como autorización. La sesión no se actualiza
  automáticamente cuando otro admin cambia un rol.

La persistencia del refresh es una decisión actual: una migración a cookie
httpOnly requeriría coordinación con backend y una tarea independiente.

## Contratos y tipos

`src/types/api.d.ts` es un snapshot generado por openapi-typescript. **Nunca
editarlo manualmente.** `scripts/generate-types.mjs` carga `.env`, toma
`VITE_API_BASE_URL` o su fallback de producción, consulta `/docs-json` y
sobrescribe ese archivo con pnpm. Esa resolución no equivale necesariamente
al modo `.env.<mode>` de Vite. No se ejecutó generación en la migración.

Swagger tiene gaps: numerosas respuestas son `content?: never` o poco
específicas. Los tipos manuales de features reflejan entidades/servicios reales
y son necesarios; no eliminarlos por una regla de preferencia absoluta por
generados. También existen DTOs locales que requieren contrastar deriva.
`orders/manual-order.contract.test.ts` comprueba compatibilidad de entrada;
los chequeos `expectTypeOf` necesitan verificación TypeScript, no solo Vitest.

`/coupons/auto-config` está en Swagger de producción, confirmado por el
desarrollador, pero **no aparece en el archivo generado actual**. La respuesta y
entrada locales de cuatro campos se contrastan con backend. Regenerar y revisar
tipos es una tarea posterior separada; no interpretar su ausencia como endpoint
no desplegado. No se volvió a verificar el Swagger remoto durante esta migración.

## Mapa de llamadas actuales

Mapa de mantenimiento bajo demanda, no contrato exhaustivo del backend.
Los parámetros y bodies exactos se revisan en los hooks y DTOs.

| Recurso            | Llamadas del panel                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Auth               | POST `/auth/login`, `/auth/refresh`                                                                |
| Dashboard          | GET `/admin/dashboard/{summary,top-products,metrics,revenue-trend}`                                |
| Reportes           | GET `/admin/reports/{summary,comparison,top-products,conversion}`                                  |
| Menú               | GET/POST `/menu/categories`, `/menu/items`; PATCH/DELETE `/:id`; POST `/menu/items/:id/image`      |
| Opciones           | GET/POST y PATCH/DELETE `/:id` en `/sauces`, `/beverages`, `/extra-portions`, `/fries-types`       |
| Pedidos            | GET `/orders`, `/orders/:id`; PATCH `/orders/:id/status`; POST `/orders/admin`                     |
| Dirección/delivery | GET `/orders/geocode`, `/delivery/estimate`                                                        |
| WhatsApp           | GET `/orders/admin/:orderId/whatsapp-links`; POST `/orders/admin/:orderId/whatsapp-sent` sin body  |
| Cupones            | GET `/coupons`; POST `/coupons/generate`, `/coupons/generate-bulk`; GET/PUT `/coupons/auto-config` |
| Banners            | GET/POST `/banners`; PATCH/DELETE `/banners/:id`; POST `/:id/image`; PATCH `/banners/reorder`      |
| Estrellas          | GET/POST `/star-promotions`; PATCH `/:id`; sin borrado en la UI                                    |
| Hitos              | GET/POST `/reward-milestones`; PATCH/DELETE `/:id`                                                 |
| Usuarios           | GET `/users`, `/users/:id/addresses`; PATCH `/users/:id/role`                                      |
| Vinculación        | GET `/users/:id/anonymous-orders`; POST `/users/:id/link-anonymous-orders`                         |
| Settings           | GET `/settings`; PATCH `/settings` con `{ key, value, description? }`                              |
| Marketing          | GET `/marketing/broadcast-history`; POST `/marketing/broadcast`                                    |
| FCM                | PATCH `/users/me/fcm-token`                                                                        |

No se consume `/admin/reports/daily-metrics`, ni el DELETE de FCM disponible en
backend. El reordenamiento de banners sí tiene IDs en su DTO
`{ items: [{ id, order }] }`; no aplicar una prohibición global de IDs en body.
`GET /users` admite sortBy/order, no el buscador remoto ficticio de planes antiguos.

## Servicios externos y entorno

- Firebase: `lib/firebase.ts` comprueba soporte/configuración, pide permiso,
  registra `/firebase-messaging-sw.js`, obtiene token con VAPID y lo envía al
  backend. Es best-effort y no bloquea el panel. El worker recibe background;
  no hay listener foreground ni invalidación de queries por push.
- Geoapify: autocomplete directo desde `lib/geoapify.ts` con key `VITE_*`,
  mínimo cuatro caracteres y debounce 400 ms; falla a lista vacía. Mapas
  estáticos de direcciones usan Geoapify; Leaflet muestra tiles. Geocodificación
  y cálculo de cobro se consultan al backend, no se simulan localmente.
- CORS: el backend configura orígenes con `ALLOWED_ORIGINS`. El origen real del
  dev server/despliegue debe estar permitido; el frontend no puede corregirlo
  cambiando una cabecera. Usar un entorno de pruebas para mutaciones/E2E.
- Todo `VITE_*` termina expuesto al navegador. No incluir secretos de servidor
  ni reproducir valores privados de `.env`. No existe validación ambiental
  central; faltantes pueden producir fallos tardíos o desactivar integraciones.

Fuentes de contraste: `lib/api-client.ts`, `features/auth/`, hooks y tipos de
features, `lib/firebase.ts`, `lib/geoapify.ts`, worker y script de generación;
en backend: `main.ts`, auth, filtros/interceptors globales y modules/DTOs/services.
