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
- [x] **Mejora de UX (auditoría @tester) — columna "ID" con copiar al portapapeles**: `CopyIdButton`
      copia el `id` real (no el nombre) — verificado por mutación: el test FALLA si se revierte a
      `copyTextToClipboard(label)` y si se cambia el mensaje de éxito/error. El toast se renderiza
      en un portal a `document.body` con `position: fixed` (`ToastProvider` en `App.tsx`), así que
      no depende del overflow de la tabla; `aria-live="polite"` + `role="status"`, auto-dismiss 2s
      con timeouts limpiados al desmontar (sin warnings de `act()` en la suite). El fallback de
      `clipboard.ts` (http no-secure: `navigator.clipboard` ausente o `writeText` rechaza → cae a
      `document.execCommand('copy')`) tiene 5 tests propios en `src/lib/clipboard.test.ts`
      (clipboard disponible, ausente, rechazo de writeText, execCommand=false, execCommand lanza).
      ⚠️ **Hallazgo menor**: si `execCommand` lanza, el textarea temporal queda en el DOM (el
      `removeChild` está después de `execCommand` en el mismo `try`) — fuga invisible en un caso
      patológico (execCommand casi nunca lanza, devuelve false). Fix sugerido: `try/finally`.
      Sin dependencias nuevas (`package.json`/`pnpm-lock.yaml` sin cambios). Suite completa: 71/71.


## Orders

- [x] Solo se muestran botones de transición de estado válidos según el estado actual
- [x] El link de WhatsApp del pedido es clickeable y correcto
- [x] Tras un cambio de estado (PATCH /orders/:id/status), el detalle abierto conserva sus items: el backend devuelve el pedido SIN relaciones, y `onOrderUpdated` hace merge `{ ...prev, ...updated, items: prev.items }` en vez de reemplazar (fix del crash `order.items.map` con `undefined`)
- [x] `OrderItem.selectedSauces` es tri-state real (`string[] | null`), confirmado contra el código
      fuente real de `backend-celtas` (`order-item.entity.ts`, `orders.service.ts`,
      `orders.service.spec.ts`): `null` = no aplica, `[]` = "Sin salsas" elegido a propósito por el
      cliente, `string[]` = salsas elegidas. El detalle de pedido (`OrderDetailDialog.tsx`) muestra
      la línea correcta para cada caso — no muestra nada solo cuando es `null`, nunca cuando es `[]`
      (`OrderDetailDialog.test.tsx`, cubre los 3 casos por separado). **Verificado por @tester
      contra el código fuente real** (no solo confiado en la descripción de la sesión principal):
      `order-item.entity.ts` línea 65 (`selectedSauces: string[] | null`, columna `text array
      nullable`); `orders.service.ts` líneas 397-402 (`buildWhatsappUrl`: `null` = sin sufijo, `[]`
      = "(Salsas: Sin salsas)", con nombres = lista) — mismo criterio tri-state que el frontend;
      `orders.service.spec.ts` líneas 296-319 (3 tests del backend: sin `sauceIds` → `null`,
      `sauceIds: []` → `[]` explícito y `not.toBeNull()`, con `sauceIds` → nombres resueltos)

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
- [x] `OrderDetailDialog.test.tsx` (nuevo) cubre los 3 casos del tri-state de `selectedSauces` por
      separado (`null`, `[]`, con nombres). **Verificado con mutación por @tester**: cambié
      `item.selectedSauces !== null` a un truthy check (`item.selectedSauces &&
      item.selectedSauces.length > 0`) en `OrderDetailDialog.tsx` — reproduce el bug original que
      motivó el refinamiento del backend (colapsar `[]` con `null`) — y el test del caso `[]` FALLÓ
      exactamente como se esperaba: `1 failed | 2 passed`, error en
      `expect(screen.getByText('Sin salsas')).toBeInTheDocument()` (elemento no encontrado); los
      casos `null` y "con nombres" no se ven afectados por esa rama y siguieron pasando. Restauré el
      fix y la suite volvió a 3/3. `merge.test.ts` sigue compilando y pasando 3/3 con
      `selectedSauces: null` agregado a `makeItem()`

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
- [x] `minPurchaseAmount` (monto mínimo de compra): espejo del `GenerateCouponDto` (opcional,
      `@IsOptional() @IsNumber() @Min(0)`) y de la entidad `Coupon` (columna decimal nullable,
      `null` = sin mínimo). Confirmado contra `coupon.entity.ts` y `generate-coupon.dto.ts` del
      backend; el servicio persiste `dto.minPurchaseAmount ?? null` y los automáticos siempre
      llevan `null`. Swagger no documenta los responses, se confirmó contra el código fuente
- [x] Formulario de generación: vacío → `null` (no 0) vía `z.preprocess` (''/undefined/null → null
      ANTES de `z.coerce.number()`, que convertiría '' a 0); **0 y sus representaciones ('0',
      '0.00', '-0') también → null** (el backend trata 0 como "sin mínimo", misma semántica que
      null); negativo → error Zod "El monto mínimo no puede ser negativo" sin llamar a la API;
      valor válido → se envía como número. 4 tests en `GenerateCouponForm.test.tsx` verificados con
      mutación: el de "vacío → null" y el de "0 → null" FALLAN si el schema envía 0, y el de
      negativo FALLA sin `.nonnegative()`
- [x] Se quitó `min={0}` del input de monto mínimo: la validación nativa del navegador bloqueaba el
      submit antes de que Zod mostrara su mensaje (bug detectado en test)
- [x] Listado: `CouponsPage` muestra "Mín. S/ xx.xx" (helper puro `formatMinPurchaseAmount`) solo si
      hay mínimo; null/undefined/0 → NO se muestra nada (ni siquiera un `<p>` vacío — `DiscountCell`
      delega la decisión al helper). 2 tests en `coupon-utils.test.ts` (formato con 2 decimales y
      null/undefined/0 → null)
