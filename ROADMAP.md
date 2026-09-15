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
- [x] **Catálogo de salsas/cremas + selección por producto.** El backend
      agregó un módulo `sauces` (`GET/POST /sauces`, `PATCH/DELETE /sauces/:id`) y `MenuItem` gana
      `sauces: Sauce[]` + `sauceIds?: string[]` en create/update — confirmado contra
      `src/modules/sauces/` y `src/modules/menu/` reales del backend, `api.d.ts` regenerado con
      `pnpm run generate:types` contra el swagger real. Nueva tercera pestaña "Salsas" en
      `MenuPage.tsx` (`features/menu/sauces/`: `hooks.ts`, `SauceForm.tsx`, `SaucesSection.tsx` —
      mismo patrón CRUD que Categorías, con el mismo fix de "id solo en el path del PATCH" ya
      aplicado desde el inicio, cubierto en `hooks.test.tsx`). `ItemForm.tsx` gana un checklist de
      checkboxes (mismo patrón que `daysOfWeek` en `BannerForm.tsx`) con todas las salsas del
      catálogo — las inactivas se muestran igual (marcadas "(oculta)") si el producto ya las tenía
      asignadas, para no perder la relación al editar sin querer; sin salsas en el catálogo
      todavía, mensaje explícito señalando la pestaña "Salsas". `type-check`/`lint`/`build`
      limpios, 100/100 tests (19 archivos). **Verificado con Playwright contra el backend local
      real** (no solo tests): login real, crear una salsa nueva desde la UI y verla en la tabla,
      editar "Arroz Chaufa" (checklist sin marcar, como corresponde) y "Celtas Burguesa Clásica"
      (checklist con "Mostaza" pre-marcada según la relación real ya guardada) — capturas
      confirmadas visualmente, sin errores de consola.
      **Veredicto de @tester: LISTO** (2026-08-26, pase independiente): `type-check`/`lint`/`build`
      limpios repetidos, contrato confirmado línea por línea contra `src/modules/sauces/` y
      `src/modules/menu/` reales de `backend-celtas` (DTOs `PartialType` sin `id`, `ValidationPipe`
      con `forbidNonWhitelisted`, `sauceIds?` con `@IsUUID('4', { each: true })`, `menu.service`
      resuelve `item.sauces` solo si `sauceIds !== undefined`). **Verificado por mutación (3
      mutaciones independientes, todas revertidas con `git checkout`)**: (a) revertir `useUpdateSauce`
      a mandar `id` en el body → `hooks.test.tsx` falla 2/5; (b) romper el sufijo "(oculta)" en
      `ItemForm.tsx` → falla 1/5 del test nuevo; (c) romper el prefill de `defaultValues.sauceIds`
      → falla 2/5. `ItemForm.test.tsx` (nuevo, 5 tests) cubre: salsa inactiva ya asignada visible
      "(oculta)" y pre-marcada con su id conservado en el payload, catálogo vacío → mensaje a la
      pestaña "Salsas", `sauceIds` siempre `string[]`, alta/baja de salsa, y guardado con el
      catálogo en error. Suite completa `--maxWorkers=2`: 221/221 (34 archivos). Riesgos no
      bloqueantes en `docs/testing-checklist.md` (sección "Auditoría: Menu — Salsas"): flakiness
      pre-existente de la suite bajo parallelism por defecto (saturación de CPU, no lógica);
      `ItemForm.tsx` lista todas las salsas inactivas del catálogo, no solo las ya asignadas
      (no pierde relaciones, pero permite asignar una oculta a un producto nuevo); `header`/JSDoc
      de `MenuPage.tsx` desactualizados con la 3ª pestaña (solo texto); sin E2E/Playwright del lado
      de @tester; sin test de `SaucesSection.tsx` como página end-to-end (mismo hueco que
      `CategoriesSection`/`ItemsSection`).
- [x] **Toggle "canjeable con estrellas" en la lista de productos** (`MenuItem.redeemableWithStars:
      boolean`, backend deployado): confirmado contra el código fuente real de `backend-celtas`
      (`menu-item.entity.ts` línea 54-55, `@Column({ type: 'boolean', default: false })` — el
      catálogo de canje del cliente es `redeemableWithStars = true AND available = true`, sin
      entidad aparte). `useToggleItemRedeemableWithStars` es un hook hermano de
      `useToggleItemAvailable` (mismo `PATCH /menu/items/:id`, no optimista); `ItemsSection.tsx`
      gana una columna "Canjeable" con su propio `Switch` y su propio estado de "toggling"
      (`togglingRedeemableId`), independiente del de "Disponible" — las dos mutaciones no se
      bloquean entre sí. Fuera de alcance a propósito: `ItemForm.tsx` (el diálogo de crear/editar)
      no tiene este campo, mismo criterio que `available`, que tampoco está ahí — el switch es solo
      desde la lista, después de creado el producto. **Veredicto de @tester: LISTO** (`type-check`,
      `lint`, `build`, `test` 212/212 en 31 archivos, todo repetido de forma independiente; confirmó
      leyendo el código que `togglingId`/`togglingRedeemableId` son mutaciones y estados totalmente
      separados, y que `menu.service.ts updateItem()` usa `repository.merge()` — un PATCH parcial
      nunca pisa otros campos). Riesgo no bloqueante señalado por @tester: sin test de componente de
      `ItemsSection.tsx` para esta columna (tampoco lo tenía la de "Disponible").
- [x] **Catálogos de Bebidas y Porciones Extras + checklist por producto** (`GET/POST /beverages`,
      `PATCH/DELETE /beverages/:id`, `GET/POST /extra-portions`, `PATCH/DELETE /extra-portions/:id`,
      backend deployado): mismo patrón CRUD que Salsas, con `price` (número > 0, máx. 2 decimales,
      espejo de `CreateBeverageDto`/`CreateExtraPortionDto`). `MenuItem` gana `beverages[]`,
      `beverageGroupRequired`, `beverageGroupMaxSelectable`, `extraPortions[]`,
      `extraPortionsGroupRequired`, `extraPortionsGroupMaxSelectable` — confirmado contra el código
      fuente real de `backend-celtas` (`src/modules/{beverages,extra-portions,menu}`, no solo
      Swagger). `ItemForm.tsx` gana dos checklists nuevos (mismo patrón que salsas: inactivas ya
      asignadas se muestran "(oculta)" y pre-marcadas, catálogo vacío → mensaje a la pestaña
      correspondiente) más un switch "Obligatorio" y un input "Máximo a elegir" por grupo. Bug de
      clase corregido de paso: `noValidate` agregado a los `<form>` de `ItemForm`/`SauceForm`/
      `CategoryForm`/`BeverageForm`/`ExtraPortionForm` (la validación nativa del navegador en los
      `<input type="number">` bloqueaba el submit antes de que Zod mostrara su mensaje en español).
      **Veredicto de @tester: LISTO** — detalle completo, mutaciones y hallazgos en
      `docs/testing-checklist.md`, sección "Auditoría: Menu — Bebidas y Porciones Extras".

### 5. Pedidos
- [x] Listado paginado, filtro por estado
- [x] Vista de detalle de un pedido (items, dirección, link de WhatsApp)
- [x] Cambio de estado con los botones/acciones válidas según la transición (no mostrar botones
      de transiciones inválidas, ej. no ofrecer "entregado" si sigue en "pendiente")
