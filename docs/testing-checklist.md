# ✅ Celtas Admin — Checklist de QA

Referencia usada por el agente `@tester`. Cada módulo del `ROADMAP.md` se considera "completo"
solo cuando pasa lo aplicable de este checklist.

---

## General (aplica a todo módulo)

- [x] `pnpm run type-check` sin errores
- [x] `pnpm run lint` limpio
- [x] `pnpm run build` sin errores
- [x] Las llamadas a la API usan los tipos de `src/types/api.d.ts`, sin `any` que oculte un mismatch
      (verificado en módulo 3 — dashboard; Swagger no documenta el body, se confirmó contra
      `admin-dashboard.service.ts`)
- [x] Toda pantalla que llama a la API maneja: loading, error, y estado vacío explícitos
      (verificado en módulo 3 — dashboard)
- [x] Ningún texto de UI en inglés (salvo nombres propios/técnicos donde no aplica traducir)

---

## Auth

- [ ] `ProtectedRoute` redirige a `/login` sin sesión
- [ ] El `accessToken` nunca se persiste en `localStorage` (solo en el store de Zustand, en memoria)
- [ ] El `refreshToken` sí persiste en `localStorage`, y se usa para recuperar sesión al recargar
- [ ] Un 401 dispara el interceptor de refresh una sola vez, no un loop
- [ ] Si el refresh falla, se limpia la sesión y redirige a `/login` sin dejar estado corrupto
- [ ] Un usuario con `role: cliente` (si accede por error) es rechazado con mensaje claro

## Layout

- [x] Sidebar funciona en desktop y colapsa/responde en pantallas chicas
- [x] Logout limpia sesión y redirige correctamente

## Dashboard

- [x] Selector de fechas refleja lo que realmente devuelve el backend (no reinterpreta timezone)
- [x] Maneja el caso de "sin datos" (ej. día sin ventas) sin romper la gráfica
- [x] Presets (Hoy / Esta semana / Este mes) arman `from`/`to` en `YYYY-MM-DD` calculados en
      `America/Lima` (verificado con date-fns-tz: un `2026-08-08T01:30Z` → `2026-08-07` en Lima)
- [x] Rango personalizado valida `from <= to` en el cliente: si se invierte, muestra error y
      mantiene el último rango válido (nunca envía un rango invertido → 400)
- [x] `limit` de top-products se envía como query param dentro del rango válido (1-50)
- [x] Tipos locales (`DashboardSummary`, `TopProductsResult`, `OrderStatus`) coinciden campo a
      campo con `admin-dashboard.service.ts` (Swagger no documenta el body: `content?: never`)
- [x] Estados de UI: loading (`LoadingState`), error (`ErrorState` con reintentar) y vacío
      explícito "Sin pedidos en este rango" (`ordersCount === 0`); la gráfica maneja su propio
      vacío ("Aún no hay ventas…") sin romperse
- [x] Colores de la gráfica vía `var(--color-celtas-*)` (emitidas por `@theme` en `index.css`),
      sin hex hardcodeado en componentes

## Menu

- [x] 409 de nombre duplicado se muestra en el campo del formulario, no como error genérico
      — `CategoryForm` y `ItemForm` mapean el mensaje del backend tal cual al campo `name`
      (regex `/nombre/i` sobre el `message` del envelope; verificado contra `menu.service.ts`)
- [x] 404 "Categoría no encontrada" al crear/editar item → error en el campo `categoryId`
      (`ItemForm`, regex `/categor[aí]/i`)
- [x] Borrar categoría con productos muestra el mensaje del 409 en el diálogo de confirmación
      (`CategoriesSection`: `isConflict` + `getApiMessage` con fallback idéntico al backend)
- [x] Subida de imagen valida en el cliente tipo/tamaño (`validateImageFile`: JPG/PNG/WEBP/GIF
      máx 5 MB, espejo de `image-upload-options.ts`) y mapea el 400 del backend al área de imagen
      (`ItemForm`: regex `/(imagen|archivo|máximo)/i` sobre el message)
- [x] Flujo de imagen correcto: crear item → subir a `POST /menu/items/:id/image` (multipart campo
      "image"); si la subida falla, el id queda guardado y el reintento actualiza en vez de crear duplicado
- [x] Toggle de disponibilidad controlado por el dato del servidor (no optimista), deshabilitado
      mientras muta, invalida la query al éxito; el error se muestra en un `Alert` (`ItemsSection`)