- [x] `pnpm run test` (59 tests), `pnpm run type-check`, `pnpm run lint`, `pnpm run build` pasan
- [x] **Campaña masiva de cupones (`POST /coupons/generate-bulk`)**: contrato confirmado en
      `src/types/api.d.ts` (`GenerateBulkCouponDto`) y contra el código fuente real del backend
      (`generate-bulk-coupon.dto.ts` y `CouponsService.generateBulk()` en `coupons.service.ts`,
      línea `async generateBulk(dto): Promise<{ count: number }>`) — la respuesta `BulkCouponResult
      { count: number }` en `types.ts` es exacta, no inventada; Swagger la documenta como
      `unknown` así que sin el código fuente esto no se podía confirmar. `useGenerateBulkCoupons`
      invalida `['coupons','list']` al éxito
- [x] Límite de 100% para `percentage` — mismo `superRefine` que `GenerateCouponForm`, espejo de
      `IsPercentageWithinLimit` (reutilizado sin cambios entre `GenerateCouponDto` y
      `GenerateBulkCouponDto` en el backend); `fixed_amount` no tiene tope
- [x] `minPurchaseAmount`: `''`/`0`/`'0'` → `null` (mismo `z.preprocess` que el form individual);
      negativo rechazado con `.nonnegative()` sin `min={0}` nativo en el input (evita el bug ya
      conocido de que la validación del navegador bloquee el submit antes del mensaje de Zod)
- [x] **Confirmación explícita antes de la mutación — verificado por @tester con mutación
      independiente**: el submit del form (`onValidated`) solo hace `setPendingValues(values)`;
      la llamada real a `mutateAsync` vive únicamente en `handleConfirm`, disparado por el clic en
      "Sí, generar cupones". Revertí el fix (hice que `onValidated` llamara a `mutateAsync`
      directamente, saltándose la confirmación) y **4 de 6 tests de
      `GenerateBulkCouponForm.test.tsx` fallaron** exactamente como se esperaba (el texto de
      confirmación nunca aparece porque el submit va directo al resultado); restauré el fix y los
      6/6 volvieron a pasar. El panel de confirmación se renderiza reemplazando el formulario (no
      hay `<form>` en ese árbol), así que no hay manera de disparar la mutación con Enter u otro
      atajo de teclado sin pasar por el clic explícito
- [x] Estados de UI del panel de confirmación: alerta destructiva con resumen (campaña, descuento,
      expiración), botones "Cancelar" (descarta sin llamar a la API, vuelve al formulario) y "Sí,
      generar cupones" (deshabilitados ambos mientras `isPending`); error del servidor se muestra
      dentro del mismo panel sin perder el resumen
- [x] `GenerateCouponForm` ahora acepta `defaultUserId?` opcional (prellenado de Top Usuarios) sin
      romper su uso existente desde `CouponsPage` (sin la prop, `userId: ''` como antes)

## Users — Top usuarios (`GET /users?sortBy=totalSpent&order=desc`)

- [x] Contrato confirmado en `src/types/api.d.ts` (`UsersController_listUsers.parameters.query`:
      `sortBy?: "totalSpent" | "createdAt"`, `order?: "asc" | "desc"`) y contra el código fuente
      real (`query-users.dto.ts`: `UsersSortBy`/`SortOrder` enums con `@IsEnum`, whitelist
      explícita "evita inyección de columna"; `users.service.ts findAll()` usa
      `order: { [sortColumn]: direction }` sobre `sortColumn = query.sortBy ?? CREATED_AT`).
      `totalSpent` es una columna `decimal` real en `User` entity (no calculada al vuelo), así que
      el `ORDER BY` funciona directo en SQL
- [x] `useUsers` solo agrega `sortBy`/`order` al query si vienen definidos — verificado con test
      (`hooks.test.tsx`) que sin esos argumentos el request sigue siendo exactamente
      `{ page, limit }` (comportamiento previo intacto, sin params extra colándose para la vista
      "Todos")
- [x] `TopUsersSection`: tabla paginada con `useUsers(page, PAGE_SIZE, 'totalSpent', 'desc')`.
      Estados de UI completos: `LoadingState`, `ErrorState` con retry (`refetch`), vacío explícito
      ("No hay usuarios")
- [x] Botón "Generar cupón" por fila abre `GenerateCouponForm` (individual, no el de campaña) con
      `defaultUserId={user.id}` prellenado — **verificado por @tester con mutación
      independiente**: rompí el prefill en `GenerateCouponForm` (`userId: ''` en vez de
      `defaultUserId ?? ''`) y el test "abre el formulario de cupón individual con el userId de la
      fila correcta prellenado" de `TopUsersSection.test.tsx` **falló** (`toHaveValue` esperaba el
      UUID de la fila B y recibió `''`); restauré el fix y 2/2 volvieron a pasar
- [x] Accesibilidad: `aria-label={\`Generar cupón para ${user.fullName}\`}` único por fila (mismo
      patrón que "Ver detalle de X" ya usado en `UsersPage`), columna de acciones con `sr-only`
      "Acciones" en el header
- [x] `UsersPage` reestructurado con `Tabs` ("Todos"/"Top usuarios") sin romper el listado ni el
      filtro de búsqueda en cliente existentes; cambiar de tab desmonta el contenido inactivo
      (Radix `Tabs.Content` sin `forceMount`), así que no hay estado obsoleto entre pestañas


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
- [x] Selector real de acción (mejora de auditoría): `actionValue` para `category`/`menuItem`
      ya NO es input de texto libre — es un `<Select>` poblado con `useCategories()`/`useMenuItems()`
      que muestra el nombre y guarda el **id UUID** (no texto libre, no el nombre). `external_url`
      sigue siendo input de texto y `none` queda deshabilitado. **Verificado por @tester con
      mutación**: los tests 1 y 2 de `BannerForm.test.tsx` fallan si se revierte el Select por el
      input libre (assert del payload `actionValue: 'cat-chicken'`/`'item-2'` + placeholder viejo)