- [x] **Tri-state de `selectedSauces` en el detalle de pedido**: el backend refinó
      `OrderItem.selectedSauces` a `string[] | null` con 3 estados reales (confirmado contra el
      código fuente real de `backend-celtas` — `order-item.entity.ts`, `orders.service.ts` y
      `orders.service.spec.ts`, no solo Swagger): `null` = no aplica (producto sin salsas
      ofrecidas, o pedido anterior a esta feature); `[]` = el cliente vio el selector y eligió
      explícitamente "Sin salsas"; `string[]` con nombres = las salsas elegidas. Antes de este
      fix, `[]` no mostraba nada en el panel (se trataba igual que `null`). `types.ts` documenta
      el campo con doc-comment explicando el tri-state; `OrderDetailDialog.tsx` agrega una línea
      bajo cada item (`text-muted-foreground text-xs italic`): nada si `null`, "Sin salsas" si
      `[]`, "Salsas: X, Y" si tiene nombres — sin tratarlo como truthy check en ningún punto.
      **Verificado por @tester**: contrato confirmado de forma independiente contra el código
      fuente real del backend (`order-item.entity.ts`, `orders.service.ts` líneas 397-402 del
      mensaje de WhatsApp, `orders.service.spec.ts` líneas 296-319), no solo de palabra.
      `type-check`, `lint` y `build` en verde; suite completa 102/103 (único fallo:
      `BannersPage.test.tsx` por timeout, flaky pre-existente no relacionado a este cambio,
      confirmado que pasa aislado, 3/3). **Verificado con mutación**: cambié la condición de
      `item.selectedSauces !== null` a un truthy check (`item.selectedSauces &&
      item.selectedSauces.length > 0`) en `OrderDetailDialog.tsx` — reproduce el bug original
      (colapsa `[]` con `null`) — y el test del caso `[]` de `OrderDetailDialog.test.tsx` FALLÓ
      exactamente como se esperaba (1 failed | 2 passed, falla en
      `expect(screen.getByText('Sin salsas')).toBeInTheDocument()`); restauré el fix y volvió a
      3/3.
- [x] **`OrderItem.comment` en el detalle de pedido**: el backend agregó `comment: string | null`
      a cada item del pedido (comentario libre del cliente, ej. "sin cebolla", snapshot al crear
      el pedido, aplica a las `quantity` unidades — NO es tri-state como `selectedSauces`, solo
      `null`/texto). Confirmado contra el código fuente real de `backend-celtas`
      (`order-item.entity.ts` línea 73-74, `orders.service.ts` `resolveComment()` que trimea y
      normaliza vacío/solo-espacios a `null`). `types.ts` documenta el campo; `OrderDetailDialog.tsx`
      agrega la línea (mismo patrón visual `text-muted-foreground text-xs italic` que
      `selectedSauces`) con `item.comment !== null`, no truthy check. **Verificado por @tester**:
      `type-check`, `lint`, `test` (23 archivos / 127 tests) y `build` en verde de forma
      independiente; diff de `OrderDetailDialog.tsx` y `api.d.ts` confirmado contra `git diff`.
      **Verificado con mutación**: eliminé el bloque nuevo de `OrderDetailDialog.tsx` y el test
      "comment con texto..." de `OrderDetailDialog.test.tsx` FALLÓ exactamente como se esperaba;
      restauré el archivo y la suite relevante volvió a 8/8.
- [x] **Fila "Cupón" en el desglose de precios del detalle de pedido**: `Order` no expone el
      descuento ni el código del cupón, así que `orderDiscount()` (nueva, `orders-utils.ts`) lo
      deriva del mismo despeje algebraico que usa el backend para `total`
      (`subtotal - total + deliveryFee`), redondeado a 2 decimales. `OrderDetailDialog.tsx` agrega
      la fila entre "Subtotal" y "Envío", solo si `discount > 0.01` (umbral para no mostrarla por
      ruido de redondeo cuando no hubo cupón), con signo negativo. Sin cambios de tipos ni de
      backend. **Verificado por @tester contra el código fuente real de `backend-celtas`**
      (`../backend-celtas`, sí es accesible desde este entorno): `orders.service.ts` líneas 98-121
      (`subtotal = round2(...)`, `total = round2(discountedTotal + deliveryFee)`,
      `discountAmount = round2(subtotal - discountedTotal)`) y `coupons.service.ts`
      `applyDiscount()` (línea 492-499, NO redondea el `discountedTotal` intermedio) — el despeje
      del frontend coincide algebraicamente con el cálculo real del backend, con una diferencia
      teórica de hasta un centavo en casos límite de doble redondeo (riesgo menor, no bloqueante).
      `type-check`, `lint`, `build` y suite de Orders (36/36) en verde. **Verificado con
      mutación (2 mutaciones independientes)**: (1) quité el término `+ order.deliveryFee` de
      `orderDiscount()` → 3 de 4 tests nuevos de `orderDiscount` en `orders-utils.test.ts`
      FALLARON exactamente como se esperaba, y el fallo se propagó al test de la fila "Cupón" en
      `OrderDetailDialog.test.tsx` (4 tests fallando en total); restauré el archivo, diff
      confirmado idéntico al original (12 líneas agregadas). (2) forcé la condición del render a
      `{false ? ... : null}` en `OrderDetailDialog.tsx` → el test "pedido CON cupón" FALLÓ como se
      esperaba (no encontró el texto "Cupón"), el de "SIN cupón" siguió pasando; restauré el
      archivo, diff confirmado idéntico al original (14 inserciones/1 eliminación). Tests nuevos:
      4 en `orders-utils.test.ts` (sin cupón, con cupón, redondeo de punto flotante, sin cupón ni
      envío) + 2 en `OrderDetailDialog.test.tsx` (fila oculta sin cupón, fila visible con monto
      negativo en el orden Subtotal → Cupón → Envío → Total).
