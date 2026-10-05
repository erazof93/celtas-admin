# celtas-admin

Panel web administrativo de Celtas para gestionar menú, pedidos, clientes,
cupones, banners, estrellas, marketing y configuración del negocio. Consume
el backend NestJS de `../backend-celtas`; no incluye servidor ni app de clientes.

## Stack y requisitos

React 19, TypeScript 6, Vite 8, Tailwind 4 y componentes Radix/shadcn.
TanStack Query para datos remotos, Zustand para sesión y React Hook Form + Zod
para formularios. Vitest + Testing Library + jsdom para pruebas.

Usar Node.js 24 compatible con el tooling actual y pnpm. El repositorio no fija
`engines` ni versión de pnpm; `pnpm-lock.yaml` usa formato 9. Vite 8 requiere
Node compatible (`^20.19.0 || >=22.12.0`), pero jsdom y los scripts CDP tienen
requisitos adicionales: Node 24 evita usar ese mínimo como requisito suficiente.

## Instalación y ejecución

```sh
pnpm install --frozen-lockfile
```

Copia `.env.example` a `.env` y ajusta el entorno. La instalación y esta copia
escriben archivos. Usa un backend de pruebas para operaciones con efectos;
el ejemplo de URL apunta a producción. El panel requiere una cuenta con rol
`admin`, provisionada fuera de este frontend.

```sh
pnpm run dev
```

Vite muestra la URL/puerto efectivo. Debe estar permitido por CORS del backend.
El login utiliza email/password; no hay registro ni login Google.

## Variables de entorno

Referencia: `.env.example`. No introducir secretos de servidor en `VITE_*`:
Vite los incorpora al código servido al navegador. No publicar `.env`.

| Variable                            | Uso                                                   |
| ----------------------------------- | ----------------------------------------------------- |
| `VITE_API_BASE_URL`                 | URL del backend; configurar explícitamente el entorno |
| `VITE_GEOAPIFY_API_KEY`             | Autocomplete y mapas Geoapify                         |
| `VITE_FIREBASE_API_KEY`             | Configuración del cliente Firebase                    |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Dominio Firebase Auth del proyecto                    |
| `VITE_FIREBASE_PROJECT_ID`          | Proyecto Firebase                                     |
| `VITE_FIREBASE_STORAGE_BUCKET`      | Bucket Firebase                                       |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender de Cloud Messaging                             |
| `VITE_FIREBASE_APP_ID`              | App web Firebase                                      |
| `VITE_FIREBASE_VAPID_KEY`           | Certificado Web Push; sin él se omite registro FCM    |

Las claves/configuraciones se obtienen del proyecto autorizado; no crear
proyectos Firebase ni credenciales nuevas solo para levantar el panel.
No hay validación ambiental central; ciertas integraciones fallan de forma
best-effort. Tras cambiar `VITE_*`, reiniciar dev o reconstruir el artefacto.

## Comandos

| Comando                   | Resultado y efectos                                              |
| ------------------------- | ---------------------------------------------------------------- |
| `pnpm run dev`            | Servidor local; puede generar cachés y llamar a servicios reales |
| `pnpm run lint`           | ESLint sin `--fix` ni caché; verifica sin corregir               |
| `pnpm run test`           | Vitest una vez; mocks/jsdom, puede escribir cachés               |
| `pnpm run test:watch`     | Vitest watch; puede escribir cachés                              |
| `pnpm run type-check`     | `tsc -b`; escribe `.tsbuildinfo` en `node_modules/.tmp/`         |
| `pnpm run build`          | TypeScript + Vite; escribe buildinfo y `dist/`                   |
| `pnpm run preview`        | Sirve `dist/` existente; la app puede llamar al backend          |
| `pnpm run format`         | **Reescribe** archivos con Prettier                              |
| `pnpm run generate:types` | Consulta Swagger y **sobrescribe** `src/types/api.d.ts`          |

Para formato sin escritura: `pnpm exec prettier --check <rutas>`. No editar
manualmente los tipos generados. Swagger tiene gaps y el snapshot actual está
atrasado para cupones automáticos; consultar integración antes de regenerar.
Los scripts E2E de `scripts/` tienen dependencias de navegador/servicios y efectos
reales; no son parte automática de una verificación inocua.

## Estructura y documentación

```text
src/
  features/       páginas, hooks, tipos, utilidades y tests por negocio
  components/ui/ componentes compartidos
  layouts/       layout administrativo
  routes/        router y protección
  lib/           cliente API, fechas, mapas y servicios comunes
  test/          setup de Vitest
  types/api.d.ts snapshot OpenAPI generado
public/          assets y service worker Firebase
scripts/         generación de tipos y E2E CDP
docs/            documentación especializada e historial
```

- [AGENTS.md](AGENTS.md): contexto mínimo para trabajar con Codex.
- [ROADMAP.md](ROADMAP.md): estado actual, deuda y próximas decisiones.
- [Arquitectura](docs/architecture.md): rutas, features, estado, formularios y UI.
- [Integración](docs/backend-integration.md): API, auth, contratos y servicios.
- [Reglas de negocio](docs/business-rules.md): invariantes y acciones sensibles.
- [Verificación](docs/testing-checklist.md): qué comprobar y efectos de comandos.
- [Historial](docs/history/legacy-development.md): investigación de regresiones;
  sin autoridad operativa ni resultados actuales.