- [x] Al cambiar `actionType` se limpia `actionValue` (`setValue('actionValue', '')`) para no
      mandar un id de categoría como id de producto/URL. **Verificado por @tester con mutación**:
      el test 4 "limpia el actionValue viejo" FALLA si se revierte el `setValue` (el submit manda
      `actionValue: 'cat-burgers'` con `actionType: 'menuItem'`)
- [x] Banners legacy (actionValue escrito a mano que no matchea ninguna categoría/producto)
      muestran una opción "(sin coincidencia)" para no perder el valor al guardar (sin esto,
      Radix Select no muestra el valor y el superRefine bloquearía el submit)
- [x] Estados de UI del selector: placeholder "Cargando categorías…/productos…" mientras
      `isLoading`, mensaje de error bajo el campo + `<Select>` deshabilitado en `isError`
- [x] Contrato: el backend documenta `actionValue` de categoría como "slug" (solo docstring en
      `banner.entity.ts`), pero la entidad `Category` NO tiene campo `slug` (grep en todo el
      backend = 1 match, el docstring del banner); el `CreateBannerDto.actionValue` es `string`
      plano, así que guardar el id UUID es compatible y es lo que la app móvil usa para filtrar
      categorías (`category.id == selected` en `home_screen.dart`)
- [x] `src/test/setup.ts` agrega polyfill de `ResizeObserver` (jsdom no lo implementa y Radix
      Select lo usa vía react-use-size). **Verificado por @tester**: sin el polyfill, los 4
      tests de `BannerForm.test.tsx` fallan con "ResizeObserver is not defined"; con él, la
      suite completa pasa (63/63) sin romper otros tests
- [x] `pnpm run test` (63 tests), `pnpm run type-check`, `pnpm run lint` (0 errores) y
      `pnpm run build` pasan
- [x] **Botón "Limpiar fecha" (startDate/endDate) — fix del bug raíz reportado antes como
      "completo" sin estarlo**: el backend hace `bannersRepository.merge(banner, dto)` en
      `update()`; `PlainObjectToNewEntityTransformer` (TypeORM) solo copia una clave si
      `objectColumnValue !== undefined` — si el frontend OMITE `startDate`/`endDate` del
      payload en vez de mandar `null` explícito, el merge deja la fecha vieja intacta aunque
      el form se vea vacío. `BannerForm.tsx` ahora siempre incluye la clave (`null` explícito
      si el campo está vacío). Confirmado independientemente contra el código fuente real de
      `celtas-backend`: `banners.service.ts` (merge), `IsOptional.js` de class-validator (trata
      `null` igual que `undefined`, no rompe la validación), `TransformOperationExecutor.js` de
      class-transformer (con `targetType === Date`, si `value === null` devuelve `null` tal
      cual, NO hace `new Date(null)`). `DatePicker.tsx`: botón "X" solo visible con
      `value && !disabled`, `aria-label` vía prop `clearLabel`, `stopPropagation` en el click.
      Único consumidor de `DatePicker` en todo `src/` es `BannerForm.tsx` (confirmado con grep,
      2 usos: startDate/endDate) — no hay otro formulario que dependa del payload viejo.
      **Verificado por @tester con mutación real** (no solo confiado en el reporte de la sesión
      principal): revertí el fix del payload al spread condicional
      (`...(values.startDate ? {...} : {})`) y el test
      `BannerForm.test.tsx > BannerForm limpiar fecha` FALLÓ exactamente como se esperaba
      (`expected undefined... to have property "startDate" with value null`); restauré el fix
      y la suite completa volvió a 78/78 en verde.
      **Test nuevo agregado por @tester**: `src/components/ui/DatePicker.test.tsx` (3 tests,
      componente aislado sin pasar por todo el formulario) — el botón no aparece sin valor; al
      limpiar, `onChange(null)` se dispara y el calendario NO se abre por el click en la X (la
      X es un elemento hermano del trigger en el DOM, no un hijo, así que el click no
      propaga la apertura del popover).
      **Hallazgo de @tester corregido en la sesión principal**: si el popover del calendario ya
      estaba abierto y se hacía click en "Limpiar", el valor se limpiaba bien pero el popover
      quedaba abierto (faltaba `setOpen(false)` en el handler de la X). Se agregó
      `setOpen(false)` al handler; el tercer test de `DatePicker.test.tsx` se actualizó para
      afirmar que el popover se cierra (antes fijaba el comportamiento viejo como conocido).
      `pnpm run type-check`, `pnpm run lint` (0 errores) y `pnpm run test` (15 archivos / 78
      tests) pasan con el cambio.
