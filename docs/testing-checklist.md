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

- [ ] El admin logueado no puede quitarse su propio rol desde la UI (opción deshabilitada)

## Users

- [ ] Paginación funciona y coincide con el formato real del backend

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
