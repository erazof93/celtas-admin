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

### 0. Setup inicial — ✅ COMPLETO
- [x] Crear proyecto: `pnpm create vite celtas-admin -- --template react-ts` (React 19, TS, ESLint — el scaffold real trajo versiones más nuevas que las anotadas originalmente, todas compatibles)
- [x] Tailwind CSS con tokens `celtas-black/orange/red/gold/cream` (Tailwind v4)
- [x] shadcn/ui inicializado, tema dark
- [x] ESLint + Prettier configurados
- [x] Dependencias: `react-router-dom` (v7), `@tanstack/react-query`, `axios`, `zustand`, `react-hook-form`, `zod` (v4), `@hookform/resolvers`, `recharts`, `date-fns`, `date-fns-tz`
- [x] `.env`/`.env.example` con `VITE_API_BASE_URL`
- [x] Tipos generados con `openapi-typescript` contra el Swagger real de producción, script `generate:types`
- [x] `api-client.ts` con estructura base (interceptor completo terminado en el módulo 1)
- [x] Estructura de carpetas completa según el diagrama
- [x] `pnpm run dev`/`build`/`lint` limpios (verificado con evidencia cruda: `cat`, `grep`, timestamps)
- ⚠️ **Incidente registrado**: en la primera pasada, el agente (modelo free) reportó un fragmento
  fabricado de `api.d.ts` con campos que nunca existieron (`isAvailable`, `paymentMethod`). Se
  detectó cruzando contra el Swagger real antes de aceptar el reporte, y se corrigió pidiendo
  evidencia cruda en vez de resúmenes. Lección aplicada de ahí en adelante para módulos sensibles.

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
- [x] Consume `GET /admin/dashboard/summary` y `GET /admin/dashboard/top-products`
- [x] Selector de rango de fechas (default: hoy, según ya calcula el backend)
- [x] Tarjetas de resumen: pedidos del día, ventas, desglose por estado
- [x] Gráfica de productos más vendidos (Recharts)

### 4. Menú (categorías + productos)
- [x] CRUD de categorías
- [x] CRUD de productos, con subida de imagen (consume `POST /menu/items/:id/image`)
- [x] Toggle de disponibilidad rápido desde la lista (sin entrar a editar)
- [x] Manejo del 409 de nombre duplicado con mensaje claro en el formulario, no un error genérico
- [x] Fix de auditoría (bug de clase): `useUpdateItem` y `useUpdateCategory` ya NO envían `id` en el
      body del PATCH (el `id` viaja solo en el path; el ValidationPipe del backend rechaza campos
      extra con 400). Tests de regresión en `hooks.test.tsx` de items y categorías
- [x] **Mejora de UX (auditoría)**: columna "ID" con botón de copiar al portapapeles en las tablas
      de productos y categorías (`CopyIdButton` reutilizable + mini-sistema de toasts sin
      dependencias en `src/components/ui/toast.tsx`). El UUID no se muestra como texto en la tabla
      (largo y poco legible); el botón copia el id real con toast "ID copiado" y fallback de error
      si el portapapeles falla. Tests en `CopyIdButton.test.tsx`

### 5. Pedidos
- [x] Listado paginado, filtro por estado
- [x] Vista de detalle de un pedido (items, dirección, link de WhatsApp)
- [x] Cambio de estado con los botones/acciones válidas según la transición (no mostrar botones
      de transiciones inválidas, ej. no ofrecer "entregado" si sigue en "pendiente")

### 5.1 Infraestructura de tests
- [x] Vitest + React Testing Library + jsdom instalados y configurados (script `pnpm run test`,
      setup en `src/test/setup.ts`, config en `vitest.config.ts`)
- [x] Test de regresión del merge de `onOrderUpdated` en Pedidos: el PATCH devuelve el pedido
      sin `items` y el detalle debe conservarlos (`src/features/orders/merge.ts` +
      `merge.test.ts`) — verificado que FALLA si se revierte el fix
- [x] Convención de testing documentada en la skill `react-celtas` (dónde viven los tests y la
      regla de no dejar sin test la lógica de datos que ya mordió con un bug real)

### 6. Cupones
- [x] Listado paginado, filtro por status
- [x] Formulario de generación manual (campaña), respetando el límite de 100% en `percentage`
- [x] Ver cupones de un usuario específico — el backend agregó el filtro `userId` a `GET /coupons`
      (confirmado contra `/docs-json` y regenerado con `pnpm run generate:types`). Se consume desde
      el detalle de usuario (módulo 9) con `useCoupons(page, limit, status, userId)`.