- [x] **Fix visual en columna "Fechas" del listado** (`BannersPage.tsx`): "Sin fechas" (o el
      rango) y `daysOfWeek` se concatenaban sin separador ("Sin fechasMar, Jue"). Fix: ambos en
      `<span>` independientes dentro de `<div className="flex flex-col gap-0.5">`; el formateo
      del rango se extrajo a la función pura `formatBannerDateRange` (`banner-utils.ts`, 4 tests:
      sin fechas, ambas reales sin `…`, solo `endDate`, solo `startDate`). El segundo reporte
      ("`startDate` real truncado a `…`") NO se reprodujo desde el código: grep de `'…'` en
      `banner-utils.ts` confirma que cada rama del ternario depende únicamente de su propio
      campo — no hay ruta donde un valor truthy caiga en `'…'`. Queda documentado como pendiente
      de confirmar con el JSON crudo del banner real (posible dato `startDate: null` residual
      del bug de `merge()` ya corregido), no como bug de este frontend.
      **Verificado por @tester de forma independiente, dos rondas**:
      1ª ronda — `pnpm run type-check`/`lint`/`build` FALLARON por un import estático muerto
      (`import BannersPage from './BannersPage'`, nunca usado porque ambos tests originales
      usaban `await import('./BannersPage')` dinámico) en `BannersPage.test.tsx`; `vitest run`
      no lo detectaba (84/84 en verde) porque Vitest no corre `tsc`/`eslint`. Reportado como
      bloqueante sin corregirlo (regla del rol: solo reportar, no arreglar).
      2ª ronda (tras el fix de la sesión principal) — repetí type-check, lint, test y build yo
      mismo: los cuatro en verde (`tsc -b` y `eslint .` sin salida, `85/85` tests en 16 archivos,
      `build` genera `BannersPage-*.js` sin warnings de tamaño). Repetí también la mutación
      independiente del test de regresión: `git stash push -- src/features/banners/BannersPage.tsx`
      (dejando `banner-utils.ts` con el fix) → `1 failed | 1 passed`, falla exactamente en
      `expect(cellWrapper).toBe(daysLine.parentElement)`; `git stash pop` restaura `2 passed`.
      Grep de `}{` en `src/features/**/*.tsx` confirma que no hay otro lugar del proyecto con el
      mismo patrón de concatenación sin separador.
      ⚠️ **Nota de proceso**: la sesión principal marcó este checkbox como `[x]` en `ROADMAP.md`
      (con texto atribuido a "@tester verificado de forma independiente") antes de que el
      veredicto LISTO se hubiera emitido en esta segunda ronda — el contenido resultó ser
      técnicamente exacto una vez verificado, pero el checkbox de `ROADMAP.md` debería marcarse
      solo después del veredicto del tester, no en anticipación.

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

## Configuración — Horario de atención (`business_hours_schedule`, `business_manual_closed`, `business_manual_closed_reason`)

- [x] Sigue la tabla genérica `settings`: `GET /settings` (admin, array) / `PATCH /settings`
      (admin, upsert por key, body `{ key, value, description? }`, sin `id`) — mismo endpoint que
      WhatsApp y confirmado contra el código fuente real del backend
      (`settings.service.ts`, `settings.controller.ts`, `update-setting.dto.ts` de
      `backend-celtas`), no solo Swagger
- [x] Las 3 keys nuevas coinciden carácter a carácter con las constantes reales del backend
      (`BUSINESS_HOURS_SCHEDULE_KEY`, `BUSINESS_MANUAL_CLOSED_KEY`,
      `BUSINESS_MANUAL_CLOSED_REASON_KEY` en `settings.service.ts`); las descripciones enviadas
      por el frontend (`settings-utils.ts`) también coinciden texto a texto con las del seed real
      del backend
- [x] `close <= open` (cruce de medianoche, ej. viernes 11:00→01:00) es válido y NO se rechaza —
      confirmado contra `SettingsService.evaluateSchedule`/`isOpenToday`/
      `isCarriedOverFromYesterday` del backend real, que maneja explícitamente ese caso; el
      `dayScheduleSchema` (`superRefine`) del frontend solo exige formato `HH:mm` y rechaza
      `open === close` (ventana de duración cero), nunca `close < open`
- [x] `parseSchedule`/`serializeSchedule` nunca lanzan: JSON malformado, `undefined` y `''` caen al
      default de 7 días 11:00-23:00 (5 tests en `settings-utils.test.ts`, incluye round-trip con
      un cruce de medianoche que se conserva sin alterar)
- [x] `resolveManualClosedReason`: motivo no vacío se conserva tal cual; vacío o solo-espacios cae
      a `DEFAULT_MANUAL_CLOSED_REASON` ("Cerrado temporalmente") — evita el 400 real de
      `UpdateSettingDto.value` (`@IsNotEmpty()`, confirmado en el DTO real del backend) contra el
      seed real de `business_manual_closed_reason` (`''`). Se aplica **siempre**, sin importar si
      el switch de cierre manual está encendido o apagado (decisión deliberada, así el primer
      guardado nunca falla con 400 aunque el admin no toque el campo de motivo)
- [x] Gap del backend documentado explícitamente (no oculto): `value: ''` da 400 para CUALQUIER
      key del endpoint genérico `PATCH /settings`, no solo esta — el frontend lo resuelve del lado
      del formulario porque no es viable ni deseable relajar el DTO del backend solo por este caso
- [x] `open === close` en un día NO cerrado bloquea el submit con mensaje visible en el campo
      "close" y NO llama a `mutateAsync` — **verificado por @tester con mutación real**: eliminé el
      bloque `if (... day.open === day.close)` del `superRefine` en
      `BusinessHoursSettingsCard.tsx` y el test 3 de `BusinessHoursSettingsCard.test.tsx` FALLÓ
      exactamente como se esperaba (`1 failed | 2 passed`, timeout en
      `findByText('La hora de cierre no puede ser igual a la de apertura')` porque el mensaje
      nunca aparece); restauré el fix y volvió a `3 passed`
- [x] El motivo vacío REALMENTE se reemplaza por el default antes de mandarse al backend —
      **verificado por @tester con mutación real**: cambié la llamada del componente para mandar
      `values.manualClosedReason` directo (sin pasar por `resolveManualClosedReason`); agregué un
      test de regresión permanente (`BusinessHoursSettingsCard.test.tsx`, 4º test) que simula el
      escenario real de primer guardado (switch de cierre manual apagado, campo "Motivo" nunca
      tocado, seed real `''`) y asegura que el payload de `business_manual_closed_reason` nunca es
      `''`; con la mutación aplicada el test FALLÓ exactamente como se esperaba
      (`expected '' not to be ''`, reproduciendo el 400 real); restauré el fix y la suite volvió a
      `4 passed`. El test queda como guardia permanente (no se descartó tras la verificación)
