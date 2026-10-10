# SSE de pedidos: integración local, Fase 4

La preparación productiva posterior usa un opt-in separado. Las restricciones
locales de esta fase se conservan en desarrollo; para builds productivos consultar
[Opt-in productivo](order-events-production.md).

SSE permanece apagado por defecto. Para activarlo localmente se necesitan
`VITE_ORDER_EVENTS_ENABLED=true`, Vite dev, API localhost/127.0.0.1/::1,
Web Locks, BroadcastChannel y generación compartida válida. Reiniciar Vite
tras cambiar variables. Sin el opt-in productivo separado, los builds de producción no abren SSE.
Sin coordinación no hay fallback de streams; REST y FCM conservan su flujo.
No editar variables de hosting para activarlo.

## Liderazgo y sesión

`AdminLayout` sigue usando `useOrderEvents`. El singleton de
`coordinated-service.ts` monta el runner de `service.ts` solo bajo liderazgo.
El estado observable distingue leader/follower/none y unavailable, y conserva
el estado sanitizado del transporte, fecha, base y contador de reintento.

El lock exclusivo `celtas-order-events:leader:v1:<API e identidad>` pertenece
al origen/partición del navegador. Diferentes administradores/API no comparten
lock. Las generaciones de una identidad sí comparten lock para evitar solapar
sesiones nuevas y antiguas. No se utiliza `celtas-push-installation`.

La generación compartida procede de la metadata existente de login/bootstrap
FCM, mediante el getter de solo lectura `capturePushSession()`. No se usan tokens
ni sessionId local como generación entre pestañas. El sessionId local también
cerca callbacks tardíos. Storage y un chequeo de 5s detectan revocación de metadata
compartida aunque el registro FCM no esté disponible.

Las seguidoras esperan en la cola nativa de Web Locks. El líder mantiene el lock
durante conexión y backoff. Renueva metadata cada 5s, con lease de 30s, y cede
voluntariamente cada 5 minutos. Reingresa a la cola tras 5s; las seguidoras en
espera pueden asumir inmediatamente. El sucesor hereda fecha, contador y base
del backoff. Los estados terminales bloquean esa generación en todas las pestañas,
incluidas las nuevas. No se expone aún reintento manual.

Logout marca sessionEnding antes de esperar FCM: aborta fetch/reader y libera
liderazgo. Pérdida de sesión, cambio de identidad/generación, offline y desmontaje
cancelan adquisiciones pendientes y liderazgo. Freeze/pagehide ceden;
resume/pageshow permiten volver a la cola. StrictMode cancela adquisiciones
antiguas antes de montar otra vez. No se usa steal ni elección agresiva.

## Distribución

BroadcastChannel v1 incluye API, identidad, generación, sender, term, secuencia
y fecha. El receptor valida esos campos contra la lease vigente, rechaza mensajes
propios, viejos (>30s), duplicados, de otra identidad/generación/term e inválidos.
Los eventos se revalidan contra SSE v1 y se proyectan a campos permitidos; también
se distribuye estado sanitizado. No se envían credenciales, cabeceras, pedidos
completos ni perfiles. URLs con userinfo/query/hash se rechazan.

Un mensaje o lease vencida nunca permite abrir SSE sin el lock real. El protocolo
no es una frontera de seguridad frente a scripts del mismo origen.
BroadcastChannel es best-effort: una pestaña nueva o señal retrasada tras sucesión
puede perder eventos. Cada pestaña recupera sus vistas por REST al ingresar a la
coordinación; ready, reset y señales posteriores también disparan recuperación.
La señal `position` transmite solo el cursor usado al abrir el transporte (o null).

## Cursores

`cursor-state.ts` guarda metadata v2 aislada por API e identidad, con generación
en el registro. Retiene como máximo 256 pares cursor/eventId, sin payloads.
Los cursores son strings canónicos, comparados con BigInt:

