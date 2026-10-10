# Fase 7C.1 — validación local

Resultado: **PASS para preparación del frontend y validación local**. No autoriza
activar producción. No hubo deploy, commit, push, modificación de backend/app ni
escrituras sobre bases preexistentes.

## Diseño y cambios

El nuevo flag de build `VITE_ORDER_EVENTS_PRODUCTION_ENABLED=true` permite SSE y
alertas en producción. Ausente, `false` o cualquier otro valor: apagados. Exige una
URL absoluta HTTP(S), sin credenciales, query ni fragmento; remoto exige HTTPS y
HTTP solo se admite en loopback. La URL por sí sola no activa nada.

Desarrollo conserva su opt-in SSE local `VITE_ORDER_EVENTS_ENABLED=true` y las
alertas locales existentes. REST y polling permanecen. No hay flag runtime:
desactivar un artefacto publicado requiere rebuild autorizado o rollback a uno
previamente compilado sin opt-in. Véase [procedimiento](order-events-production.md).

Cambios de esta fase, sobre el trabajo previo ya existente:

- `src/features/orders/events/environment.ts`: validación y gate compartido.
- `src/features/orders/events/service.ts`: consume el gate productivo.
- `src/features/orders/alerts/environment.ts`: permite alertas con el mismo opt-in.
- `src/features/orders/events/environment.test.ts`: 17 casos del gate real.
- `src/features/orders/events/service.test.tsx`: transporte productivo y logout.
- `src/lib/firebase.test.ts`: dos casos del gate foreground productivo, SDK mock.
- `.env.example`: flag productivo apagado y advertencia de build/rollback.
- `docs/order-events-production.md`, `docs/order-events.md`,
  `docs/order-alerts.md`, `docs/firebase-e2e.md`: documentación de gates/aislamiento.
- Este informe.

Sin cambios de contratos, dependencias, UI ni opt-out Firebase:
`DEV && MODE=e2e && VITE_E2E_DISABLE_PUSH=true` permanece intacto. El registro push
habitual/background permanece independiente del nuevo opt-in foreground.

## Verificaciones automatizadas ejecutadas

| Verificación                                             | Resultado                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| Tests relacionados: eventos, alertas, Firebase y bandeja | PASS: 228 tests, 14 archivos, cero fallos                   |
| Suite completa frontend                                  | PASS: 993 tests, 87 archivos, cero fallos                   |
| `pnpm type-check`                                        | PASS, salida 0                                              |
| `pnpm lint`                                              | PASS, salida 0; cero errores, una advertencia preexistente  |
| Prettier sobre archivos de esta fase                     | PASS                                                        |
| Dos builds mediante `pnpm run build`                     | PASS, salida 0; modo production                             |
| `git diff --check`                                       | PASS; avisos de conversión LF/CRLF, sin errores de espacios |

La advertencia de lint es `react-hooks/incompatible-library` en
`StarPromotionForm.tsx:101`; no se modificó ese archivo.

Comandos de tests:

```powershell
pnpm exec vitest run src/features/orders/events src/features/orders/alerts src/lib/firebase.test.ts src/features/orders/orders-tray.polling.test.tsx src/features/orders/PendingOrdersTray.test.tsx --configLoader runner --no-file-parallelism --reporter=json --outputFile=../phase7c1-related.json
pnpm exec vitest run --configLoader runner --no-file-parallelism --reporter=json --outputFile=../phase7c1-full.json
pnpm type-check
pnpm lint
pnpm run build --outDir ../.phase7c1/build-on
pnpm run build --outDir ../.phase7c1/build-off
git diff --check
```

Los builds recibieron variables únicamente del proceso, sin editar `.env`:
API `http://127.0.0.1:3001`, opt-in productivo `true`/`false`, flag de desarrollo
`false`/`true` respectivamente. Se sustituyó la configuración Firebase compilada
por valores inertes de testing. El flag de desarrollo no activó el build apagado.

## Integración real observada en Chrome

Se sirvieron archivos compilados en 5174 (on) y 5175 (off), sin Vite dev. Contextos
limpios separados; las dos pestañas on compartieron origen y sesión de testing.
Backend temporal en 3001 con AppModule real, autenticación y validaciones reales,
SSE habilitado y listener direct. PostgreSQL local 17.11, base nueva, no Supabase.

