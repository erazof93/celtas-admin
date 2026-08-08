# 🪓 Celtas Admin — Roadmap de desarrollo

Panel administrativo en **React + Vite + TypeScript** que consume el backend NestJS ya desplegado
en `https://backend-celtas.onrender.com`. Este documento es la fuente de verdad del progreso,
igual que el `ROADMAP.md` del backend: se trabaja **módulo por módulo**, cada uno auditado por
`@tester` antes de marcarlo completo.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Build tool | Vite |
| Framework | React 18 + TypeScript |
| Gestor de paquetes | **pnpm** |
| Estilos | Tailwind CSS |
| Componentes UI | shadcn/ui (Radix + Tailwind, se instalan bajo demanda, no un paquete monolítico) |
| Routing | React Router v6 |
| Data fetching / cache | TanStack Query (React Query) |
| Cliente HTTP | Axios (instancia única con interceptores) |
| Estado de auth | Zustand (liviano, sin boilerplate de Redux) |
| Formularios | React Hook Form + Zod |
| Gráficas del dashboard | Recharts |
| Fechas | date-fns |
| Tipos de la API | Generados automáticamente desde `/docs-json` con `openapi-typescript` — **nunca escritos a mano** |
| Deploy | Vercel o Netlify (free tier) — se decide en el módulo 10 |

## Backend que consume

```
Base URL (prod):  https://backend-celtas.onrender.com
Swagger UI:       https://backend-celtas.onrender.com/docs
Swagger JSON:     https://backend-celtas.onrender.com/docs-json
```

**Regla del proyecto**: antes de construir cualquier pantalla que hable con la API, `opencode`
debe revisar `/docs-json` (o `/docs` si necesita ver ejemplos) para confirmar el contrato exacto
—método, path, body, response, códigos de error— en vez de asumir la forma de los datos. El
backend ya está auditado y estable; la fuente de verdad de sus contratos es Swagger, no la memoria
del agente.

---

## Convenciones del proyecto

- Estructura por *features* (no por tipo de archivo): cada dominio de negocio (`auth`, `menu`,
  `orders`, `coupons`, `banners`, `settings`, `users`, `dashboard`) vive en su propia carpeta bajo
  `src/features/`, con sus propios componentes, hooks de React Query y tipos locales.
- Un solo cliente Axios (`src/lib/api-client.ts`) con interceptor de request (agrega el JWT) y de
  response (maneja 401 refrescando el token, y solo si el refresh también falla, desloguea).
- Cada recurso de la API tiene su propio archivo de hooks de React Query
  (`src/features/menu/hooks.ts` con `useMenuItems`, `useCreateMenuItem`, etc.) — los componentes
  nunca llaman a Axios directo.
- Formularios con React Hook Form + Zod, el schema de Zod validado en el cliente debe ser
  consistente con las reglas del DTO del backend (revisar Swagger para los límites exactos).
- Paginación: los componentes de listado respetan el mismo esquema de paginación que ya expone
  el backend (`GET /users`, `GET /orders`, `GET /coupons`, `GET /banners` son todos paginados).
- Fechas mostradas en zona horaria de Lima (`America/Lima`), igual que el backend (recuerda el
  dashboard: `revenue` se agrupa por `deliveredAt` en Lima, no UTC).
- Paleta de colores (del logo de Celtas): negro `#0D0D0D`, naranja `#E8590C`, rojo `#C1121F`,
  dorado `#FFB800`, blanco hueso `#F5F1E8` — configurados como tokens de Tailwind, no hardcodeados
  en cada componente.
- El panel admin **solo soporta login tradicional** (email + password) — no hay botón de Google
  aquí, eso es exclusivo de la app cliente en Flutter.

---

## Estructura de carpetas

```
celtas-admin/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/
│   │   ├── router.tsx              # definición de rutas + guard de auth
│   │   └── ProtectedRoute.tsx
│   ├── layouts/
│   │   └── AdminLayout.tsx         # sidebar + topbar, envuelve las páginas autenticadas
│   ├── lib/
│   │   ├── api-client.ts           # instancia de Axios + interceptores
│   │   ├── query-client.ts         # instancia de TanStack Query
│   │   └── utils.ts
│   ├── types/
│   │   └── api.d.ts                # GENERADO desde /docs-json, no editar a mano
│   ├── features/
│   │   ├── auth/
│   │   │   ├── store.ts            # Zustand: accessToken en memoria, user actual
│   │   │   ├── hooks.ts
│   │   │   └── LoginPage.tsx
│   │   ├── dashboard/
│   │   ├── menu/
│   │   │   ├── categories/
│   │   │   └── items/
│   │   ├── orders/
│   │   ├── coupons/
│   │   ├── banners/
│   │   ├── settings/
│   │   └── users/
│   └── components/
│       └── ui/                     # componentes shadcn instalados
├── public/
├── .env.example
├── .opencode/
│   ├── agents/
│   │   ├── celtas-admin.md
│   │   └── tester.md
│   └── skills/
│       └── react-celtas/
│           └── SKILL.md
├── opencode.json
├── ROADMAP.md
├── package.json
└── tsconfig.json
```

---

## Checklist por módulos

### 0. Setup inicial
- [ ] Crear proyecto: `pnpm create vite celtas-admin -- --template react-ts`
- [ ] Instalar y configurar Tailwind CSS con la paleta de colores del proyecto
- [ ] Instalar shadcn/ui (`pnpm dlx shadcn@latest init`) — tema dark por defecto, acorde a la
      identidad de marca (fondo negro, acentos naranja/dorado)
- [ ] ESLint + Prettier configurados
- [ ] Instalar: `react-router-dom`, `@tanstack/react-query`, `axios`, `zustand`,
      `react-hook-form`, `zod`, `@hookform/resolvers`, `recharts`, `date-fns`