- [x] Estados de UI: loading/error/vacío explícitos en ambas listas; el form de item deshabilita
      submit si las categorías no cargaron (`isLoading || isError`)
- [x] Tipos del módulo (`types.ts`) coinciden campo a campo con las entidades/DTO del backend
      (Swagger no documenta los responses: `content?: never`)
- [x] Sin hex hardcodeado en componentes; tokens celtas vía `tailwind.config.ts` / `@theme` de `index.css`
- [x] Componentes shadcn nuevos sin texto en inglés visible (sr-only "Close"→"Cerrar", botón "Cancelar")
- [x] Fix de auditoría (bug de clase "id en el body"): `useUpdateItem` y `useUpdateCategory` ya NO
      envían `id` en el body de `PATCH /menu/items/:id` y `PATCH /menu/categories/:id` — el `id`
      viaja solo en el path (`UpdateMenuItemDto`/`UpdateCategoryDto` no lo declaran y el
      ValidationPipe usa `forbidNonWhitelisted` → 400 "property id should not exist"). Tests de
      regresión en `src/features/menu/items/hooks.test.tsx` y
      `src/features/menu/categories/hooks.test.tsx` (mockean `patch` de `@/lib/api-client` y
      verifican body sin `id`). **Verificado por @tester: cada test FALLA si se revierte el fix**
      (2/2 por hook, con el mensaje exacto del bug)


## Orders

- [x] Solo se muestran botones de transición de estado válidos según el estado actual
- [x] El link de WhatsApp del pedido es clickeable y correcto
- [x] Tras un cambio de estado (PATCH /orders/:id/status), el detalle abierto conserva sus items: el backend devuelve el pedido SIN relaciones, y `onOrderUpdated` hace merge `{ ...prev, ...updated, items: prev.items }` en vez de reemplazar (fix del crash `order.items.map` con `undefined`)

## Testing (5.1 Infraestructura)

- [x] Vitest + React Testing Library + jsdom instalados y configurados: `vitest.config.ts` con
      `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']`, `include: ['src/**/*.test.{ts,tsx}']`
      y alias `'@'` → `./src` (coincide con `vite.config.ts`)
- [x] `src/test/setup.ts` registra los matchers de `@testing-library/jest-dom/vitest` y hace
      `cleanup()` tras cada test (necesario porque no hay `globals: true`)
- [x] Scripts `test` (`vitest run`) y `test:watch` (`vitest`) en `package.json`; `tsconfig.node.json`
      incluye `vitest.config.ts` (type-check del config)
- [x] Test de regresión del merge de `onOrderUpdated` en Pedidos (`src/features/orders/merge.ts` +
      `merge.test.ts`): el PATCH devuelve el pedido sin `items` y el detalle debe conservarlos.
      **Verificado por @tester: FALLA (2/3) si se revierte el fix** (`{ ...current, ...updated }` sin
      `items: current.items`) y pasa (3/3) con el fix restaurado
- [x] El test simula la clase de error real: `updated.items` es `undefined` en runtime (el tipo `Order`
      lo declara requerido pero el backend no lo envía) → sin el fix, `merged.items` queda `undefined`
      y el diálogo crashearía en `items.map(...)`
- [x] Convención de testing documentada en la skill `react-celtas` (dónde viven los tests, sin
      globals, regla de lógica de datos que ya mordió con bug real, patrón de función pura)

## Coupons

- [x] Tipos del módulo (`types.ts`) coinciden campo a campo con la entidad `Coupon` y el
      `PaginatedCoupons` del backend (`coupons.service.ts`): `id, userId, code, discountType,
      discountValue, status, origin, expiresAt, usedAt, usedInOrderId, createdAt` + `meta
      { page, limit, total, totalPages }`. Swagger no documenta los responses (`content?: never`),
      se confirmó contra el código fuente del backend
- [x] `GET /coupons` se llama con `page`, `limit` y `status` opcional (active|used|expired) —
      espejo exacto de `QueryCouponsDto`; NO se inventa un filtro por `userId` (el backend no lo
      soporta)
- [x] `POST /coupons/generate` envía solo `{ userId, discountType, discountValue }` — NO incluye
      `expiresAt` (el backend lo calcula: hoy + `coupons.expirationDays`, default 15)
- [x] El formulario de generación manual rechaza `percentage > 100` en el cliente, antes del
      submit (`superRefine` → error en `discountValue`); `fixed_amount` SÍ puede superar 100
      (ej. S/150). Verificado con test de componente (`GenerateCouponForm.test.tsx`) y con el
      schema real en runtime