- [x] Domingo cerrado (`closed: true`) no muestra los inputs de hora — cubierto en el 1er test de
      `BusinessHoursSettingsCard.test.tsx`, junto con la precarga correcta de un horario ya
      guardado por día, incluyendo el cruce de medianoche del viernes sin alterarlo
- [x] Activar el switch de cierre manual muestra el campo "Motivo" (2º test), consistente con el
      patrón condicional de otros formularios del proyecto (ej. `BannerForm`)
- [x] Regla del id-en-el-body: no aplica de forma directa (el endpoint es `PATCH /settings` sin
      `:id` en el path, upsert por `key`) — `UpdateSettingInput`/`useUpsertSetting` (compartido con
      WhatsApp) nunca declaran `id`, confirmado en `types.ts`/`hooks.ts`
- [x] Estados de UI: loading (`LoadingState`), error (`ErrorState` con retry → `refetch`), éxito
      ("Horario guardado"), error del servidor (`Alert` destructivo) — mismo patrón que
      `WhatsappSettingsCard`, ya auditado. No hay un estado "vacío" explícito de lista (es un
      formulario, no un listado): si `GET /settings` devuelve un array sin las 3 keys (base sin
      sembrar), el formulario cae a los defaults de UX sin crashear (`scheduleToDays(undefined)` →
      7 días default, `manualClosedValue === 'true'` → `false` con `undefined`,
      `manualClosedReasonValue ?? ''` → `''`)
- [x] Accesibilidad: `aria-label` único por día en cada switch/input de hora (`"${DAY_LABELS[i]}
      hora de apertura/cierre/cerrado"`), `Label htmlFor` en el campo "Motivo"
- [x] Sin `any`/casting forzado en los archivos nuevos/modificados del módulo (grep = 0 resultados)
- [x] `pnpm run type-check`, `pnpm run lint`, `pnpm run build`: los tres sin salida, cero
      errores/warnings — repetidos de forma independiente por @tester, no solo de palabra
- [x] `pnpm run test`: 114/115 en verde (único fallo: `BannersPage.test.tsx` por timeout, flaky
      pre-existente ya documentado en este mismo checklist y en `ROADMAP.md` módulo 7 — confirmado
      que pasa 3/3 aislado); los 22 tests de `src/features/settings/` (2 archivos, incluido el
      test nuevo de esta auditoría) pasan 100% tanto en aislado como dentro de la suite completa

⚠️ **Riesgos / casos borde no cubiertos** (documentados, no bloqueantes):
- Las 3 keys se guardan con `mutateAsync` secuencial y `await`, sin transacción ni rollback: si el
  1er PATCH (`business_hours_schedule`) tiene éxito y el 2º o 3er PATCH falla (ej. el backend se
  cae a mitad del guardado), el horario semanal ya quedó persistido en el backend pero el switch
  de cierre manual/motivo no — el usuario ve un error genérico sin saber cuál de las 3 keys sí se
  guardó. Es un riesgo inherente al diseño de settings clave-valor genérico (cada `PATCH` es
  independiente en el backend, no hay endpoint transaccional para las 3 a la vez) y no es exclusivo
  de este formulario, pero es la primera vez que un formulario del panel encadena 3 mutaciones
  secuenciales sin all-or-nothing — vale la pena que la sesión principal lo tenga en cuenta si se
  agrega otro formulario multi-key en el futuro
- No hay un test de componente que verifique explícitamente el contenido del payload
  `business_hours_schedule` (JSON serializado) en un submit exitoso con datos válidos incluyendo el
  cruce de medianoche del viernes — el 4º test agregado por @tester lo ejerce indirectamente (el
  submit por defecto incluye el horario del viernes con `close < open` sin tocar) pero no hace un
  `expect` explícito sobre ese payload. Bajo riesgo (la lógica de serialización ya tiene 5 tests
  puros en `settings-utils.test.ts`), pero es un hueco de cobertura explícita
- Fallback de UI para JSON malformado/`undefined` (`DEFAULT_SCHEDULE`, 7 días uniformes 11:00-23:00
  en `settings-utils.ts`) NO coincide con el seed real del backend (`DEFAULT_BUSINESS_HOURS_SCHEDULE`
  en `settings.service.ts`: domingo cierra 22:00, viernes/sábado cruzan medianoche a la 01:00) —
  esto es intencional y está documentado en el comment del código (es solo un fallback defensivo
  del formulario ante datos corruptos, nunca se usa en el flujo normal porque `GET /settings`
  siempre trae los valores reales sembrados), pero podría confundir a alguien que audite el código
  sin leer el comentario. No es un bug
- **Gap real de E2E — NO minimizado**: no se corrió Playwright de extremo a extremo (login real +
  cambiar el horario desde la UI + recargar y confirmar persistencia + probar el interruptor de
  cierre manual visible en la app cliente o en `GET /settings/business-hours`) contra el backend
  real. Toda la verificación de este módulo fue: (1) contrato confirmado contra el código fuente
  real del backend (no solo Swagger), (2) tests de componente con mocks de `useSettings`/
  `useUpsertSetting`, (3) mutación real de dos fixes críticos con reversión y restauración
  confirmadas. No se probó contra `http://localhost:3000` ni contra
  `https://backend-celtas.onrender.com` con una sesión de admin real. Antes de que el dueño del
  negocio use esta pantalla en producción, se recomienda una pasada manual real: guardar un
  horario, recargar la página y confirmar que persiste, y activar el cierre manual y confirmar
  que `GET /settings/business-hours` (endpoint público, sin auth) refleja el cambio correctamente
- No se verificó el efecto de este formulario sobre `POST /orders` (el backend bloquea pedidos
  fuera de horario según `isOpenNow()`) ni sobre la app cliente (Flutter) — fuera del alcance de
  este panel admin, pero es la consecuencia real de negocio de esta feature y no se validó
  end-to-end

Veredicto: LISTO PARA MARCAR COMPLETO (con el gap de E2E real explícito, no oculto — ver arriba)