- observed: mayor cursor validado observado, incluso ante un eventId conflictivo.
- processed: último prefijo confirmado después de REST satisfactorio. Las seguidoras
  pueden confirmarlo en memoria; el registro restaurado contiene la confirmación
  previa del líder, y no sustituye la recuperación local de caché al ingresar.
- durable: posición confirmada por REST que solo persiste el dueño vigente del lock.
  La escritura rechaza retrocesos respecto a la posición almacenada. Es la única
  posición admitida en Last-Event-ID; observed nunca se envía como cursor de replay.

Los bytes recibidos no confirman procesamiento. Un ready sin posición previa
requiere REST antes de establecer headCursor como base. Con posición previa,
ready solo recupera vistas; no adelanta a headCursor. Los eventos consecutivos
del replay se confirman por lotes después de recuperar sus entidades. El backend
vigente asigna cursores contiguos bajo una transacción bloqueada; saltos, conflictos
cursor/eventId y desorden no confirmado invalidan la posición y fuerzan una conexión
nueva con el backoff vigente. Un replay de 100 eventos cabe en la cola de 256.
Duplicados ya confirmados no adelantan ni provocan otro GET de detalle.
La deduplicación observada de fases previas nunca omite un evento aún no confirmado.

Reset, logout y cambio de identidad/generación limpian la metadata correspondiente.
Una limpieza tardía no borra la generación nueva. Desmontar/cerrar una pestaña de
la misma sesión conserva el registro para sucesión. Registros inválidos o de otra
versión/generación se descartan. Si localStorage no permite escribir la lease,
SSE falla cerrado; el tracker por sí solo admite memoria acotada. La metadata v1
no se migra a una posición durable. La clave v2 separa la nueva semántica.

## Recuperación REST y garantía del cursor

`reconciliation.ts` mantiene una cola por pestaña, agrupa señales durante 100ms y
serializa lotes. GET /orders usa página, límite y filtros reales del DTO. Siempre
recupera página 1/límite 10, incluso fuera de /orders. Además recupera cada lista
activa de la sesión con sus propios filtros/paginación, sin duplicar parámetros
iguales. Invalida listas y detalles sin refetch implícito; las consultas inactivas
quedan stale. Recupera por GET /orders/:id cada ID afectado una vez por lote y los
detalles en caché de la sesión en recuperaciones completas. Ambas rutas retornan
items y user en el backend; PATCH continúa usando el merge existente.

No se enumeran todas las páginas históricas. Un durable significa que se recuperaron
las vistas activas y entidades identificadas hasta ese prefijo, y se invalidaron
las vistas que se consultarán después. No garantiza haber observado cada transición,
una foto transaccional entre respuestas REST, ni reconstrucción de historia perdida
por retención. Tampoco garantiza entrega de alertas en otras pestañas. REST devuelve
estado actual, sin watermark SSE, y puede incluir cambios posteriores al cursor.
Establecer base después de reset es una recuperación del estado actual con este
alcance, no la confirmación de eventos históricos que el servidor ya no conserva.

Los resultados se preparan antes de publicar caché. Solo se aplican con sesión,
generación, época y autorización vigentes, sin aborto. Las mutaciones de pedidos
tienen mutationKey y bloquean los lotes mientras están pendientes. Si una mutación
interviene o el polling cambia la caché durante los GET, el lote se repite sin
confirmar. Solo se cancelan lecturas sustituidas, nunca mutaciones. El polling
mantiene sus intervalos, filtros y política de errores.

El detalle abierto observa su query aislada por identidad/sessionId y conserva la
selección. Una respuesta REST más nueva actualiza la vista; no reemplaza datos
durante mutaciones pendientes. El diálogo conserva sus inputs de confirmación
locales; el backend sigue validando transiciones. Cambiar sesión o iniciar logout
oculta la selección, y callbacks antiguos de PATCH no la restauran.