- [x] **"Cancelar pedido" desde el estado "en camino", con motivo obligatorio**: el backend
      agregó `cancelReason?: string` (`@IsString`, `MaxLength(500)`) a `UpdateOrderStatusDto` y
      permite la transición `en_camino → cancelado`, exigiendo el motivo con un 400 (`"Debes
      indicar un motivo para cancelar un pedido que ya está en camino"`) solo en ese caso —
      confirmado contra el código fuente real de `backend-celtas` (`dto/update-order-status.dto.ts`,
      `orders.service.ts` líneas 271-296 —`VALID_TRANSITIONS[EN_CAMINO] = [ENTREGADO, CANCELADO]`,
      el chequeo de `!dto.cancelReason?.trim()` solo cuando `order.status === EN_CAMINO`, y
      `order.cancelReason` como columna `text` nullable en `order.entity.ts`). **Nota de contrato**:
      el Swagger desplegado en `onrender.com` todavía NO expone `cancelReason` (la instancia de
      prod va detrás del commit local `06b6968`); `pnpm run generate:types` se corrió igual y trajo
      cambios reales no relacionados (`UsersController_clearFcmToken`, descripción de
      `/rewards/catalog`), pero `cancelReason` se tipó a mano en `orders/types.ts` y en el payload
      del hook, consistente con el resto del módulo (`types.ts`: "Swagger no documenta los schemas").
      `status.ts`: `VALID_ORDER_TRANSITIONS.en_camino` pasa a `['entregado', 'cancelado']` (espejo
      exacto del backend). `hooks.ts`: `useUpdateOrderStatus` acepta `cancelReason?` opcional y lo
      incluye en el body del PATCH solo si viene con texto (`id` sigue solo en el path).
      `OrderDetailDialog.tsx`: `handleTransition` abre un diálogo anidado (mismo patrón que
      "Eliminar categoría/producto": `<Dialog>` controlado por estado, `Textarea` + `Label`,
      `DialogFooter` con "Volver" outline y "Cancelar pedido" destructive deshabilitado hasta que
      el motivo `.trim()` no esté vacío) SOLO cuando `next === 'cancelado' && order.status ===
      'en_camino'`; al confirmar llama `updateStatus.mutateAsync({ id, status: 'cancelado',
      cancelReason })`. Cancelar desde pendiente/confirmado es idéntico a antes (directo, sin
      diálogo). Si el pedido ya está `cancelado` y tiene `cancelReason`, se muestra bajo el badge
      de estado ("Motivo de cancelación: …"). Tests: nuevo `orders/hooks.test.tsx` (3 casos: id
      solo en path + solo `status` sin motivo, `cancelReason` en el body con texto,
      `cancelReason` vacío se omite) y 6 casos nuevos en `OrderDetailDialog.test.tsx` (diálogo
      aparece solo en `en_camino → cancelado`, botón deshabilitado con motivo vacío / habilitado al
      escribir, envía `status` + `cancelReason` trimeado en el PATCH, `pendiente`/`confirmado →
      cancelado` siguen directos sin diálogo ni `cancelReason`, motivo visible en el detalle de un
      pedido ya cancelado). `type-check`, `lint`, `build` y `test` (35 archivos / 230 tests) en
      verde. **Veredicto de @tester: LISTO** (pase independiente): contrato reconfirmado línea por
      línea contra `../backend-celtas` real (`dto/update-order-status.dto.ts` `cancelReason?: string`
      `@IsOptional/@IsString/@MaxLength(500)`; `orders.service.ts` `VALID_TRANSITIONS[EN_CAMINO] =
      [ENTREGADO, CANCELADO]` y el 400 solo cuando `status===CANCELADO && order.status===EN_CAMINO
      && !dto.cancelReason?.trim()`; `order.entity.ts` `cancelReason` columna `text` nullable).
      `type-check`/`lint`/`build`/`test` (230/230, 35 archivos) en verde, repetidos antes y después
      de las mutaciones. **Verificado por mutación (6 mutaciones independientes, Edit puntual +
      reverso, sin `git checkout` para no perder el resto del diff)**: (1) `status.ts`
      `en_camino: ['entregado']` → 3 tests fallan; (2) `hooks.ts` body con `cancelReason` fijo en
      vez del spread condicional → `hooks.test.tsx` 2/3 fallan; (3) `handleConfirmCancel` sin
      `.trim()` → falla el test del payload trimeado; (4) botón confirmar sin la condición de motivo
      vacío en `disabled` → falla el test del botón deshabilitado; (5) guard de `handleTransition`
      neutralizado → 3 tests del diálogo `en_camino` fallan; (6) bloque de display del motivo
      neutralizado → falla el test del detalle de un pedido ya cancelado. Tras restaurar,
      `git diff --stat` vuelve idéntico (`318 insertions(+), 7 deletions(-)`). Detalle y riesgos
      no bloqueantes (orden de deploy backend-primero, "Volver" no deshabilitado durante la
      mutación, 500 chars solo por `maxLength` nativo, sin E2E) en
      `docs/testing-checklist.md`, sección Orders.
  - [x] **Vuelta de pulido — cierre de los 3 riesgos de bajo impacto** (solo UI/a11y, sin tocar el
        contrato con el backend): (1) el botón "Volver" del diálogo de motivo ahora lleva
        `disabled={updateStatus.isPending}` — ya no cierra el diálogo con la mutación en vuelo;
        (2) el botón trigger de la transición `cancelado` recibe `aria-hidden={cancelPromptOpen}` +
        `tabIndex={cancelPromptOpen ? -1 : undefined}` para no duplicar el nombre accesible
        "Cancelar pedido" mientras el diálogo está abierto (el texto de los botones NO cambió);
        (3) contador `{cancelReason.length}/500` bajo el `Textarea` (`text-muted-foreground
        text-right text-xs`), el `maxLength={500}` nativo sigue siendo el límite duro. 3 tests
        nuevos en `OrderDetailDialog.test.tsx` (Volver deshabilitado con `isPending` + `rerender`;
        el trigger `cancelado` gana `aria-hidden="true"` + `tabindex="-1"` al abrir el diálogo —
        aserción directa sobre el nodo del `<button>`, no conteo de `getAllByRole`; contador
        `0/500` → `3/500` al escribir "abc"); los tests previos con `getAllByRole(...).at(-1)`
        siguen pasando sobre un array de 1. `type-check`/`lint`/`build` limpios, `test` 233/233
        (35 archivos; suite paralela con flakiness pre-existente en `ItemForm.test.tsx` y
        `DeliverySettingsCard.test.tsx`, ambos verdes en aislado y ajenos).
        **1ª ronda de @tester: NO LISTO** — el test del cambio (2) no fallaba al revertir el fix
        (Radix ya saca el trigger de la a11y tree con `hideOthers`, así que el conteo de
        `getAllByRole` daba length 1 con o sin el atributo). **Corregido**: el test se reescribió
        para afirmar `toHaveAttribute('aria-hidden', 'true')` / `toHaveAttribute('tabindex', '-1')`
        directamente sobre el nodo del trigger; verificado por mutación que ahora FALLA al revertir
        `aria-hidden`/`tabIndex` y vuelve a 27/27 al restaurar. Cambios (1) y (3) ya estaban OK por
        mutación. **2ª ronda de @tester: LISTO** — re-corrió `type-check`/`lint`/`build`/`vitest run
        src/features/orders` (48/48) y confirmó por mutación que el test reescrito ahora FALLA en
        `toHaveAttribute('aria-hidden', 'true')` al revertir las props del trigger y vuelve a 27/27
        al restaurar; los 9 tests del `describe` de cancelación (incluidos los `getAllByRole(...)
        .at(-1)`) en verde. Riesgos abiertos sin cambio: orden de deploy (backend primero), sin E2E,
        contador `0/500` puramente informativo.

### 5.1 Infraestructura de tests
- [x] Vitest + React Testing Library + jsdom instalados y configurados (script `pnpm run test`,
      setup en `src/test/setup.ts`, config en `vitest.config.ts`)
- [x] Test de regresión del merge de `onOrderUpdated` en Pedidos: el PATCH devuelve el pedido
      sin `items` y el detalle debe conservarlos (`src/features/orders/merge.ts` +
      `merge.test.ts`) — verificado que FALLA si se revierte el fix
- [x] Convención de testing documentada en la skill `react-celtas` (dónde viven los tests y la
      regla de no dejar sin test la lógica de datos que ya mordió con un bug real)
- [x] Test de los 3 casos del tri-state de `selectedSauces` (`OrderDetailDialog.test.tsx`, nuevo):
      `null` → no aparece texto de salsas, `[]` → aparece "Sin salsas", con nombres → aparece
      "Salsas: X, Y" — **verificado por @tester con mutación**: el caso `[]` FALLA si el código
      vuelve a colapsarlo con `null` (bug original que motivó el refinamiento del backend);
      `merge.test.ts` sigue pasando 3/3 con `selectedSauces: null` agregado a su `makeItem()` base

