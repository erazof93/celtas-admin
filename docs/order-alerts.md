# Alertas de pedidos en desarrollo local

Para habilitarlas en un build productivo se requiere el opt-in explícito compartido
con SSE; consultar [Opt-in productivo](order-events-production.md).

En desarrollo se montan en `AdminLayout` cuando `DEV` y la API apunta a localhost.
Producción conserva su comportamiento habitual si el nuevo opt-in está apagado.
No abren otra conexión SSE.

La reconciliación SSE entrega `order.created` después de REST y de confirmar el
cursor durable. Solo los cursores posteriores al head de `stream.ready` son
candidatos; replay, gaps y `stream.reset` recuperan datos silenciosamente.
También se invalidan las claves `dashboard` en ventanas de 500 ms.

FCM en primer plano usa el registro existente. Valida UUID y estado pendiente,
consulta el detalle REST y confirma que fue creado después del inicio de la
sesión actual. No muestra texto del proveedor. El opt-out E2E se aplica antes de
inicializar Firebase. El listener se elimina al abortar el registro/logout.

Las dos fuentes comparten un ledger local por API y administrador, protegido
por Web Locks y difundido por BroadcastChannel. Conserva como máximo 512 UUID
durante 24 horas; se depura al iniciar sesión y recibir nuevos pedidos. Sin estas
APIs o almacenamiento válido, los avisos son locales y el sonido se deshabilita.

Activar sonido reproduce una muestra mediante un gesto explícito. Hay silencio y
volumen; autoplay rechazado muestra cómo reactivarlo. Se usa audio WAV nativo
de 0,38 segundos, sin permisos de notificación. Ráfagas separadas por menos de
450 ms comparten una campanilla; cada pedido conserva su aviso visual.
Logout libera audio, listeners, canales, timers y peticiones pendientes.

## Límites

- La deduplicación es acotada: UUID antiguos o expulsados del ledger podrían
  volver a admitirse si una fuente los presenta como nuevos.
- Un cierre abrupto entre reclamar y reproducir puede perder la campanilla;
  no existe una transacción entre localStorage y el dispositivo de audio.
- FCM no contiene cursor ni timestamp: la frescura depende del reloj local y
  `createdAt` REST. Fallos REST se delegan a SSE/polling; FCM es best-effort.
- No se unifican las notificaciones FCM del service worker en segundo plano con
  los avisos del layout. Esto requeriría un contrato adicional con el worker.
- La reproducción audible debe verificarse con una persona; resolver `play()`
  solo confirma que el navegador aceptó reproducir el medio.

Pruebas locales: `pnpm exec vitest run src/features/orders/alerts
src/features/orders/events src/lib/firebase.test.ts --configLoader runner`.
Mantener `VITE_E2E_DISABLE_PUSH=true` en modo e2e; nunca registrar dispositivos
en Firebase habitual para comprobar estas alertas.