### 7. Banners
- [x] CRUD con subida de imagen
- [x] Selector de fechas de vigencia (startDate/endDate)
- [x] Reordenamiento drag-and-drop (consume `PATCH /banners/reorder`)
- [x] **Mejora (auditoría)**: `actionValue` para `category`/`menuItem` ya NO es un input de
      texto libre — ahora es un `<Select>` real poblado con `GET /menu/categories` (muestra el
      nombre, guarda el **id** UUID) y `GET /menu/items` (muestra el nombre, guarda el **id**).
      Elimina el riesgo de banners mal configurados por error de tipeo. `external_url` sigue
      siendo input de texto y `none` queda deshabilitado. Al cambiar `actionType` se limpia el
      `actionValue` viejo (un id de categoría no sirve como id de producto). Banners creados
      antes del selector (con slug escrito a mano) muestran su valor como opción "(sin
      coincidencia)" para no perderlo al guardar. Tests de regresión en
      `BannerForm.test.tsx` (verifican que el payload usa el id real, no texto libre).
      **Nota de contrato**: el backend documenta `actionValue` de categoría como "slug", pero
      la entidad `Category` NO tiene campo `slug` (confirmado en `category.entity.ts` y con
      `rg slug` = 0 en todo el backend) — el identificador real es el `id` UUID, que es lo que
      la app móvil ya usa para filtrar categorías (`category.id == selected`).

### 8. Configuración (Settings)
- [x] Editor del número de WhatsApp (`GET`/`PATCH /settings`)
- [x] Gestión de roles de usuario (`PATCH /users/:id/role`) — con confirmación antes de degradar
      o promover a alguien, y el caso de "no puedes quitarte tu propio admin" reflejado en la UI
      (deshabilitar esa opción para el propio usuario logueado, no solo esperar el 400 del backend)

### 9. Usuarios (listado admin)
- [x] Listado paginado de `GET /users` (filtro de búsqueda en cliente: el backend solo expone
      `page`/`limit`, no búsqueda server-side)
- [x] Ver perfil de un usuario específico (modal con datos de `GET /users`, sin password)
- [x] Ver cupones de un usuario específico (`GET /coupons?userId=X`, filtro agregado por el backend)
- [x] Ver direcciones de un usuario (`GET /users/:id/addresses`, endpoint admin agregado por el
      backend — array plano, principal primero)
- [x] Ver pedidos de un usuario (`GET /orders?userId=X`, filtro agregado por el backend — listado
      paginado con badges de estado reutilizados del módulo de pedidos)
- [x] Vista 360 en tabs (Perfil / Direcciones / Cupones / Pedidos) con `key={user.id}` para que al
      cambiar de usuario todas las queries apunten al usuario correcto (test de regresión cubre el
      edge case)

### 10. Deploy y Calidad
- [x] Pase de auditoría general (parte 1 — código):
  - [x] Tipos sin `any` sueltos: grep de `any`/`@ts-ignore`/`@ts-expect-error` en todo `src/` = 0
        resultados (verificado con `rg`)
  - [x] Estados de carga/error/vacío verificados pantalla por pantalla (Dashboard, Menú
        categorías+items, Pedidos, Cupones, Banners, Settings WhatsApp, Usuarios + vista 360)
  - [x] Accesibilidad: labels con `htmlFor` en todos los formularios, `alt` en imágenes (banners
        con título, items decorativos con `alt=""`), contraste WCAG AA calculado: naranja 5.43:1,
        dorado 11.21:1, cream 17.24:1, muted 7.58:1 — todos ≥ 4.5:1. El rojo de marca (#C1121F,
        3.12:1) fallaba AA para texto normal → nuevo token `celtas-red-light` (#F87171, 7.03:1)
        para texto de errores/badges; el rojo de marca queda solo para iconos (contraste no-texto
        3:1 ✓)
  - [x] Code-splitting: `React.lazy` + `Suspense` por ruta en `router.tsx` — bundle principal de
        ~1.17 MB → **296 kB** (gzip 94 kB); Dashboard (Recharts) y Banners (dnd-kit) en chunks
        separados; warning de chunk > 500 kB eliminado
  - [x] Warning intermitente de `act()` en `GenerateCouponForm.test.tsx` cerrado: el test 2 ahora
        espera el alert de éxito (`findByText('Cupón generado')`) que flushea el `setGenerated`
        dentro de `act()`
  - [x] Warning de lint `react-hooks/incompatible-library` en `BannerForm.tsx` eliminado:
        `watch()` → `useWatch()` (API de RHF compatible con el compilador de React). Lint queda
        con 0 errores y 0 warnings
- [ ] Deploy en Vercel o Netlify (free tier), variables de entorno de producción — **parte 2**
- [ ] Verificación end-to-end manual contra el backend real de producción — **parte 2**

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