**Pendiente restante de esta feature completa (fuera del alcance de `celtas-admin`)**: el panel
admin ya permite configurar el horario y el cierre manual, y el backend ya bloquea pedidos fuera
de horario en `POST /orders` (auditado y en producción). Lo único que falta para que la feature
esté completa de punta a punta es que **`celtas-app`** (cliente Flutter) muestre al usuario el 409
del checkout cuando el local está cerrado (en vez de un error genérico) — no requiere ningún
cambio adicional en `celtas-admin` ni en `celtas-backend`.

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

## Marketing (notificaciones de fidelización) — v1 manual

- [x] Sección propia en el sidebar (`/marketing`, ícono `Megaphone`), ubicada entre "Banners" y
      "Configuración" en `AdminLayout.tsx` — NO mezclada con Configuración (`NAV_ITEMS` confirmado
      por diff real)
- [x] Ruta `/marketing` registrada en `router.tsx` con `React.lazy` + `Suspense` (mismo patrón de
      code-splitting que el resto de rutas)
- [x] Contrato confirmado línea a línea contra el código fuente real de `backend-celtas` (no solo
      Swagger): `notifications.controller.ts` (`POST /notifications/broadcast`,
      `GET /notifications/broadcast-history`, ambos `@Roles(UserRole.ADMIN)` +
      `JwtAuthGuard`/`RolesGuard`), `notifications.service.ts`
      (`sendMarketingBroadcast`/`getBroadcastHistory`), `broadcast-notification.dto.ts` y la
      entidad `MarketingNotification` — ninguno de los dos endpoints declara `@ApiResponse({ type
      })`, así que `src/types/api.d.ts` documenta ambas respuestas como `content?: never`
      (confirmado grep línea 3199-3213 y 3230+); los tipos de
      `src/features/marketing/types.ts` (`BroadcastNotificationInput { title, body }`,
      `BroadcastResult { sent, total }`, `MarketingBroadcast { id, title, body, adminId, sentCount,
      totalCount, createdAt }`) coinciden campo a campo con el DTO/entidad reales. `adminId:
      string | null` es correcto (columna `nullable: true`, FK `onDelete: 'SET NULL'`);
      `createdAt: string` (no `Date`) es correcto porque es lo que realmente llega serializado por
      HTTP — confirmado con curl real (ver abajo)