- [x] El 404 de usuario inexistente se mapea al campo `userId` (no como error genérico) —
      `GenerateCouponForm` con `isNotFound` + `getApiMessage`
- [x] Filtro por status resetea a página 1 (`handleFilterChange` → `setPage(1)`) y los valores
      son exactamente `active`/`used`/`expired`
- [x] Funciones puras (`coupon-utils.ts`) con 11 tests: formato de descuento, días restantes con
      clamp a 0, `isExpired` y `getEffectiveStatus` (estado efectivo vs cron del backend a la 1 AM)
- [x] Estados de UI: loading (`LoadingState` con hint de cold start), error (`ErrorState` con
      reintentar → `refetch`), vacío explícito ("No hay cupones" / mensaje contextual por filtro)
- [x] Convenciones: URL desde `VITE_API_BASE_URL` vía `api-client`, UI en español, paleta celtas
      (badges con tokens), `formatLima` para fechas de la tabla, `Pagination` genérico reutilizado
- [x] `pnpm run test` (17 tests), `pnpm run type-check`, `pnpm run lint`, `pnpm run build` pasan


## Banners

- [x] Selector de fechas valida `startDate < endDate` en el cliente — `isValidBannerDateRange` en
      `banner-utils.ts` (espejo de `IsBannerDateRangeValid` del backend, `<` estricto) + `superRefine`
      en `BannerForm.tsx`; 4 tests en `banner-utils.test.ts` (fechas opcionales, rango válido,
      invertido e iguales)
- [x] Reordenamiento drag-and-drop persiste correctamente contra `PATCH /banners/reorder` —
      `BannersPage.tsx` con `@dnd-kit` (`SortableBannerRow`, `handleDragEnd` con `arrayMove` envía
      `{ items: [{id, order}] }`); `useReorderBanners` en `hooks.ts` con actualización optimista
      (`onMutate` guarda `previous` → `onError` restaura → `onSettled` invalida). **Verificado por
      @tester con test temporal de rollback** (mock de `patch` rechazado): el cache vuelve al orden
      anterior; el test FALLA si se rompe el `onError`
- [x] Indicador de vigencia con los 4 estados (vigente/programado/vencido/inactivo) — `getBannerVigencia`
      en `banner-utils.ts` espejo de `findActive` del backend (`startDate <= now`, `endDate >= now`);
      7 tests incluyendo bordes exactos (`startDate == now` y `endDate == now` → `vigente`); badge en
      la columna "Vigencia" de `BannersPage.tsx` con tokens celtas (`status.ts`)
- [x] Subida de imagen reutiliza `ImageUpload.tsx` (mismos límites del backend: JPG/PNG/WEBP/GIF máx
      5 MB) y el flujo es en 2 pasos: crear/actualizar → `POST /banners/:id/image`; si la imagen
      falla, el banner queda creado, el error se muestra en el área de imagen y el form NO se cierra
      (reintento en edición) — `BannerForm.tsx`
- [x] Fix de auditoría: `useUpdateBanner` ya NO envía `id` en el body de `PATCH /banners/:id`
      (`UpdateBannerDto` no lo declara y el ValidationPipe usa `forbidNonWhitelisted` → 400
      "property id should not exist"); el `id` viaja solo en el path. **Verificado por @tester con
      test empírico contra el DTO real** (body con id rechazado, sin id aceptado)
- [x] Estados de UI: loading (`LoadingState`), error (`ErrorState` con retry → `refetch`), vacío
      explícito ("No hay banners"); confirmación de borrado en dos clics
- [x] Tipos del módulo (`types.ts`) coinciden campo a campo con `banner.entity.ts` y los DTOs del
      backend; `ReorderBannerItem` ↔ `ReorderBannerItemDto`. Sin `any` ni castings forzados
- [x] `pnpm run test` (28 tests), `pnpm run type-check`, `pnpm run lint` (0 errores) y
      `pnpm run build` pasan

## Settings

- [x] El admin logueado no puede quitarse su propio rol desde la UI (opción deshabilitada) —
      `RoleManagerCard` compara el UUID del input contra `useAuthStore.getState().user.id`
      (`isSelf`) y deshabilita el `SelectItem` "cliente" + alerta visible; no depende solo del
      400 del backend
- [x] Confirmación antes de degradar/promover — el submit abre un `Dialog` de confirmación
      (muestra UUID + rol nuevo) y la mutación solo corre al confirmar ("Sí, cambiar rol");
      nunca hay mutación directa sin confirmar
