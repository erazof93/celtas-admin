# Validación 7A.4 — bandeja de pedidos

Ejecución local del 9 de octubre de 2026. No se cambiaron backend, app,
contratos, archivos de entorno, secretos de producción ni lógica de la interfaz.

## Tests y permisos

Se reprodujeron los tres fallos de `orders.polling.test.tsx`:

1. `TestingLibraryElementError: Unable to find an element with the text: #AAAAAAAA.`
2. `AssertionError: expected "vi.fn()" to be called 1 times, but got 3 times`.
3. `AssertionError: expected "vi.fn()" to be called 2 times, but got 6 times`.

El mock no distingue las consultas de tabla y bandeja: su respuesta única de
una fila declara dos páginas/20 pedidos. La bandeja consume la primera respuesta,
intenta la siguiente página y rechaza el conjunto inconsistente. La tabla recibe
la respuesta siguiente. Los contadores mezclan ambas consultas.

La suite completa encontró además 16 fallos en
`orders.polling.integration.test.tsx`. Sus aserciones cuentan GET /orders sin
distinguir params; varios selectores buscan referencias en todo el documento y
ahora encuentran tanto la tarjeta como la fila. Los errores incluyen
`expected 2 to be 1`, `expected 4 to be 2` y
`Found multiple elements with the text: #AAAAAAAA`.

Corrección necesaria cuando se permita editar: fixtures con meta consistente,
respuesta según página/limit/status, contar solicitudes por contrato de cada
vista y buscar referencias dentro de la tabla o tarjeta correspondiente.
Conservar las aserciones de autorización, cancelación, refresh y ausencia de
solapamiento; no sustituirlas por contadores globales permisivos.

Ambos archivos siguen BLOCKED para escritura:

- Atributos Archive; IsReadOnly=false.
- Propietario DESKTOP-LOQ761F\CodexSandboxOffline, igual que el test de control.
- ACL heredadas incluyen Modify para CodexSandboxUsers y usuarios autenticados.
- `fs.openSync(path, 'r+')` devuelve EPERM; el test de control sí abre en r+.
- Git no muestra modificaciones en esos archivos.
- No hay handle.exe disponible. WMI devuelve Acceso denegado, HRESULT 0x80041003;
  no se pudo atribuir el bloqueo a un proceso. Las ACL no explican por sí solas
  el rechazo; no se afirma una causa externa concreta sin evidencia.
- No se cambiaron ACL, propietario, Defender ni privilegios, ni se reemplazaron
  los archivos para eludir la restricción.

Se añadió `orders-tray.polling.test.tsx` con tres comprobaciones complementarias:
una consulta por vista cada 30 s, desmontaje y retorno sin peticiones extra,
y dos 403 compartiendo una sola reconciliación de rol y deteniendo ambos pollers.
Usa Axios real con adapter simulado y consultas reales de TanStack; no mockea la
bandeja. Los tres casos pasan. No reemplaza los archivos bloqueados.

TypeScript y formato PASS. Lint PASS con la advertencia existente de
React Hook Form en StarPromotionForm. Los 248 tests pertinentes pasan.
La suite completa final terminó 954 PASS / 19 FAIL (973 tests, 86 archivos).
Solo fallan los dos archivos de polling bloqueados. El reporte JSON queda fuera
del repositorio en `../phase7a4-frontend-full.json`.

## E2E real

Base nueva `celtas_e2e_test_phase7a4_20261009_a4b7`, preparada por
`backend-celtas/scripts/e2e-local.cjs prepare`. El mecanismo rechazó reutilizar
bases existentes, aplicó 28 migraciones y confirmó marca descartable/tablas de
negocio vacías antes de crear fixtures. Backend temporal 127.0.0.1:3001, SSE=true,
listener=direct, secretos JWT efímeros y proveedores inertes. Vite 5174 en modo
e2e con push deshabilitado por variables de su proceso, sin editar .env.

Dos administradores se crearon con AuthService.register (bcrypt real) y
UsersService.updateRole. El login de un administrador se hizo por el formulario
real en Chrome limpio; las dos pestañas comparten esa sesión. Las contraseñas se
generaron aleatoriamente en memoria y no se guardaron ni imprimieron.

PASS: pedido creado por POST /orders/admin, bandeja/contador/aviso, GET SSE 200
text/event-stream, stream.ready y siete heartbeats, PATCH confirmado 200,
retiro de la bandeja, permanencia en tabla y actualización de pestaña follower.
La aceptación competidora produjo un 400 real y recuperación REST consistente.
Una falla de red inyectada en el adapter conservó el pedido pendiente, confirmado
por REST real: esta falla usa simulación local, no es un 500 real del backend.

Audio: play aceptado tras clic; cuatro llamadas (muestra + tres pedidos nuevos),
ninguna adicional por aceptación y ninguna tras recarga. Audio audible NOT TESTED.
La recarga restauró autenticación, dos confirmados y un pendiente, sin avisos
históricos. Cero apps Firebase, tráfico Installations/FCM, operaciones de tokens,
permisos solicitados o workers registrados. Logout llevó ambas pestañas a login.

Evidencia no sensible fuera del repositorio:
`../phase7a4-browser-evidence.json`, `../phase7a4-database-evidence.json` y
`../phase7a4-polling-integration-results.json`.

Se cerraron las pestañas, Vite y el backend temporal y se eliminaron los scripts
auxiliares. La base se conserva: dos administradores de testing, catálogo mínimo,
tres pedidos, cinco eventos de outbox y settings de testing. No se alteró ni
eliminó celtas_db ni ninguna base preexistente.
