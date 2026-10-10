# Opt-in de pedidos en builds productivos

Esta configuración prepara el frontend; no activa el backend ni modifica servicios
de Render, Vercel o Supabase. El contrato SSE y las operaciones REST permanecen iguales.

## Flags y valores por defecto

| Entorno                                                            | SSE                                                         | Alertas globales, sonido y FCM foreground                  |
| ------------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------- |
| Vite dev con API local                                             | `VITE_ORDER_EVENTS_ENABLED=true`                            | Se conserva la disponibilidad local actual                 |
| Vite dev con API remota                                            | Desactivado                                                 | Desactivado                                                |
| Build con flag productivo ausente o distinto de `true`             | Desactivado                                                 | Desactivado; push habitual conserva su registro/background |
| Build con `VITE_ORDER_EVENTS_PRODUCTION_ENABLED=true` y API válida | Activado para admin autenticado con coordinación disponible | Activado; sonido requiere interacción explícita            |

El opt-in productivo es independiente del flag de desarrollo y está apagado por
defecto. La URL por sí sola nunca lo activa. Solo se admite una URL absoluta HTTP(S),
sin credenciales, query ni fragmento. Un backend remoto exige HTTPS; HTTP loopback
se admite para validar el artefacto productivo local. Los prefijos API se conservan.

Los gates reales están en `events/environment.ts`, `events/service.ts` y
`alerts/environment.ts`. Se conserva el nombre histórico `localOrderAlertsEnabled`
para no cambiar sus consumidores, pero ahora contempla el opt-in productivo.

## Vercel y rollback

`VITE_*` se incorpora durante la compilación. Este es un flag de build, no runtime.
Cambiar una variable de Vercel después de publicar no modifica un artefacto existente:
se necesita otro build y un despliegue autorizado, o volver a un artefacto previo
que ya tenga el opt-in apagado. No hay un sistema independiente de flags runtime.

El backend puede devolver 503 al desactivar su flag, pero eso no elimina los controles
ni el consumidor foreground del frontend compilado con opt-in. Conservar REST/polling
y considerar ambos lados en el procedimiento de rollback. No revertir las tablas del
outbox como rollback de interfaz.

Antes de cualquier activación deben acreditarse migraciones, listener PostgreSQL,
CORS, proxy, capacidad, backups y los restantes requisitos de la auditoría 7B.

## Validación local del artefacto

Compilar dos variantes mediante el script oficial `pnpm run build`, con variables
solo en el proceso de prueba y destinos nuevos fuera del repositorio. Por ejemplo,
seleccionar un backend aislado loopback y establecer el flag productivo en `true`
o `false`; el script admite `--outDir <directorio-nuevo>`.

Servir los archivos compilados con fallback SPA. No usar Vite dev como evidencia
de funcionamiento productivo. Abrir un contexto de Chrome nuevo y aislar push antes
de cargar la aplicación; consultar [Firebase E2E](firebase-e2e.md).

El artefacto productivo no debe utilizar el opt-out E2E de desarrollo: sus condiciones
siguen siendo `DEV && MODE=e2e && VITE_E2E_DISABLE_PUSH=true`. En pruebas del artefacto
se debe aislar explícitamente el navegador: omitir Notification antes del bootstrap,
impedir workers y bloquear tráfico externo/operaciones de tokens en el harness. Este
aislamiento no se incluye en el código ni en la configuración de producción.

Mantener credenciales de testing únicamente en memoria, una base nueva con marcador
descartable y proveedores inertes. No usar los scripts antiguos que reciben contraseñas
por argumentos CLI. No reutilizar sesiones ni service workers anteriores.

## Comportamiento preservado y límites

- SSE mantiene una conexión coordinada, replay, reset, backoff y cursor durable
  después de la reconciliación REST.
- Solo `order.created` en vivo y confirmado por REST ofrece una alerta. Replay,
  reset y recuperación histórica siguen silenciosos.
- Bandeja y tabla continúan consultando REST y usando polling incluso sin SSE.
  La bandeja no depende de los filtros ni de la página visible de tabla.
- Aceptar sigue enviando `PATCH /orders/:id/status` con `status: confirmado`.
- No se registran tokens adicionales por añadir el gate; el foreground reutiliza
  el registro Firebase existente y su limpieza de sesión.
- El ledger coordina pestañas del mismo origen/API/administrador; no deduplica
  notificaciones de sistema del worker contra avisos del panel.
- El sonido requiere activación por pestaña, no persiste su activación tras recarga
  y no garantiza entrega audible. La verificación de `play()` no prueba audibilidad.

Tests de gates reales: `events/environment.test.ts`. Transporte productivo y limpieza:
`events/service.test.tsx`. Firebase productivo y opt-out E2E: `lib/firebase.test.ts`.