- [x] Editor de WhatsApp end-to-end — `GET /settings` devuelve un ARRAY de `{id, key, value,
      description, createdAt, updatedAt}` (confirmado contra `settings.service.ts` y en vivo con
      `GET /settings/public`); el form encuentra la key `whatsapp_business_number`, normaliza el
      valor a dígitos (`normalizeWhatsappNumber`, formato internacional sin +) y hace
      `PATCH /settings` con `{ key, value, description }` (exactamente `UpdateSettingDto`)
- [x] Regla del id-solo-en-path aplicada desde el primer intento — `useUpdateUserRole` destructura
      `{ id, ...body }` y el body de `PATCH /users/:id/role` es solo `{ role }` (`UpdateUserRoleDto`
      no declara id). Test de regresión en `src/features/settings/hooks.test.tsx`. **Verificado por
      @tester: FALLA 2/2 si se revierte el fix**
- [x] Lógica pura testeada — `settings-utils.ts` (normalización + validación 10-15 dígitos como
      guard de UX; el backend solo exige IsString+IsNotEmpty) con 8 tests
- [x] Estados de UI — WhatsApp: loading (`LoadingState`), error (`ErrorState` con retry → refetch),
      éxito ("Número guardado"); Roles: éxito ("Rol actualizado"), error de servidor, alerta de
      auto-degradación
- [x] `pnpm run test` (45 tests), `pnpm run type-check`, `pnpm run lint` (0 errores) y
      `pnpm run build` pasan

## Users

- [x] Paginación coincide con el formato real del backend — `GET /users` devuelve
      `{ items, meta: { page, limit, total, totalPages } }` (confirmado contra `users.service.ts`
      `findAll` y el docs-json real: solo `page`/`limit`, sin búsqueda server-side); `useUsers`
      envía `{ page, limit }` y `Pagination` usa `data.meta.page`/`totalPages`
- [x] Filtro de búsqueda en cliente documentado y testeado (`filterUsersByQuery`: nombre/email,
      case-insensitive, substring; 4 tests) — filtra solo la página actual y el mensaje "Sin
      resultados para X en esta página" lo deja explícito; no rompe la paginación
- [x] Estados de UI en el listado: loading (`LoadingState`), error (`ErrorState` con retry →
      `refetch`), vacío ("No hay usuarios") y sin resultados de búsqueda
- [x] Detalle en modal: perfil (datos de `GET /users`, sin password), cupones del usuario
      (`GET /coupons?userId=X` — filtro confirmado en `QueryCouponsDto` y en el docs-json real)
      con loading/error/vacío ("Este usuario no tiene cupones") y paginación propia
- [x] `useUpdateUserRole` envía el id SOLO en el path de `PATCH /users/:id/role` (body = solo
      `{ role }`, `UpdateUserRoleDto`); test de regresión 2/2 en `hooks.test.tsx`
- [x] Auto-degradación bloqueada en la UI: `RoleChangeDialog` deshabilita la opción "cliente"
      cuando el userId es el del admin logueado (`isSelf`), no depende solo del 400 del backend
- [x] Sin `any` en el módulo; sin URLs hardcodeadas (baseURL desde `VITE_API_BASE_URL` vía
      `api-client`); sin `accessToken` en localStorage (solo en el store de Zustand, en memoria)
- [x] Accesibilidad: `aria-label` en búsqueda y botón de detalle, `sr-only` en la columna de
      acciones, `role="status"`/`role="alert"` en loading/error, `aria-current` en paginación
- [x] `pnpm run type-check`, `pnpm run lint` (0 errores; warning pre-existente de
      `BannerForm.tsx` no relacionado) y `pnpm run build` pasan
- [x] **BUG (paginación de cupones en el detalle) — RESUELTO con refactor**: el reset de
      `couponsPage` al cambiar de usuario se logra remontando el contenido del modal con
      `key={user.id}` (`UserDetailContent` en `UserDetailDialog.tsx`), sin `useEffect` ni
      `setState` en efecto (regla `react-hooks/set-state-in-effect`). El test de regresión
      `UserDetailDialog.test.tsx` pasa (1/1) y **FALLA si se revierte el fix** (verificado por
      @tester: sin `key={user.id}`, `useCoupons` se llama con `page=2` para el usuario B).
      `pnpm run lint` pasa con 0 errores.