| Escenario                                           | Resultado y evidencia                                                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Login administrativo real                           | PASS: formulario y POST login 200; acceso dashboard/orders                                                                    |
| Conexión SSE                                        | PASS: GET events 200, `text/event-stream`, `stream.ready`                                                                     |
| Persistencia y heartbeats                           | PASS: 15 heartbeats reales observados en la primera pestaña durante la prueba                                                 |
| Pedido nuevo                                        | PASS: POST oficial 201, outbox cursor 1, `order.created`, bandeja 1, banner con referencia                                    |
| Activación y sonido                                 | PASS para intento: interacción MCP en Activar sonido y llamada real a `play()`; audibilidad NOT TESTED                        |
| Aceptación                                          | PASS: PATCH status con `confirmado`, 200; bandeja 0, tabla Confirmado                                                         |
| Cambio entre pestañas                               | PASS: `order.status_changed`, cursor 2, estado confirmado en ambas; sin otro sonido                                           |
| Cancelación y reconexión                            | PASS: cancelación controlada del reader, reconexión automática 200 con Last-Event-ID 2                                        |
| Replay                                              | PASS: segundo pedido cursor 3 recuperado; REST/bandeja actualizados sin banner nuevo ni sonido                                |
| Recarga                                             | PASS: cursor durable 3, estado conservado y sin alertas históricas                                                            |
| Dos pestañas con sonido activado                    | PASS: tercer pedido cursor 4, un solo play adicional entre ambas; un stream activo coordinado                                 |
| Build apagado                                       | PASS: cero solicitudes SSE; bandeja y tabla REST, polling repetido a 30 segundos, contador actualizado a 2                    |
| Logout                                              | PASS en variante on: ambas pestañas pasan a login, streams 0, recursos de audio liberados                                     |
| Firebase durante ejecución                          | PASS para aislamiento: cero tráfico externo observado, cero registros workers; registro Firebase impedido antes del bootstrap |
| Console                                             | PASS: sin errores/warnings en la pestaña principal al comprobar antes de logout                                               |
| `stream.reset` y expiración                         | NOT TESTED E2E en esta fase; cubiertos por suite automatizada, no equivalen a evidencia productiva                            |
| FCM real, audio audible, infraestructura productiva | NOT TESTED                                                                                                                    |

La base final contiene tres pedidos exclusivamente de testing, uno confirmado y
dos pendientes. Se observaron cuatro filas outbox y los mismos cuatro eventos en
el flujo SSE. Se utilizó la implementación real de listener; no se obtuvo una traza
independiente del protocolo PostgreSQL NOTIFY.

Firebase se aisló exclusivamente en el harness: Notification ausente antes del
bootstrap, bloqueo de workers, fetch/XHR de tokens y destinos externos, CSP local.
No se cambió el bundle para lograrlo ni se extendió el opt-out E2E a producción.
Esto valida SSE sin Firebase; no demuestra entrega FCM productiva.

## Recursos y limpieza

Las bases se prepararon con el runner oficial `scripts/e2e-local.cjs prepare`, que
rechaza reutilizar bases existentes. Se aplicaron 28 migraciones en cada base nueva.
Administrador creado mediante AuthService.register (hash real) y UsersService para
el rol admin, únicamente en testing. Contraseña aleatoria de 32 caracteres y tokens
solo en memoria del harness; no publicados ni guardados en archivos.

Permanecen, sin borrado autorizado:

- `celtas_e2e_test_phase7c1_5e8e8bcbb6`: primer intento, fixtures parciales; sin pedidos.
- `celtas_e2e_test_phase7c1_f4481fdd05`: prueba completa, administrador y tres pedidos.
- `.phase7c1/`: harness local, metadata no sensible y dos builds.
- `phase7c1-related.json` y `phase7c1-full.json`: resultados automatizados.

El primer intento corrigió un fixture temporal de horario (`closed` según contrato,
no `enabled`), sin cambios de backend. Los procesos temporales terminaron; se comprobó
que 3001, 5174 y 5175 dejaron de responder. Las tres pestañas nuevas se cerraron y la
pestaña original se preservó. No se eliminó ninguna base.

## Pendientes para producción

Se resuelve P01 del frontend. Antes de activar siguen pendientes: migraciones
productivas y posibles migraciones ajenas, backup/restore verificado, conexión
Supabase compatible con LISTEN/NOTIFY (sin transaction pooling para el listener),
límites y retención, CORS, timeouts/proxies Render, capacidad y métricas, y rollback
coordinado. Firebase foreground/background y sonido requieren validación autorizada
en navegadores y entorno adecuados; notificaciones de sistema no comparten el ledger
del panel. Nada de esto se confirmó en producción durante esta fase.

Puede avanzarse a planificación de 7C.2 con autorización; no a activación automática.