- [ ] `.env` / `.env.example` con `VITE_API_BASE_URL=https://backend-celtas.onrender.com`
      (y una nota de cómo apuntar a `http://localhost:3000` para desarrollar contra el backend local)
- [ ] Generar tipos desde Swagger: `pnpm dlx openapi-typescript https://backend-celtas.onrender.com/docs-json -o src/types/api.d.ts`
      — agregar un script `pnpm run generate:types` para repetirlo cuando el backend cambie
- [ ] `api-client.ts`: instancia de Axios con `baseURL` desde env, interceptor de request (header
      `Authorization`) e interceptor de response (401 → intenta refresh una vez → si falla, logout)
- [ ] Estructura de carpetas base creada según el diagrama de este documento
- [ ] `pnpm run dev` corre limpio, con el layout base (aunque esté vacío) visible en pantalla

### 1. Auth
- [x] `LoginPage`: formulario email/password con React Hook Form + Zod, consumiendo `POST /auth/login`
- [x] Store de Zustand: `accessToken` en memoria (nunca en localStorage), `refreshToken` en
      localStorage (trade-off aceptado para un panel interno, documentado en la skill), `user` actual
- [x] Interceptor de Axios usa el store para adjuntar el token y disparar el refresh en 401
- [x] `ProtectedRoute`: redirige a `/login` si no hay sesión; además verifica `role: admin` — si
  un `cliente` intenta entrar (no debería poder, pero por si acaso), lo rechaza con un mensaje
  claro, no lo deja pasar silenciosamente
- [x] Logout: limpia el store y el localStorage, redirige a `/login`
- [x] Persistencia de sesión al recargar la página (usa el refresh token guardado para pedir un
  access token nuevo al cargar la app, antes de decidir si mostrar login o el panel)

### 2. Layout base
- [x] `AdminLayout`: sidebar con navegación a todos los módulos (Dashboard, Menú, Pedidos,
      Cupones, Banners, Configuración, Usuarios) + topbar con el nombre del admin logueado y logout
- [x] Sidebar responsive (colapsable en pantallas chicas — el admin puede necesitar usarlo desde
      un celular/tablet en el local)
- [x] Estados de carga y error genéricos reutilizables (spinner, mensaje de error con retry)

### 3. Dashboard
- [ ] Consume `GET /admin/dashboard/summary` y `GET /admin/dashboard/top-products`
- [ ] Selector de rango de fechas (default: hoy, según ya calcula el backend)
- [ ] Tarjetas de resumen: pedidos del día, ventas, desglose por estado
- [ ] Gráfica de productos más vendidos (Recharts)

### 4. Menú (categorías + productos)
- [ ] CRUD de categorías
- [ ] CRUD de productos, con subida de imagen (consume `POST /menu/items/:id/image`)
- [ ] Toggle de disponibilidad rápido desde la lista (sin entrar a editar)
- [ ] Manejo del 409 de nombre duplicado con mensaje claro en el formulario, no un error genérico

### 5. Pedidos
- [ ] Listado paginado, filtro por estado
- [ ] Vista de detalle de un pedido (items, dirección, link de WhatsApp)
- [ ] Cambio de estado con los botones/acciones válidas según la transición (no mostrar botones
      de transiciones inválidas, ej. no ofrecer "entregado" si sigue en "pendiente")

### 6. Cupones
- [ ] Listado paginado, filtro por status
- [ ] Formulario de generación manual (campaña), respetando el límite de 100% en `percentage`
- [ ] Ver cupones de un usuario específico

### 7. Banners
- [ ] CRUD con subida de imagen
- [ ] Selector de fechas de vigencia (startDate/endDate)
- [ ] Reordenamiento drag-and-drop (consume `PATCH /banners/reorder`)

### 8. Configuración (Settings)
- [ ] Editor del número de WhatsApp (`GET`/`PATCH /settings`)
- [ ] Gestión de roles de usuario (`PATCH /users/:id/role`) — con confirmación antes de degradar
      o promover a alguien, y el caso de "no puedes quitarte tu propio admin" reflejado en la UI
      (deshabilitar esa opción para el propio usuario logueado, no solo esperar el 400 del backend)

### 9. Usuarios (listado admin)
- [ ] Listado paginado de `GET /users`
- [ ] Ver perfil, direcciones y pedidos de un usuario específico

### 10. Deploy y Calidad
- [ ] Pase de auditoría general (similar al módulo 10 del backend): tipos sin `any` sueltos,
      estados de carga/error en todas las pantallas, accesibilidad básica (labels, contraste)
- [ ] Deploy en Vercel o Netlify (free tier), variables de entorno de producción
- [ ] Verificación end-to-end manual contra el backend real de producción

---

## Cómo trabajar con OpenCode

1. Abre el repo y ejecuta `opencode` en la raíz.
2. Usa el agente **`celtas-admin`** (Tab para cambiar de agente si es necesario).
3. Antes de construir cualquier pantalla nueva, el agente debe confirmar el contrato exacto del
   endpoint correspondiente contra `https://backend-celtas.onrender.com/docs-json` (o los tipos ya
   generados en `src/types/api.d.ts`), no asumir la forma de los datos.
4. Al terminar cada módulo, invoca a **`@tester`** para que lo audite (type-check, lint, tests de
   componentes, checklist de `docs/testing-checklist.md`). Solo se marca un módulo como completo
   en este checklist cuando `@tester` da veredicto **LISTO**.
5. La skill `react-celtas` se carga automáticamente al trabajar en componentes, hooks o llamadas a
   la API — ahí están las convenciones específicas del proyecto.