- [x] `BroadcastForm.tsx`: Zod (`title`/`body` requeridos, no vacíos, espejo exacto de
      `@IsString`/`@IsNotEmpty` del DTO real, sin límite de longitud inventado) + patrón de
      confirmación explícita idéntico a `GenerateBulkCouponForm.tsx` (mismo mecanismo: `onValidated`
      solo setea `pendingValues`, el panel de confirmación reemplaza por completo el `<form>`
      mientras está activo, `mutateAsync` solo se llama desde `handleConfirm` tras el clic en "Sí,
      enviar ahora"). **Verificado por @tester con mutación real**: inyecté una llamada a
      `broadcastMutation.mutateAsync(values)` dentro de `onValidated` (bypaseando la confirmación) →
      2 de 5 tests de `BroadcastForm.test.tsx` fallaron exactamente como se esperaba (`expected
      "vi.fn()" to not be called at all, but actually been called 1 times`, con el payload real
      capturado); restauré el archivo a su estado original y la suite volvió a 5/5 en verde
- [x] `MarketingPage.tsx`: formulario arriba + tabla del historial debajo, 3 estados de UI
      (`LoadingState`, `ErrorState` con retry → `refetch`, vacío "Todavía no enviaste ninguna
      campaña"), columnas título/cuerpo/alcance (`sentCount / totalCount`)/fecha (`formatLima`)
- [x] Hooks (`hooks.ts`): `useBroadcastHistory` (`GET /notifications/broadcast-history`) y
      `useSendBroadcast` (`POST /notifications/broadcast`, invalida `['marketing',
      'broadcast-history']` en `onSuccess`) — sin `any` ni casting forzado (grep de `any`/`as
      [A-Za-z]` en todo el módulo = 0 resultados, solo `as const` en la query key, que no oculta
      ningún mismatch de tipos)
- [x] Verificación manual end-to-end **independiente** contra el backend local real
      (`localhost:3000`, admin QA propio creado vía `POST /auth/register` + promovido a `admin` por
      SQL, sesión aparte de la usada por la sesión principal): `POST /notifications/broadcast` sin
      token → `401 {"success":false,"message":"Unauthorized","statusCode":401}`; con token admin →
      `201 {"sent":0,"total":16}` (0 esperado: credenciales Firebase de prueba en el `.env` local);
      `GET /notifications/broadcast-history` → `200`, primera fila exactamente `{id, title, body,
      adminId, sentCount, totalCount, createdAt}` con los valores recién enviados
- [x] `pnpm run type-check` (`tsc -b`), `pnpm run lint` (`eslint .`), `pnpm run build`: los tres sin
      salida, cero errores/warnings — corridos de forma independiente, no solo de palabra
- [x] `pnpm run test`: 23 archivos / 125 tests en verde (confirmado independientemente); los 2
      archivos de `src/features/marketing/` (`hooks.test.tsx`, `BroadcastForm.test.tsx`) pasan 8/8
      tanto aislados como dentro de la suite completa

⚠️ **Riesgos / casos borde no cubiertos** (documentados, no bloqueantes):
- No hay límite de longitud en `title`/`body` ni en el frontend ni en el DTO real del backend — un
  título/cuerpo extremadamente largo se enviaría igual a FCM, que sí tiene límites propios (ej.
  ~4KB por payload); no se probó ese caso límite
- El envío es a TODOS los usuarios con `fcmToken`, sin segmentación ni preview de audiencia más
  allá del número total mostrado tras el envío (`sent`/`total`) — el admin no puede saber de
  antemano cuántos dispositivos recibirán la notificación antes de confirmar, solo después
- No se verificó con Firebase real (credenciales de producción) que el push efectivamente llega al
  dispositivo — la verificación de este módulo cubre el contrato HTTP y el guardado en historial,
  no la entrega final de FCM (fuera del alcance de este panel, y el backend ya documenta que
  `sendPushNotification`/`broadcastPushNotification` nunca lanzan aunque el envío real falle)
- Gap de E2E real vía navegador: no se probó con Playwright el flujo completo (login real en el
  navegador → clic en "Marketing" en el sidebar → completar el formulario → confirmar → ver la fila
  nueva en la tabla) — la verificación de ruta/sidebar fue por lectura de código (diff de
  `router.tsx`/`AdminLayout.tsx`, ambos compilando y buildeando sin error) más `build`/`test`
  verdes, no por click real en un navegador

Veredicto: LISTO PARA MARCAR COMPLETO

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

---

## Auditoría: Campaña masiva de cupones (`POST /coupons/generate-bulk`) + Top Usuarios (`GET /users?sortBy&order`)

✅ Pasó:
- `pnpm run type-check` (`tsc -b`), `pnpm run lint` (`eslint .`), `pnpm run build`: los tres sin
  salida, cero errores/warnings
- `pnpm run test`: 18 archivos / 95 tests en verde (confirmado independientemente, no solo de
  palabra)
- Contrato de `GenerateBulkCouponDto`/respuesta confirmado en `src/types/api.d.ts` Y contra el
  código fuente real de `celtas-backend` (no solo Swagger, que documenta la respuesta como
  `unknown`): `generate-bulk-coupon.dto.ts` y `CouponsService.generateBulk()` en
  `coupons.service.ts` — `Promise<{ count: number }>`, coincide exacto con `BulkCouponResult` en
  `src/features/coupons/types.ts`
- Contrato de `sortBy`/`order` de `GET /users` confirmado en `api.d.ts`
  (`UsersController_listUsers.parameters.query`) y contra `query-users.dto.ts` /
  `users.service.ts` del backend real: whitelist por enum (`UsersSortBy`/`SortOrder`), `totalSpent`
  es columna `decimal` real (no calculada), el `ORDER BY` funciona directo en SQL
- **Mutación independiente #1 (campaña masiva)**: rompí la confirmación (hice que el submit
  llamara a `mutateAsync` directamente) → 4/6 tests de `GenerateBulkCouponForm.test.tsx` fallaron
  como se esperaba; restauré el fix → 6/6 en verde de nuevo
- **Mutación independiente #2 (prefill de Top Usuarios)**: rompí `defaultUserId ?? ''` a `''` en
  `GenerateCouponForm` → 1/2 tests de `TopUsersSection.test.tsx` falló exactamente en el
  `toHaveValue` del UUID esperado; restauré el fix → 2/2 en verde de nuevo
- El panel de confirmación de la campaña masiva es imposible de saltarse: reemplaza por completo
  el `<form>` mientras está activo (no hay ningún elemento `<form>` en ese árbol), así que no hay
  ruta de teclado (Enter) ni de doble-submit que dispare `mutateAsync` sin el clic explícito en
  "Sí, generar cupones"; "Cancelar" descarta sin llamar a la API y deja el formulario reutilizable
- `useGenerateBulkCoupons` invalida `['coupons','list']` en `onSuccess` — el listado se refresca
  tras la campaña
- Estados de UI completos y consistentes con el resto del proyecto: `LoadingState`, `ErrorState`
  con retry, vacío explícito en `TopUsersSection`; alerta de éxito/error en ambos formularios de
  cupón
- Accesibilidad: labels con `htmlFor`/`id` en todos los campos nuevos, `aria-label` único por fila
  en "Generar cupón para {nombre}" (mismo patrón que "Ver detalle de {nombre}" ya usado en
  `UsersPage`), `sr-only` en columna de acciones
- Sin `any`/`@ts-ignore`/`@ts-expect-error`/`@ts-nocheck` nuevos (grep en los 9 archivos
  nuevos/modificados = 0 resultados), sin hex hardcodeado fuera de tokens celtas, sin texto en
  inglés visible (el único patrón "No" detectado por el grep heurístico es el "No" de "No se pudo…"
  en español, falso positivo)
- Regla del `id` en el body: no aplica a estos dos endpoints (ambos son `POST`, no `PATCH` con id
  en el path) — sin regresión del bug de clase ya conocido
- Reglas de negocio específicas del checklist verificadas: límite de 100% en `percentage` (mismo
  `superRefine`, espejo de `IsPercentageWithinLimit` reutilizado sin cambios en el backend entre
  `GenerateCouponDto` y `GenerateBulkCouponDto`), `minPurchaseAmount` normaliza `''`/`0`/`'0'` a
  `null` en el formulario de campaña masiva igual que el individual

❌ Falló:
- Ninguno de los puntos críticos del checklist

⚠️ Riesgos / casos borde no cubiertos:
- `GenerateBulkCouponForm.test.tsx` no tiene un test dedicado para `minPurchaseAmount` negativo
  (sí lo tiene `GenerateCouponForm.test.tsx` para el form individual). El código es idéntico
  (mismo `z.preprocess` + `.nonnegative()`, sin `min={0}` nativo en el input), así que el riesgo
  real es bajo, pero falta el test explícito de regresión por si el patrón diverge en el futuro
- Al cerrar y reabrir el diálogo de "Generar cupones" en `CouponsPage` (o cambiar de tab
  individual↔campaña), no se verificó en runtime contra el DOM real si Radix `Dialog.Content`/
  `Tabs.Content` desmontan de forma confiable el estado interno (`pendingValues`, `result`) en
  todos los navegadores — por código fuente de Radix esto debería desmontar (`Tabs.Content` sin
  `forceMount`), pero no hay un test de componente que lo cubra explícitamente para
  `GenerateBulkCouponForm`
- No se probó el flujo end-to-end contra el backend real desplegado (`https://backend-celtas.onrender.com`) — toda la verificación de contrato fue estática (tipos + código fuente) y de
  componente (mocks). Sigue pendiente una prueba manual real de `POST /coupons/generate-bulk` con
  una base de datos de prueba antes de usarlo con clientes reales de producción, dado que es una
  acción irreversible que impacta a TODOS los clientes
- No se verificó qué pasa si `clients.length` es muy grande (el backend usa `BULK_INSERT_CHUNK_SIZE
  = 500` para el batch insert) — el frontend no tiene timeout ni manejo especial para una campaña
  que tarde varios segundos en generarse con una base de clientes grande; solo muestra
  "Generando…" sin límite de tiempo. No es un bug, pero vale la pena confirmar con datos reales de
  producción que el request no expire antes de que el backend responda
- La sección "Users" original y "Users — Top usuarios" del checklist quedaron como bloques
  separados en este documento (no fusionados) para no reescribir el bloque ya auditado
  anteriormente; si se agrega más funcionalidad a Top Usuarios más adelante, considerar
  fusionarlos en una sola sección "Users" para evitar fragmentación

Veredicto: LISTO PARA MARCAR COMPLETO

---

## Auditoría: Marketing (notificaciones de fidelización) — v1 manual

✅ Pasó:
- `pnpm run type-check` (`tsc -b`), `pnpm run lint` (`eslint .`), `pnpm run build`: los tres sin
  salida, cero errores/warnings — corridos de forma independiente
- `pnpm run test`: 23 archivos / 125 tests en verde (confirmado independientemente); los 2 archivos
  nuevos de `src/features/marketing/` pasan 8/8 tanto aislados como en la suite completa
- Contrato confirmado línea a línea contra el código fuente real de `backend-celtas`
  (`notifications.controller.ts`, `notifications.service.ts`, `broadcast-notification.dto.ts`,
  entidad `MarketingNotification`) — los tipos en `src/features/marketing/types.ts` coinciden campo
  a campo con el DTO/entidad reales, incluido `adminId: string | null` (FK `SET NULL`) y
  `createdAt: string` (no `Date`; confirmado que llega como string ISO por HTTP real, ver abajo).
  `src/types/api.d.ts` regenerado y confirmado: ambos endpoints declaran `content?: never` (sin
  `@ApiResponse({ type })` en el backend), así que los tipos a mano en `types.ts` son la única
  fuente de verdad correcta — no había alternativa viable de usar solo tipos generados
- Sin `any` ni casting forzado en el módulo (grep = 0 resultados; único `as const` es en la query
  key de React Query, no oculta ningún mismatch de tipos)
- **Mutación independiente (guard de confirmación)**: inyecté `broadcastMutation.mutateAsync(values)`
  dentro de `onValidated` de `BroadcastForm.tsx` (bypaseando el panel de confirmación) → 2 de 5 tests
  de `BroadcastForm.test.tsx` fallaron exactamente como se esperaba (`expected "vi.fn()" to not be
  called at all, but actually been called 1 times`); restauré el archivo a su estado original y la
  suite volvió a 5/5 en verde. El patrón de confirmación es idéntico al de `GenerateBulkCouponForm`
  (Cupones), ya auditado
- **Verificación end-to-end independiente contra el backend local real** (`localhost:3000`, admin QA
  propio: `POST /auth/register` + `UPDATE users SET role='admin'` por SQL — sesión distinta de la
  usada por la sesión principal):
  - `POST /notifications/broadcast` sin token → `401 {"success":false,"message":"Unauthorized","statusCode":401}`
  - `POST /notifications/broadcast` con token admin → `201 {"sent":0,"total":16}` (0 esperado:
    credenciales Firebase del `.env` local son de prueba)
  - `GET /notifications/broadcast-history` → `200`, primera fila con exactamente
    `{id, title, body, adminId, sentCount, totalCount, createdAt}` y los valores recién enviados
- Ítem de sidebar "Marketing" (ícono `Megaphone`) y ruta `/marketing` confirmados por diff real de
  `AdminLayout.tsx`/`router.tsx`: posición correcta entre "Banners" y "Configuración", sección
  propia (no mezclada con Configuración), lazy-loaded con `Suspense` igual que el resto de rutas
- Estados de UI completos en `MarketingPage.tsx`: loading (`LoadingState`), error (`ErrorState` con
  retry → `refetch`), vacío ("Todavía no enviaste ninguna campaña")
- `useSendBroadcast` invalida `['marketing', 'broadcast-history']` en `onSuccess` — el historial se
  refresca tras cada envío (confirmado por test y por la verificación manual: la fila del broadcast
  de curl apareció en el `GET` inmediatamente después)

❌ Falló:
- Ninguno de los puntos críticos del checklist

⚠️ Riesgos / casos borde no cubiertos:
- Sin límite de longitud en `title`/`body` (ni en el frontend ni en el DTO real del backend); FCM sí
  tiene límites propios de payload (~4KB) que no se probaron en el caso límite
- Sin preview de audiencia antes de confirmar el envío — el admin solo ve `sent`/`total` después de
  enviar, no una estimación previa de cuántos dispositivos lo recibirán
- No se verificó con credenciales Firebase reales que el push llega de verdad al dispositivo — la
  verificación cubre el contrato HTTP y el guardado en historial, no la entrega final de FCM (fuera
  del alcance de este panel; el backend garantiza que nunca lanza aunque el envío real falle)
- Gap de E2E real vía navegador: no se probó con Playwright el flujo completo por clic real (login →
  sidebar → formulario → confirmación → fila nueva en la tabla). La verificación de ruta/sidebar fue
  por lectura de código + `build`/`test` verdes, no por interacción real en un navegador

Veredicto: LISTO PARA MARCAR COMPLETO