### 6. Cupones
- [x] Listado paginado, filtro por status
- [x] Formulario de generación manual (campaña), respetando el límite de 100% en `percentage`
- [x] Ver cupones de un usuario específico — el backend agregó el filtro `userId` a `GET /coupons`
      (confirmado contra `/docs-json` y regenerado con `pnpm run generate:types`). Se consume desde
      el detalle de usuario (módulo 9) con `useCoupons(page, limit, status, userId)`.
- [x] **Campaña masiva de cupones** (`POST /coupons/generate-bulk`, backend deployado): contrato
      confirmado en `src/types/api.d.ts` (regenerado con `pnpm run generate:types`) y contra el
      código fuente real de `celtas-backend` (`generate-bulk-coupon.dto.ts` y
      `CouponsService.generateBulk()` en `coupons.service.ts` — Swagger documenta la respuesta
      como `unknown`, el código confirma `Promise<{ count: number }>`, un cupón por cada usuario
      con role `cliente`, admins excluidos). `CouponsPage` ahora abre un diálogo con `Tabs`
      ("Cupón individual" / "Campaña para todos los clientes"); el tab nuevo es
      `GenerateBulkCouponForm.tsx` con discountType, discountValue (mismo límite de 100% para
      `percentage` que el form individual), campaignName (requerido), expiresAt (`DatePicker`
      opcional — vacío = default automático del backend) y minPurchaseAmount (opcional, misma
      normalización `''`/`0` → `null` que el form individual). **Confirmación explícita antes de
      mutar**: el submit del formulario NO llama a la API directamente — muestra un panel de
      confirmación con el resumen de la campaña y el texto exacto pedido ("¿Confirmas generar
      cupones para todos los clientes? ... Esta acción no se puede deshacer"); solo el botón "Sí,
      generar cupones" dispara `mutateAsync`. El resultado (`count`) se muestra en un alert de
      éxito. `GenerateCouponForm` (individual) gana un prop opcional `defaultUserId` para
      prellenar el UUID (usado por Top Usuarios, módulo 9), sin romper su uso previo.
      **Verificado por @tester con mutación independiente**: rompió el fix de la confirmación
      (submit directo a `mutateAsync`, saltándose el panel) y 4/6 tests de
      `GenerateBulkCouponForm.test.tsx` fallaron como se esperaba; restauró el fix y 6/6 volvieron
      a pasar. El panel de confirmación reemplaza por completo el `<form>` mientras está activo
      (no hay ningún `<form>` en ese árbol) — no hay ruta de teclado (Enter) ni de doble-submit
      que dispare la mutación sin el clic explícito. **Veredicto final de @tester: LISTO**
      (`type-check`, `lint`, `test` 95/95 en 18 archivos, `build`, todo repetido de forma
      independiente). Detalle completo en `docs/testing-checklist.md` (sección Coupons +
      reporte de auditoría).

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
- [x] **Nueva mejora**: Campo `daysOfWeek` (array de enteros 0-6, 0=domingo...6=sábado).
      Formulario: 7 checkboxes con labels Dom/Lun/Mar/Mié/Jue/Vie/Sáb. Si no hay selección,
      envía `null` (todos los días). Listado: muestra "Mar, Jue" para días múltiples, "Dom"
      para un solo día, o nada para todos los días. `getBannerVigencia`: integra el día de
      hoy en Lima — si el banner tiene fechas válidas pero hoy no está en su `daysOfWeek`,
      muestra "programado" en lugar de "vigente". Verificado contra checklist de QA.


- [x] **Botón "Limpiar fecha" en `BannerForm.tsx`** (startDate/endDate) — corregido el bug raíz
      que hacía que el "completo" reportado antes fuera falso: el backend hace
      `bannersRepository.merge(banner, dto)` en el `update()` (TypeORM), y
      `PlainObjectToNewEntityTransformer` solo copia una clave si
      `objectColumnValue !== undefined` — si el payload OMITE `startDate`/`endDate` en vez de
      mandar `null` explícito, el merge deja la fecha vieja intacta aunque el form se vea
      vacío. `BannerForm.tsx` ahora siempre incluye la clave en el payload
      (`startDate: values.startDate ? ... : null`, igual `endDate`); `DatePicker.tsx` tiene un
      botón "X" (visible solo con valor y no disabled) con `clearLabel` configurable.
      **Verificado por @tester de forma independiente**: contra el código fuente real de
      `celtas-backend` (`banners.service.ts`, `PlainObjectToNewEntityTransformer.js` en
      `node_modules/typeorm`, `IsOptional.js` de `class-validator` y el manejo de `null` en
      `TransformOperationExecutor.js` de `class-transformer` — `null` no se transforma a
      `new Date(null)`, pasa intacto); mutación del fix en `BannerForm.tsx` confirma que el
      test nuevo (`BannerForm.test.tsx`, describe "BannerForm limpiar fecha") FALLA sin el fix
      (`expected undefined... to have property "startDate" with value null"`). Test adicional
      en `DatePicker.test.tsx` (3 tests, componente aislado) confirma que la X no abre el
      calendario, que el botón no aparece sin valor, y que limpiar con el popover ya abierto
      también lo cierra (`setOpen(false)` agregado al handler de la X tras un hallazgo de
      @tester donde quedaba abierto — corregido y re-verificado con la suite completa en verde,
      15 archivos / 78 tests).

- [x] **Fix visual en columna "Fechas" del listado** (`BannersPage.tsx`) — dos bugs reportados
      por el usuario, tratados por separado porque solo uno resultó ser un bug de código:
      1. **Concatenación sin separador**: "Sin fechas" y los días de la semana (`daysOfWeek`)
         se leían como "Sin fechasMar, Jue" en una sola línea, dos conceptos independientes
         (rango de vigencia vs. recurrencia semanal) mezclados como si uno contradijera al
         otro. Confirmado en el código real: `'Sin fechas'` era texto plano hermano directo
         del `<span>` de días, sin salto de línea entre ambos. Fix: ambos ahora son `<span>`
         independientes dentro de un `<div className="flex flex-col gap-0.5">`, siempre en
         líneas separadas. Se extrajo el formateo del rango a una función pura nueva,
         `formatBannerDateRange` (`banner-utils.ts`), siguiendo la convención del proyecto de
         no dejar lógica de datos sin testear en el JSX.
      2. **Reportado "startDate real truncado a `…`"**: NO era un bug de frontend — confirmado
         con el JSON crudo real (`GET /banners/:id`) del banner que originó el reporte ("carnes
         saltados", id `1b3aa96d-...`): `startDate: null`, `endDate: "2026-08-15T04:59:59.999Z"`.
         El `"…"` se estaba mostrando correctamente para un `startDate` que de verdad es `null`
         en la base de datos — no había nada que renderizar. Antes de tocar código se había
         escrito un test de repro contra `BannersPage.tsx` sin modificar, con un banner con
         `startDate`/`endDate` reales — el resultado en el DOM fue `"31/07/2026 → 14/08/2026"`,
         ambas fechas visibles, confirmando que la rama `'…'` del ternario solo se dispara si el
         campo correspondiente es `null`. La causa raíz del dato faltante es el bug de `merge()`
         de TypeORM ya documentado arriba y corregido hoy mismo (botón "Limpiar fecha"): este
         banner se editó antes de ese fix y perdió su `startDate` en un guardado previo donde el
         payload omitía la clave en vez de mandar `null` explícito. Con el fix actual (siempre
         se envía la clave, con `null` si está vacía) esto no puede volver a pasar. No se
         requiere ninguna acción de código para este punto — se documenta el hallazgo y se deja
         el test de regresión como guardia.
      Tests de regresión: `banner-utils.test.ts` (describe `formatBannerDateRange`, 4 casos:
      sin fechas, ambas reales sin `…`, solo `endDate` real, solo `startDate` real) y
      `BannersPage.test.tsx` (archivo nuevo, 3 tests: separación visual en elementos
      distintos dentro de un contenedor `flex-col`, ambas fechas reales visibles sin `…`, y
      caso borde sin fechas ni días → una sola línea). **Verificado por @tester de forma
      independiente**: `type-check`, `lint`, `test` (85/85, 16 archivos) y `build` en verde;
      el test de `BannersPage.test.tsx` se confirmó que FALLA sin el fix (`git stash` de solo
      `BannersPage.tsx`, dejando `banner-utils.ts` con el fix) — repite el patrón de mutación ya
      usado en el fix de "Limpiar fecha". @tester detectó en una primera pasada un import
      estático muerto en `BannersPage.test.tsx` que rompía `type-check`/`lint`/`build` (aunque
      `vitest run` solo no lo detectaba) — corregido y re-verificado.
      **Veredicto final de @tester: LISTO** (segunda ronda, independiente de la primera):
      repitió el pipeline completo desde cero (`type-check`, `lint`, `test` 85/85, `build`) y
      la mutación con `git stash` del test de regresión, todo en verde.
      **Nota de proceso**: @tester señaló que este checklist se marcó `[x]` antes de recibir su
      veredicto final de la segunda ronda — el contenido resultó correcto al verificarlo, pero
      la regla del proyecto es no marcar completo hasta el veredicto, no en anticipación. Queda
      registrado para no repetir el orden en el próximo módulo.

### 7.1 Programa de Estrellas — promociones ("estrellas dobles")
- [x] CRUD admin de `StarPromotion` (`src/features/star-promotions/`), sin `DELETE`, sin reorder y
      sin imagen (más simple que Banners): `GET/POST /star-promotions`, `GET/PATCH /star-promotions/:id`.
      Contrato confirmado línea por línea contra el código fuente real de `backend-celtas`
      (`rewards/entities/star-promotion.entity.ts`: columna `date` con transformer que expone/recibe
      siempre string plano `YYYY-MM-DD`, nunca `Date` — a diferencia de Banners, que sí guarda
      timestamps; `rewards/dto/create-star-promotion.dto.ts`/`update-star-promotion.dto.ts`: `label`,
      `multiplier` 0.01-99.99 con hasta 2 decimales, `startDate`/`endDate` OBLIGATORIAS (a diferencia
      de Banners, donde son opcionales) con `@IsDateString`, `active` opcional default `true`;
      `rewards/dto/is-star-promotion-date-range-valid.ts`: `startDate <= endDate`, comparación
      lexicográfica directa; `rewards/star-promotions.controller.ts`: solo GET/GET:id/POST/PATCH:id,
      rol admin; `rewards/star-promotions.service.ts`: mensaje EXACTO del 400 de solapamiento con
      otra promoción activa, `"Ya existe una promoción activa en ese rango de fechas"`).
      `StarPromotionForm.tsx` mapea cualquier 400 que contenga la palabra "fechas" (case-insensitive)
      al campo `endDate` con `setError`, el resto cae a error general del form. Página
      `StarPromotionsPage.tsx`: tabla sin paginar (Etiqueta, Multiplicador, Vigencia formateada,
      Estado con `Badge` activa/inactiva, solo botón "Editar" — no existe DELETE). Ruta
      `/star-promotions` y nav item "Estrellas" (ícono `Star`) registrados junto a Banners.
      **Verificado por @tester con mutación real (dos fixes)**: (a) `useUpdateStarPromotion` — id
      solo en el path — revirtió a incluir `id` en el body y los 2/2 tests de `hooks.test.tsx`
      FALLARON como se esperaba; restauró y quedaron en verde. (b) mapeo de error "fechas" →
      `endDate` — no tenía test, @tester creó `StarPromotionForm.test.tsx` (3 tests) y confirmó que
      FALLA si se rompe el regex; restauró y 3/3 en verde. `type-check`, `lint`, `build`, `test`
      (212/212 en 31 archivos) todo repetido de forma independiente. **Veredicto final de @tester:
      LISTO**. Riesgos no bloqueantes documentados en `docs/testing-checklist.md`: el mensaje real
      de `assertValidDates` (defensa en profundidad del backend,
      `"startDate debe ser anterior o igual a endDate"`) no contiene "fechas" y caería a error
      general si llegara a la API (inalcanzable en el flujo normal porque el `superRefine` del
      cliente ya bloquea ese caso antes del submit); sin test de componente de
      `StarPromotionsPage.tsx`; sin prueba E2E contra el backend real desplegado; sin validación
      explícita en cliente del límite de 2 decimales de `multiplier`.
- [x] **Nota de proceso**: @tester detectó que `src/types/api.d.ts` había quedado desactualizado
      respecto a producción — `redeemableWithStars` y `/star-promotions` ya estaban en el Swagger
      real (`https://backend-celtas.onrender.com/docs-json`) pero no en el archivo generado,
      incumpliendo la regla del proyecto de correr `pnpm run generate:types` antes de tocar
      componentes. No causó ningún bug (los tipos escritos a mano en `types.ts` coinciden con el
      backend real, verificado línea por línea), pero se corrigió corriendo `generate:types` (diff
      de 420 líneas, solo adiciones) y repitiendo `type-check`/`lint`/`test` (212/212)/`build` en
      verde después del cambio.
- [x] **Hitos configurables del tablero (`RewardMilestone`) + premio especial
      (`MenuItem.specialReward`)**: el backend reemplazó el setting fijo `estrellas_por_premio`
      (eliminado de `settings.service.ts`) por hitos configurables con DELETE real —
      `RewardRedemption` guarda su propio snapshot del umbral (`milestoneStars`/`isSpecial`), no
      una FK, así que borrar/editar un hito nunca corrompe premios ya otorgados. Contrato
      confirmado línea por línea contra el código fuente real de `backend-celtas`
      (`rewards/entities/reward-milestone.entity.ts`, `dto/create-reward-milestone.dto.ts`,
      `dto/update-reward-milestone.dto.ts`, `reward-milestones.controller.ts/.service.ts`;
      `menu/entities/menu-item.entity.ts` para `specialReward`). Nuevo feature
      `src/features/reward-milestones/` (mismo patrón que `star-promotions/`, con
      `useDeleteRewardMilestone` real): `GET/POST/PATCH/DELETE /reward-milestones`, `starsRequired`
      entero único, `isSpecial` boolean. `RewardMilestoneForm.tsx` mapea el 400 exacto de colisión
      (`"Ya existe un premio configurado para esa cantidad de estrellas"`, regex `/premio
      configurado/i`) al campo `starsRequired`. `StarPromotionsPage.tsx` convertida en shell de
      tabs (mismo patrón que `MenuPage.tsx`: "Promociones"/"Hitos"), ruta y nav item sin cambios;
      el contenido original se extrajo tal cual a `PromotionsSection.tsx`. `ItemsSection.tsx` gana
      columna "Especial" con `useToggleItemSpecialReward` (hermano de
      `useToggleItemRedeemableWithStars`, mismo patrón no optimista, estado de toggling
      independiente) — confirmado que los dos switches del producto NO son mutuamente excluyentes
      (`menu-item.entity.ts`: "un producto puede tener cualquier combinación de los dos
      switches"; lo excluyente es el catálogo devuelto por una sola consulta `GET
      /rewards/catalog`, no los dos campos del producto). `estrellas_por_premio` eliminado de
      `settings-utils.ts`/`EstrellasSettingsCard.tsx`/sus tests; la tarjeta ahora solo tiene "Soles
      por estrella" y una nota indicando que los premios se configuran en Estrellas → Hitos.
      `ItemForm.tsx` NO se tocó (mismo criterio que `redeemableWithStars`, fuera de alcance a
      propósito). **Verificado por @tester con mutación real (dos fixes)**: (a)
      `useUpdateRewardMilestone` — id solo en el path — revirtió a incluir `id` en el body y 2/2
      tests de `hooks.test.tsx` FALLARON como se esperaba; restauró y volvieron a pasar (`git diff
      --stat` = 0 líneas). (b) mapeo de error de colisión → `starsRequired`: rompió el regex y el
      test correspondiente de `RewardMilestoneForm.test.tsx` FALLÓ como se esperaba; restauró y
      volvió a pasar. `type-check`, `lint`, `build` y `test` (33 archivos/216 tests) repetidos en 3
      corridas completas independientes, sin ningún timeout — no reprodujo el flakiness
      intermitente por contención de CPU que había visto la sesión principal en 4 archivos
      preexistentes no relacionados a este cambio (mismo patrón ya root-causado para
      `BannersPage.test.tsx` en el módulo 7). **Veredicto final de @tester: LISTO PARA MARCAR
      COMPLETO**, con un hallazgo de documentación (no de lógica): el wording "catálogo
      exclusivo/EXCLUYENTE" heredado de los comentarios del backend describía la consulta `GET
      /rewards/catalog` (nunca devuelve la unión de ambos catálogos), no los dos campos del
      producto — corregido el wording de los doc-comments en `menu/types.ts` y
      `reward-milestones/types.ts` tras el reporte para que quede inequívoco. Riesgos no
      bloqueantes documentados en `docs/testing-checklist.md`: sin test de componente de la columna
      "Especial" (mismo hueco ya aceptado para "Canjeable"/"Disponible"); sin test de componente de
      `StarPromotionsPage.tsx`/`MilestonesSection.tsx` como interacción end-to-end de RTL; sin
      prueba E2E/Playwright contra backend real de este módulo.

### 8. Configuración (Settings)
- [x] Editor del número de WhatsApp (`GET`/`PATCH /settings`)
- [x] Gestión de roles de usuario (`PATCH /users/:id/role`) — con confirmación antes de degradar
      o promover a alguien, y el caso de "no puedes quitarte tu propio admin" reflejado en la UI
      (deshabilitar esa opción para el propio usuario logueado, no solo esperar el 400 del backend)
- [x] **Horario de atención del negocio** (`business_hours_schedule`, `business_manual_closed`,
      `business_manual_closed_reason` — mismo endpoint genérico `GET`/`PATCH /settings`, sin `id`
      en el body): contrato confirmado contra el código fuente real de `backend-celtas`
      (`settings.service.ts`, `settings.controller.ts`, `update-setting.dto.ts`), no solo Swagger.
      `BusinessHoursSettingsCard.tsx` — 7 filas con Switch "Cerrado" + `<Input type="time">` por
      día (`close <= open` es un cruce de medianoche VÁLIDO, ej. viernes 11:00→01:00, y no se
      rechaza; solo `open === close` se bloquea) y sección de cierre manual con Switch + motivo.
      `resolveManualClosedReason` reemplaza el motivo vacío por un default no vacío
      ("Cerrado temporalmente") **siempre** (switch encendido o no) para evitar el 400 real de
      `UpdateSettingDto.value` (`@IsNotEmpty()`) contra el seed real del backend
      (`business_manual_closed_reason: ''`). **Verificado por @tester con mutación real (dos
      fixes)**: (a) eliminó el bloque de `superRefine` que rechaza `open === close` →
      el test correspondiente de `BusinessHoursSettingsCard.test.tsx` FALLÓ como se esperaba
      (timeout esperando el mensaje de error que nunca aparece); restauró el fix y volvió a pasar;
      (b) hizo que el componente mandara `values.manualClosedReason` directo sin
      `resolveManualClosedReason` → agregó un test de regresión permanente que simula el primer
      guardado real (motivo nunca tocado, seed `''`) y confirma que el payload nunca es `''`; con
      la mutación aplicada el test FALLÓ reproduciendo el 400 real; restauró el fix y volvió a
      pasar. `type-check`, `lint`, `build` limpios; `test` 114/115 (único fallo: `BannersPage.test.tsx`
      por timeout, flaky pre-existente ya documentado, confirmado 3/3 aislado); los 22 tests de
      `src/features/settings/` (incluido el test nuevo) pasan 100%. Detalle completo (incluidos los
      riesgos de las 3 mutaciones secuenciales sin transacción) en `docs/testing-checklist.md`,
      sección "Configuración — Horario de atención". **Veredicto final de @tester: LISTO** (con el
      gap de E2E documentado explícitamente, no minimizado)
      - **Gap de E2E cerrado (2026-08-19)**: corrido contra el backend **local** real
        (`localhost:3000`, admin QA creado a mano en la BD por el usuario vía DataGrip,
        `qa-admin@local.test`) — nunca contra producción. Flujo completo por la UI real
        (`claude-in-chrome`, sin mocks): login real → `GET /settings` baseline capturado antes de
        tocar nada (horario ya variado por día, `manualClosed` ya en `false`) → editados los 7
        días a 11:00–23:00 → clic real en "Guardar horario" → alert "Horario guardado" visible →
        **navegación completa (no solo estado de formulario) y recarga de `/settings`** → los 7
        días siguen en 11:00–23:00 en el DOM → verificación independiente por `curl` (no por la
        misma UI que guardó) contra `GET /settings` y `GET /settings/business-hours`:
        `business_hours_schedule` con los 7 días exactos, `business_manual_closed: "false"`, y
        `business_manual_closed_reason: "Cerrado temporalmente"` — confirma en un flujo real (no
        mockeado) que `resolveManualClosedReason` sigue evitando el 400 de `@IsNotEmpty()` en el
        primer guardado real de un motivo nunca tocado. Las `description` de
        `business_manual_closed`/`business_manual_closed_reason` en la BD (sembradas con texto de
        prueba, ej. "QA nextChangeAt") quedaron corregidas al valor real tras el guardado, como
        corresponde al upsert. **Hallazgo aparte, no de este módulo**: `GET /settings` devuelve
        también la fila `secret_internal` (`value: "no-debe-salir"`) sin filtrar — no se tocó
        (vive en `celtas-backend`, fuera de este repo y fuera de alcance de este módulo), queda
        anotado para reportarlo por separado. El hallazgo ya conocido de `UpdateSettingDto.value`
        con `@IsNotEmpty()` (no se puede vaciar `business_manual_closed_reason` a `''` real vía
        PATCH) se deja igual solo anotado — decisión explícita: no se toca `celtas-backend` desde
        este repo.
      - **Flaky de `BannersPage.test.tsx` resuelto de raíz (2026-08-19)**: el test "banner sin
        fechas + con días..." (mencionado como flaky pre-existente en las dos entradas de arriba)
        NO era una condición de carrera real — fallaba consistentemente cerca o por encima del
        límite de 5000ms (5.3s–8.6s en varias reproducciones), no de forma aleatoria. Causa raíz:
        `BannersPage.test.tsx` era el único archivo de todo el repo que mockeaba su hook con
        `vi.resetModules()` + `vi.doMock('./hooks', ...)` + `await import('./BannersPage')` dentro
        de cada `it()`, en vez del patrón estándar (`vi.mock` hoisted a nivel de módulo + import
        estático). `vi.resetModules()` limpia el registro de módulos en runtime pero no el caché de
        *transform* de Vite/esbuild — así que el primer test del archivo pagaba, dentro de su propio
        timeout de 5000ms, el costo de transformar por primera vez todo el grafo de dependencias de
        `BannersPage` (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, los cientos de
        íconos de `lucide-react`, Radix Dialog, etc.); los tests 2 y 3 del mismo archivo, con el
        grafo ya transformado, corrían rápido. Bajo contención real de CPU (suite completa de 23
        archivos en paralelo) esto reproducía el timeout 3/3 veces. **Fix**: se reescribió
        `BannersPage.test.tsx` para seguir el patrón estándar del repo — `vi.mock('./hooks', ...)`
        hoisted con `useBannersMock` vía `vi.hoisted()`, import estático de `BannersPage`, y cada
        test cambia el mock con `useBannersMock.mockReturnValue(...)` en vez de re-mockear el
        módulo completo. Las tres aserciones de negocio no cambiaron (carácter por carácter
        idénticas al original). Solo se tocó el archivo de test — `BannersPage.tsx` y `hooks.ts`
        quedaron intactos. **Verificado**: archivo aislado, 5/5 corridas en verde (~3s totales,
        fase de tests en 107–133ms, vs 6.4s–8.6s solo para ese test antes); `type-check`, `lint`,
        `test` (125/125, 23/23 archivos) y `build` en verde. **Verificado por @tester de forma
        independiente**: reprodujo la causa raíz con un método más riguroso (suite completa bajo
        contención de CPU real, no solo aislado) — 3/3 fallos con el archivo original, 3/3 en verde
        con el fix, en 3 corridas con caché de Vite limpiada entre cada una. **Veredicto final de
        @tester: LISTO**.
- [x] **Umbrales del programa de estrellas** (`soles_por_estrella`/`estrellas_por_premio`, mismo
      patrón genérico `GET`/`PATCH /settings` que `DELIVERY_ALERT_RADIUS_METERS_KEY`, sembradas por
      el backend con default `"10"`/`"10"`): claves confirmadas carácter a carácter contra
      `settings.service.ts` real de `backend-celtas` (no contra `rewards.service.ts`, que solo las
      menciona en un doc-comment — precisión encontrada por @tester), `parseSolesPorEstrella`/
      `parseEstrellasPorPremio` caen al default `10` si el value falta o no es numérico positivo,
      igual al seed real. `EstrellasSettingsCard.tsx` — mismo esqueleto que `WhatsappSettingsCard.tsx`
      pero con dos campos numéricos, dos `upsertMutation.mutateAsync` secuenciales (uno por key).
      **Verificado por @tester**: `parseSolesPorEstrella`/`parseEstrellasPorPremio` no tenían ningún
      test (gap real no señalado inicialmente) — agregó 4 tests a `settings-utils.test.ts` y
      confirmó con mutación real que fallan si se rompe la condición del default (`&& parsed > 0`).
      `type-check`, `lint`, `build`, `test` (212/212 en 31 archivos) en verde de forma independiente.
      **Veredicto final de @tester: LISTO**. Riesgo no bloqueante: sin test de componente de
      `EstrellasSettingsCard.tsx` (mismo nivel de rigor que otras cards de Configuración).

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
- [x] **Top Usuarios** (`GET /users?sortBy=totalSpent&order=desc`, backend deployado): contrato
      confirmado en `src/types/api.d.ts` (`UsersController_listUsers.parameters.query`:
      `sortBy?: "totalSpent" | "createdAt"`, `order?: "asc" | "desc"`) y contra el código fuente
      real (`query-users.dto.ts` con whitelist por enum, `users.service.ts` — `totalSpent` es
      columna `decimal` real, el `ORDER BY` corre directo en SQL, no hay cálculo al vuelo).
      `useUsers` acepta `sortBy`/`order` opcionales y solo los agrega al query si vienen definidos
      — sin ellos el request sigue siendo exactamente `{ page, limit }` (comportamiento previo
      intacto para la vista "Todos"). `UsersPage` reestructurado con `Tabs` ("Todos" / "Top
      usuarios"); el tab nuevo es `TopUsersSection.tsx`, tabla paginada reutilizando el mismo
      patrón de `Pagination`/`LoadingState`/`ErrorState`. Columnas: Nombre, Email, Total gastado,
      Registro. Cada fila tiene un botón "Generar cupón" que abre `GenerateCouponForm` (el
      individual, no el de campaña) con `defaultUserId={user.id}` prellenado — evita copiar el
      UUID a mano. **Verificado por @tester con mutación independiente**: rompió el prefill en
      `GenerateCouponForm` (`userId: ''` en vez de `defaultUserId ?? ''`) y el test
      correspondiente de `TopUsersSection.test.tsx` falló exactamente en el UUID esperado;
      restauró el fix y volvió a pasar. **Veredicto final de @tester: LISTO** (`type-check`,
      `lint`, `test` 95/95 en 18 archivos, `build`, todo repetido de forma independiente, incluida
      la confirmación del contrato contra el código fuente real del backend). Detalle completo en
      `docs/testing-checklist.md` (sección "Users — Top usuarios" + reporte de auditoría).
- [x] **Mapa de solo lectura en direcciones del usuario** (Static Maps API de Geoapify — misma key
      que `celtas-mobile`, un `<img>` simple armado con una URL, sin librería de mapas interactivo):
      `UserAddress` gana `latitude: number | null` / `longitude: number | null` en `types.ts`, no
      documentados en `api.d.ts` porque `GET /users/:id/addresses` no declara
      `@ApiResponse({ type })` en Swagger (mismo gap que Marketing) — confirmado contra el código
      fuente real de `backend-celtas` (`address.entity.ts`: columnas `double precision` nullable,
      sin `@Exclude()`; `addresses.service.ts` `findByUser()` y `users.controller.ts`
      `listUserAddresses()`: entidad completa sin `select`/DTO que las omita). `buildAddressMapUrl`
      (`users-utils.ts`) es función pura (recibe `apiKey` como parámetro) que arma la URL con
      `lonlat:{longitude},{latitude}` (orden lon,lat) para `center`/`marker`, key vía
      `encodeURIComponent`. `UserAddressesSection.tsx` renderiza el `<img>` debajo de cada tarjeta
      SOLO cuando `latitude !== null && longitude !== null && geoapifyApiKey` (comparación estricta,
      no truthy check) — sin `VITE_GEOAPIFY_API_KEY` configurada, no se renderiza ningún `<img>`
      roto aunque haya coordenadas; direcciones sin coordenadas (la mayoría) no muestran ningún
      placeholder, comportamiento intencional. **Verificado por @tester con mutación real**: quitó
      la condición de coordenadas nulas → el test "dirección SIN coordenadas..." de
      `UserAddressesSection.test.tsx` FALLÓ exactamente como se esperaba; restauró el archivo con
      `git checkout --` y la suite volvió a 2/2. `type-check`, `lint`, `build` en verde; `test`:
      24 archivos / 130 tests. Confirmó también con Node real que `encodeURIComponent('my-key') ===
      'my-key'`, así que el test existente de `buildAddressMapUrl` seguía siendo válido tras ese
      cambio detectado en disco. Sin key/URL hardcodeada (`VITE_GEOAPIFY_API_KEY` vía
      `import.meta.env`, único punto de lectura en todo `src/`); `.env` nunca trackeado en git,
      `.env.example` solo con placeholder. **Veredicto final de @tester: LISTO** (con riesgos no
      bloqueantes documentados: sin `onError` en el `<img>`, sin reconfirmación en vivo del formato
      de la API de Geoapify contra su documentación real —el entorno de @tester no tuvo herramienta
      de fetch web disponible—, y sin prueba E2E/Playwright con coordenadas reales en el navegador).
      Detalle completo en `docs/testing-checklist.md` (sección "Users" + reporte de auditoría
      "Mapa de solo lectura en direcciones del usuario").

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
- [ ] **Pendientes a resolver el día del deploy real (no bloquean este entorno de desarrollo)**:
  - [ ] `store_location` sin configurar en el backend de **producción** (sembrada vacía, ver
        `settings.service.ts` de backend-celtas) — cargar la ubicación real del local desde
        Configuración → Delivery por distancia. Hasta entonces, el backend de producción
        rechaza el cálculo de delivery por distancia en pedidos nuevos.
  - [ ] `VITE_FIREBASE_VAPID_KEY` sin configurar — el registro de Web Push queda deshabilitado
        en silencio (ver `src/lib/firebase.ts`, warning en consola, nunca bloquea el panel)
        hasta generar el certificado en Firebase Console (Configuración del proyecto → Cloud
        Messaging → Web Push certificates, proyecto "celtas-b0bd5") y cargarlo en el `.env` de
        producción.

### 11. Marketing (notificaciones de fidelización) — v1 manual
- [x] Sección propia en el sidebar (`/marketing`, ícono `Megaphone`), **no mezclada con
      Configuración**. Contrato confirmado contra el código fuente real de `backend-celtas`
      (`notifications.controller.ts`, `notifications.service.ts`, entidad
      `MarketingNotification`), no solo Swagger — `POST /notifications/broadcast` y
      `GET /notifications/broadcast-history` no declaran `@ApiResponse({ type })`, así que
      `src/types/api.d.ts` no documenta el schema de respuesta; los tipos en
      `src/features/marketing/types.ts` vienen de leer el backend real.
      `src/types/api.d.ts` regenerado (`pnpm run generate:types`) contra el backend local
      (`localhost:3000/docs-json`) para confirmar los dos endpoints nuevos ya existen en el
      contrato antes de construir.
- [x] `BroadcastForm.tsx`: título + cuerpo (Zod, espejo de `BroadcastNotificationDto`:
      requeridos, no vacíos) + botón "Enviar ahora". Acción de impacto real e inmediata (sin
      scheduler, sin deshacer) — mismo patrón de confirmación explícita que
      `GenerateBulkCouponForm` (Cupones): el submit NO llama a la API directo, primero muestra
      un panel de confirmación con el título/cuerpo a enviar; solo "Sí, enviar ahora" dispara
      `POST /notifications/broadcast`. Al completar, muestra `sent`/`total` (cuántos
      dispositivos lo recibieron de cuántos tenían token).
- [x] `MarketingPage.tsx`: formulario arriba + tabla con el historial de campañas debajo
      (`GET /notifications/broadcast-history`, más recientes primero, columnas
      título/cuerpo/alcance sent-total/fecha en Lima).
- [x] Hooks en `src/features/marketing/hooks.ts` (`useBroadcastHistory`, `useSendBroadcast`,
      React Query, invalida el historial al enviar con éxito).
- [x] Verificación manual end-to-end contra el backend **local** real (`localhost:3000`, admin
      QA creado a mano en la BD): `POST /notifications/broadcast` devolvió
      `{"sent":0,"total":16}` (0 porque las credenciales de Firebase del `.env` local son de
      prueba — el contrato `{sent, total}` y el guardado en historial se confirmaron reales, no
      simulados) y `GET /notifications/broadcast-history` devolvió la fila esperada
      (`id, title, body, adminId, sentCount, totalCount, createdAt`); `401` sin token confirmado.
- [x] Tests: `hooks.test.tsx` (payload exacto del POST, invalidación del historial) y
      `BroadcastForm.test.tsx` (flujo de confirmación — el test crítico es que `mutateAsync`
      NUNCA se llama antes del clic en "Sí, enviar ahora", igual que el test de regresión
      equivalente en Cupones).
- [x] `type-check`, `lint`, `build`, `test` verificados por la sesión antes de pedir auditoría.
- [x] **Auditoría @tester (2026-08-19)**: repitió `type-check`/`lint`/`build`/`test` de forma
      independiente — los tres primeros sin salida (0 errores/warnings), `test` en **23 archivos /
      125 tests en verde** (incluidos los 2 archivos nuevos de `src/features/marketing/`, 8/8
      aislados y dentro de la suite completa). Comparó `types.ts` línea a línea contra
      `notifications.controller.ts`/`notifications.service.ts`/`broadcast-notification.dto.ts`/
      `marketing-notification.entity.ts` reales — coincide campo a campo, incluido `adminId: string
      | null` (FK `SET NULL`) y `createdAt: string` (confirmado que llega como string ISO por HTTP
      real, no `Date`). **Mutación real del guard de confirmación**: inyectó una llamada directa a
      `mutateAsync` dentro de `onValidated` (bypaseando el panel de confirmación) →
      2 de 5 tests de `BroadcastForm.test.tsx` FALLARON exactamente como se esperaba; restauró el
      archivo y la suite volvió a 5/5. **Verificación end-to-end independiente** contra el backend
      local real, con un admin QA propio creado vía `POST /auth/register` + promoción a `admin` por
      SQL (sesión distinta de la usada por la sesión principal): `401` sin token, `201
      {"sent":0,"total":16}` con token admin, `GET /notifications/broadcast-history` con la fila
      esperada exacta. Confirmó por diff real que el ítem de sidebar y la ruta quedaron entre
      "Banners" y "Configuración", sección propia. Sin `any` ni casting forzado en el módulo (grep =
      0 resultados relevantes). Agregó la sección "Marketing (notificaciones de fidelización)" a
      `docs/testing-checklist.md` (no existía) con el reporte de auditoría completo, incluidos los
      riesgos no bloqueantes (sin límite de longitud en título/cuerpo, sin preview de audiencia
      antes de confirmar, sin verificación de entrega real de FCM con credenciales de producción, y
      sin prueba E2E por navegador/Playwright). **Veredicto final de @tester: LISTO PARA MARCAR
      COMPLETO**. Detalle completo en `docs/testing-checklist.md`, sección "Marketing
      (notificaciones de fidelización) — v1 manual" + reporte de auditoría al final del archivo.
      Pendiente: veredicto de `@tester`.

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