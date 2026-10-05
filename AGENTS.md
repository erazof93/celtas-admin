# Trabajo en celtas-admin

Panel administrativo de Celtas: SPA React 19, TypeScript 6 y Vite 8; Tailwind 4,
componentes Radix/shadcn, TanStack Query, Zustand y React Hook Form + Zod.
Usa **pnpm** y conserva la organización por features de `src/features/`.

## Reglas comunes

- Preserva el comportamiento del frontend, sus estados de UI y sus contratos.
  Reutiliza los componentes, hooks y utilidades existentes; evita capas,
  dependencias, skills o agentes sin una necesidad concreta.
- Resuelve discrepancias con código implementado, package/lock/configuración,
  integración real con `../backend-celtas`, tests, Swagger actual y después
  documentación vigente e histórica. No adaptes código a documentos antiguos.
  No modifiques el backend hermano sin autorización.
- Para cambios de API confirma método, DTO, respuesta y errores con los tipos y
  el backend real. Swagger tiene gaps de respuestas y el snapshot generado puede
  estar atrasado; los contratos manuales de las features tienen una justificación.
  **No edites manualmente `src/types/api.d.ts`**. Regenerarlo es una tarea separada
  que escribe archivos y requiere revisar el diff; no es un paso automático.
- Las llamadas al backend pasan por `src/lib/api-client.ts` y los hooks de cada
  feature. La URL procede de `VITE_API_BASE_URL`. Respeta los DTOs: no envíes
  campos extra ni identificadores del path en el body salvo que el DTO los admita.
- El access token vive en memoria (Zustand); solo el refresh token se persiste
  en localStorage. Mantén bootstrap, refresh y manejo de errores coherentes con
  el cliente existente; no cambies esta decisión de sesión incidentalmente.
- Fechas de negocio en `America/Lima`. Distingue días `YYYY-MM-DD` de instantes;
  conserva snapshots históricos, semántica de `null`/`[]` y totales del backend.
- Verifica proporcionalmente al cambio: pruebas relevantes para lógica o
  regresiones, contratos y UI cuando corresponda. No inventes resultados ni
  presentes evidencia histórica como una ejecución actual. Informa lo no verificado.
- `pnpm run format` escribe; `generate:types` consulta el backend y sobrescribe
  tipos; `type-check` (`tsc -b`) escribe `.tsbuildinfo`; `build` escribe además
  `dist/`. Dev y tests pueden crear cachés. Elige los comandos según el alcance
  autorizado, no los ejecutes automáticamente en tareas de solo lectura.
- No hagas E2E con efectos sobre producción sin autorización. Operaciones como
  pedidos, campañas, cambios de rol/configuración y registro FCM tienen efectos
  reales. No publiques secretos ni valores privados de `.env`.
- No hagas `git add`, commit, push ni deploy sin solicitud explícita.

## Consulta bajo demanda

- Instalación y comandos: [README.md](README.md).
- Rutas, estado, formularios y UI: [arquitectura](docs/architecture.md).
- Auth, contratos, tipos y servicios: [integración](docs/backend-integration.md).
- Pedidos, opciones, campañas, fechas y confirmaciones: [reglas de negocio](docs/business-rules.md).
- Verificación y efectos de comandos: [checklist](docs/testing-checklist.md).
- Pendientes y prioridades actuales: [ROADMAP.md](ROADMAP.md), cuando la tarea lo requiera.
- Investigar regresiones anteriores: [historial](docs/history/legacy-development.md),
  sin autoridad operativa. No leas todo el roadmap o `docs/` antes de cada tarea.