- [x] Vista 360 en tabs (Perfil / Direcciones / Cupones / Pedidos) — `UserDetailDialog.tsx` con
      `Tabs` de shadcn; el contenido se monta con `key={user.id}` para que al cambiar de usuario
      todas las queries apunten al usuario correcto (mismo patrón que el fix de cupones)
- [x] `GET /users/:id/addresses` (admin) — `useUserAddresses` en `users/hooks.ts`: el `id` viaja
      SOLO en el path (regla de la skill), `enabled: Boolean(userId)`, query key
      `['users','addresses',userId]`. Contrato confirmado en `api.d.ts`
      (`UsersController_listUserAddresses`: path `{id}`, 404 si no existe, array plano)
- [x] `GET /orders?userId=X` (admin) — `useUserOrders` envuelve `useOrders` del módulo de pedidos
      (misma query key → la invalidación de `useUpdateOrderStatus` refresca también esta vista);
      `userId` es query param legítimo de `QueryOrdersDto` (confirmado en `api.d.ts`
      `OrdersController_listAll.query.userId`), no va en el body
- [x] `UserAddressesSection`: 3 estados — loading (`LoadingState`), error (`ErrorState` con retry →
      `refetch`), vacío ("Este cliente no tiene direcciones guardadas"); badge "Principal" cuando
      `isDefault`, referencia opcional
- [x] `UserOrdersSection`: 3 estados — loading, error, vacío ("Este cliente no tiene pedidos
      todavía"); tabla paginada con `Pagination` (usa `meta.page`/`totalPages` del backend,
      `onPageChange` actualiza la página); badges reutilizados de `@/features/orders/status`
      (`ORDER_STATUS_BADGE`/`ORDER_STATUS_LABELS`) — NO duplica la lógica de labels/colores
- [x] Test de regresión del edge case de cambio de usuario (`UserDetailDialog.test.tsx`): al
      cambiar de usuario con el modal abierto, direcciones y pedidos se consultan con el userId
      NUEVO. **Verificado por @tester: FALLA si se revierte el fix** (sin `key={user.id}`, el test
      "al cambiar de usuario, la página de cupones vuelve a 1" falla con `page=2` para userB)


## Módulo 10 — Auditoría global (parte 1: código)

- [x] Grep de `any`/`@ts-ignore`/`@ts-expect-error`/`@ts-nocheck` en todo `src/` = 0 resultados
- [x] Estados de UI (loading/error/vacío) verificados pantalla por pantalla: Dashboard,
      Categorías, Productos, Pedidos, Cupones, Banners, Settings (WhatsApp), Usuarios (listado +
      vista 360 en 3 tabs con datos)
- [x] Labels asociados (`htmlFor`/`id`) en todos los formularios: Login, CategoryForm, ItemForm,
      BannerForm, GenerateCouponForm, WhatsappSettingsCard, RoleManagerCard
- [x] Imágenes con `alt`: banners `alt={title}`, items decorativos `alt=""` (correcto para
      decorativas)
- [x] Contraste WCAG calculado sobre `#0D0D0D`: orange 5.43:1, gold 11.21:1, cream 17.24:1,
      muted 7.58:1, red de marca 3.12:1 (falla AA texto normal) → nuevo token `celtas-red-light`
      (#F87171, 7.03:1) en errores/badges; rojo de marca solo en iconos (no-texto 3:1 ✓)
- [x] Code-splitting por ruta (`React.lazy` + `Suspense` en `router.tsx`): bundle principal
      ~1.17 MB → 296 kB (gzip 94 kB); Dashboard/Banners en chunks separados; sin warning de
      chunk > 500 kB
- [x] Warning intermitente de `act()` en `GenerateCouponForm.test.tsx` cerrado (test 2 espera el
      alert de éxito dentro de `act()`)
- [x] Warning de lint `react-hooks/incompatible-library` en `BannerForm.tsx` eliminado
      (`watch()` → `useWatch()`); `pnpm run lint` = 0 errores y 0 warnings
- [x] `pnpm run type-check`, `pnpm run lint`, `pnpm run test` (53/53) y `pnpm run build` pasan

---

## Reporte de auditoría (formato esperado del @tester)

```
## Auditoría: <nombre del módulo>

✅ Pasó:
- ...

❌ Falló:
- [archivo/componente] — descripción exacta del problema

⚠️ Riesgos / casos borde no cubiertos:
- ...

Veredicto: LISTO PARA MARCAR COMPLETO / PENDIENTE
```