Los fallos REST conservan trabajo sin avance processed/durable, con esperas de
2/4/8/16/32/60s. Axios resuelve 401 con su refresh compartido existente. Un 401
definitivo o 403 detiene la recuperación de esa generación; el callback de
autorización opera antes de la reconciliación de rol de Axios. Un 404 individual
confirma ausencia y limpia el detalle de caché (null). Offline suspende; volver
online recupera vistas. Los resets cursor_unavailable/replay_overflow invalidan
la posición; transport_unavailable/server_shutdown también la invalidan de forma
conservadora y reconectan con backoff. authorization_unavailable y access.revoked
detienen. Llegadas durante un lote quedan para el siguiente.
Ready/reset conservan los IDs pendientes conocidos para recuperarlos antes de
confirmar una nueva base. Se acotan a 256 IDs arrastrados y 256 señales pendientes;
si se agota esa capacidad, la instancia invalida la posición y suspende toda
confirmación durable. Ese límite no habilita el salto silencioso de un lote pendiente.
Las respuestas REST también deben superar comprobaciones mínimas de forma,
relaciones e identidad del detalle antes de confirmar.

Logout, desmontaje y pérdida de liderazgo abortan la recuperación antes de confirmar.
La espera REST también se desacopla ante abort aunque un proveedor ignore la señal;
sus respuestas tardías no llegan a caché. El sucesor recarga durable bajo el lock.
Cada seguidora recupera su propia caché y no escribe la confirmación compartida.
`getRecoverySnapshot()` expone estado y tamaño de cola, sin payloads ni credenciales.

## Transporte y política conservada

Fetch usa URL efectiva de Axios, Bearer, Accept y parser SSE, sin envelope REST.
Se conservan timeout de apertura 15s e inactividad 60s (heartbeat backend 20s),
backoff exponencial 5–60s con jitter 80–100%, y retry SSE limitado a 5–60s.
Solo un stream ready de al menos 60s reinicia fallos, nunca HTTP 200 por sí solo.

401 comparte refresh con Axios dentro de la pestaña y permite una reapertura;
un fallo temporal conserva sesión y aplica backoff. 403/access.revoked, 404,
protocolo inválido y otros 4xx definitivos detienen. 429 respeta Retry-After
(segundos/fecha, fallback 30s); 503 usa degraded y esperas 60/120/240/300s.
Auth.expiring reconecta con token vigente y renueva solo ante 401.
Stream.reset invalida posición y reconecta con backoff, salvo pérdida de autorización.
El flujo de refresh Axios, polling, service worker e instalación FCM no se modifica.

## Garantías, límites y rollback

Existe un único dueño lógico del lock por API/identidad/origen. Con transportes
conformes a AbortSignal, el aborto precede a la apertura del sucesor. El permiso
del lock no depende de esperar al transporte: un fetch/read/cancel que nunca
termine no bloquea la liberación. Se descartan sus callbacks y se cancela cualquier
respuesta tardía. No puede garantizarse que un transporte que ignore abort cierre
su socket físico; puede existir solapamiento residual en el servidor. No esperar
indefinidamente es una decisión explícita de disponibilidad.

Si el navegador notifica freeze/pagehide o cierra/descarta el contexto, hay sucesión.
Si el sistema congela completamente el proceso sin notificar/liberar Web Locks,
ningún timer JS puede forzar una sucesión segura mientras dure esa suspensión.
Al reanudarse, la lease vencida cerca eventos y el líder cede. No robar locks evita
abrir otro transporte mientras ese líder podría seguir vivo. Requiere validación
del ciclo de vida en navegador real.

No hay coordinación de refresh REST entre pestañas, alertas, sonido ni
deduplicación FCM. El cursor durable del líder no certifica la recuperación de
caché de cada seguidora; estas recuperan independientemente y no bloquean al líder.
Fase 5 debe definir entrega/deduplicación de alertas antes de apoyarse en ese cursor.
Los tests simulan locks/channels/fetch; no certifican CORS, buffering, cierre de
sockets ni suspensión real. El layout no usa eventos como estado definitivo.

Rollback local: apagar el flag y reiniciar Vite. No requiere migraciones ni cambios
de backend; polling y FCM permanecen disponibles.
