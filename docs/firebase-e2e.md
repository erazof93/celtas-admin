# Firebase durante E2E locales

Para aislar push sin afectar el desarrollo habitual, inicia Vite en modo
`e2e` y utiliza un contexto nuevo de navegador (sin service workers previos).
Un worker Firebase registrado anteriormente puede seguir funcionando aunque
la página nueva no inicialice Firebase; no reutilices ese perfil para E2E.

Configura `.env.e2e.local`, ignorado por Git:

```dotenv
VITE_API_BASE_URL=http://localhost:3000
VITE_ORDER_EVENTS_ENABLED=true
VITE_E2E_DISABLE_PUSH=true
```

Ajusta la URL al backend aislado de pruebas antes de autenticarte o escribir
datos. No añadas credenciales a este archivo.

```sh
pnpm exec vite --mode e2e --host 127.0.0.1 --port 5174 --strictPort
```

El opt-out exige simultáneamente `DEV`, modo `e2e` y valor literal `true`.
Impide inicializar Firebase, pedir permiso, registrar el service worker,
obtener/eliminar tokens y actualizar/eliminar el token en el backend. Conserva
la metadata local compartida de sesión y su revocación, utilizadas por SSE.
El desarrollo habitual y los builds de producción conservan push habilitado.

Para probar un artefacto productivo, este opt-out no se amplía: usar aislamiento
explícito del navegador/harness instalado antes del bootstrap, proveedores inertes
y bloqueo externo, como indica [Opt-in productivo](order-events-production.md).
Ese aislamiento no forma parte del bundle ni permite deshabilitar Firebase en
un entorno productivo.

No elimina instalaciones remotas ni workers existentes. Su revisión y limpieza
requieren identificar exclusivamente los recursos de prueba y autorización.
