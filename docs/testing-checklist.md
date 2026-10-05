# Verificación proporcional al cambio

Checklist vigente, sin resultados históricos. No sustituye los DTOs ni demuestra
estado de producción. Evidencia anterior: [historial](history/legacy-development.md).

## Estrategia actual

Vitest 4 + Testing Library + jsdom, tests `*.test.ts(x)` junto a features/lib/UI;
setup en `src/test/setup.ts`. Importar APIs de Vitest explícitamente (sin globals).
Setup incluye cleanup, jest-dom y polyfills para APIs de UI; no convierte jsdom
en navegador con layout real. Se encontraron 60 archivos de tests al migrar,
no se ejecutaron para producir un nuevo conteo de casos.

Los unitarios cubren funciones, hooks mockeados y componentes. No verifican
por sí solos CORS, contratos desplegados, scroll, permisos Web Push, entrega a
dispositivos ni precios de servidor. Vitest normal transpila TypeScript; no
reemplaza typecheck ni valida todos los `expectTypeOf` del test de contrato.

No hay cobertura configurada, CI versionado ni Playwright/Cypress. Los scripts
`e2e-login.mjs` y `e2e-bootstrap.mjs` usan Chrome DevTools Protocol, navegador
con puerto 9222, app local (5173 por defecto), credenciales/servicios y esperas
fijas. Son utilidades con efectos reales y evidencia limitada, no una suite
con assertions robustas. No ejecutar E2E sobre producción sin autorización.

## Comandos y efectos

| Comando/operación                                            | Escritura                                             | Servicios externos                                    |
| ------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| `git status --short`, `git diff`, `git log`, inspección/hash | Solo lectura de trabajo; sin staging                  | No                                                    |
| `pnpm run lint`                                              | Sin `--fix` ni caché en script; solo verifica         | No                                                    |
| `pnpm exec prettier --check <rutas>`                         | Solo verifica formato                                 | No, si herramienta instalada                          |
| `pnpm run test -- <rutas>`                                   | Verifica, pero puede generar caché de Vitest/Vite     | Tests actuales usan mocks/jsdom; revisar nuevos tests |
| `pnpm run test:watch`                                        | Igual, proceso persistente                            | Según tests                                           |
| `pnpm run type-check`                                        | `.tsbuildinfo` en `node_modules/.tmp/`, aunque noEmit | No                                                    |
| `pnpm run build`                                             | Buildinfo y `dist/`                                   | No necesita backend para compilar                     |
| `pnpm run format`                                            | Reescribe archivos con Prettier                       | No                                                    |
| `pnpm run generate:types`                                    | Sobrescribe `src/types/api.d.ts`                      | Swagger del backend seleccionado                      |
| `pnpm install --frozen-lockfile`                             | `node_modules`/metadatos; lockfile no debe cambiar    | Registro de paquetes salvo caché suficiente           |
| `pnpm run dev`                                               | Puede generar cachés                                  | La aplicación sí llama API/Firebase/Geoapify          |
| `pnpm run preview`                                           | Sirve build existente; no compila                     | La aplicación sí llama servicios                      |
| Scripts E2E CDP                                              | Pueden cambiar datos, navegador y estado local        | Backend/navegador/Firebase/Geoapify según flujo       |

Con restricción estricta de no escritura, no ejecutar test/typecheck/build/dev
solo porque “verifican”. Para tareas documentales suelen bastar revisión,
formato en modo check, diff y hashes. No regenerar tipos para validar documentación.
No usar `format` para subsanar cambios ajenos al alcance.

## Qué verificar según el cambio

- **Documentación/configuración del agente:** contrastar afirmaciones, enlaces,
  nombres de comandos y efectos; revisar diff y comprobar integridad funcional.
- **Función de negocio:** casos normales, límites, null/vacío, redondeo y errores;
  prueba pequeña sobre lógica real. Una regresión debe distinguir conducta
  anterior y corregida, no repetir implementación en el test.
- **Hook/API:** método/path, body exacto sin extras, envelope/paginación,
  parámetros/query keys, errores y recursos que deben invalidarse. Contrastarlo
  con backend/tipos actuales, no aceptar mocks como prueba del contrato remoto.
- **Formulario/componente:** validación DTO, valores vacíos/coerción, estados de
  carga/error/vacío, errores por campo, pending/doble submit y confirmación;
  labels, teclado/foco y viewport cuando aplique.
- **Auth/infraestructura:** 401 concurrentes, cola/retry, bootstrap, refresh
  inválido vs transitorio, no persistir access token, roles y logout/FCM.
  La ausencia actual de esos tests es deuda; no afirmar cobertura inexistente.
- **Tipos/configuración/dependencias:** typecheck/lint/build según autorización;
  conocer que generan archivos. Revisar diff del lock/config si forman parte
  de una tarea autorizada, no cambiar dependencias para una tarea documental.

## Regresiones sensibles

1. Pedidos: transiciones, motivo requerido en camino, preservar items/user tras
   PATCH, anónimos null-safe, snapshots y tri-state sin sustituirlos por catálogo.
2. Pedido manual: cliente XOR anónimo, teléfono/cantidad/comentario, dirección
   JSON string, ajustes de pin, required con todas inactivas, allowWithout []
   explícito, bebidas gratuitas y precio real calculado por servidor.
3. Menú/banners: DTO sin id del path, relaciones inactivas conservadas,
   max null, fechas null para borrar, UUID de acciones y rollback de reorder.
4. Settings: medianoche, motivo antes del toggle, fallo parcial secuencial,
   tramos/location y queries de cotización después del cambio.
5. Cupones/campañas: porcentaje vs importe fijo, mínima 0→null, confirmaciones,
   PUT auto-config completo y mensajes 400 string/errores de campo.
6. Usuarios: cambio de usuario resetea datos locales, autodegradación protegida,
   bulk linking all-or-none y totalSpent absoluto sin doble acumulación.
7. Fechas/reportes: Lima, días sin shift UTC, deliveredAt, canal únicamente
   donde DTO lo acepta, error de comparación visible y cifras de servidor.
8. Navegador: scroll/footer de diálogos largos, mapa/tiles, refocus de autocomplete,
   clipboard fallback, notificaciones y mobile drawer. Unitarios no prueban layout.

## Criterios de cierre

- Cambios dentro del alcance; contratos/comportamiento preservados o cambios
  expresamente aprobados. Documentación actualizada solo cuando sea necesario.
- Informar comandos ejecutados, resultado real, entorno y limitaciones; no
  reciclar un resultado histórico ni certificar E2E mediante unitarios.
- Reportar fallos previos y pendientes relevantes; no marcar como verificado
  lo que no se ejecutó. Si un comando no se pudo usar, explicar impacto.
- Sin pruebas redundantes para cambios reversibles de bajo impacto. Para bugs
  de una misma clase, revisar otros sitios afectados dentro del alcance.
- Git diff final revisado; sin secretos ni modificaciones accidentales. Sin
  staging, commit, push o deploy salvo solicitud explícita.
