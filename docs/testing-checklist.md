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
- [x] **Salsas — catálogo `sauces` + checklist `sauceIds` por producto** (commit `085091e`,
      auditado por @tester el 2026-08-26; detalle completo en "Auditoría: Menu — Salsas" al final
      de este archivo). Contrato confirmado contra `src/modules/sauces/` y `src/modules/menu/`
      reales del backend. `useUpdateSauce` NO manda `id` en el body del PATCH (`{ id, ...body }`),
      con test de regresión en `src/features/menu/sauces/hooks.test.tsx` **verificado por mutación**
      (revertir → 2/5 fallan). Salsas inactivas ya asignadas se muestran "(oculta)" y pre-marcadas
      en `ItemForm.tsx`; catálogo vacío → mensaje que apunta a la pestaña "Salsas"; payload
      `sauceIds` siempre `string[]` — los tres puntos cubiertos por
      `src/features/menu/items/ItemForm.test.tsx` (nuevo, 5 tests) **verificado por mutación**
      (romper el sufijo "(oculta)" o el prefill de `defaultValues.sauceIds` → fallan). Estados
      loading/error/vacío explícitos en `SaucesSection` y en la sección de salsas de `ItemForm`.
      409 de nombre duplicado mapeado al campo `name` en `SauceForm`. Sin `any`/`@ts-ignore`, sin
      hex hardcodeado, sin texto en inglés.
- [x] **`ItemForm.tsx` envuelto en `ScrollArea` (`src/components/ui/scroll-area.tsx`, nuevo,
      shadcn estándar importando desde `radix-ui` unificado) — auditado por @tester el
      2026-09-16, dos rondas. 1ª ronda: NO LISTO (bug bloqueante encontrado, no corregido por
      regla del rol, reportado a la sesión principal). 2ª ronda (tras el fix): LISTO, con un
      caso borde residual documentado**:
      - `pnpm run type-check`, `pnpm run lint` (0 errores; mismo warning preexistente ajeno en
        `StarPromotionForm.tsx`), `pnpm run build` y `pnpm run test` (273/273, 39 archivos,
        incluye `ItemForm.test.tsx` 21/21) — los cuatro en verde en ambas rondas. Sin regresión
        detectable en validaciones, selects, checkboxes ni envío del formulario. (Una corrida de
        la suite completa tras el fix mostró 1 fallo en `BroadcastForm.test.tsx` — reproducido
        en aislado: 5/5 en verde, confirma la flakiness preexistente por contención de CPU ya
        documentada en otras secciones de este archivo, ajena a este cambio.)
      - ❌ **1ª ronda — bug de layout encontrado** (no detectable por la suite de Vitest/jsdom,
        que no calcula overflow real — se confirmó leyendo el código compilado real de
        `@radix-ui/react-scroll-area`, no por inferencia): `ScrollArea` (Root) recibía
        `className="max-h-[80vh]"` directamente — `max-height` sin `height` explícito, sin
        `overflow-hidden` en el Root. Su `Viewport` interno (`size-full` → `height: 100%`) no
        tenía una altura definida contra la cual resolverse (CSS 2.1 §10.5: el porcentaje solo
        se resuelve si la altura del padre fue "especificada explícitamente", y `max-height` no
        cuenta) — colapsaba a `height: auto` (crecía a su contenido real). Radix mide
        `scrollHeight` vs `clientHeight` del `Viewport` para decidir si activa el scroll
        (`.../dist/index.mjs` línea ~121: `overflowY: context.scrollbarYEnabled ? "scroll" :
        "hidden"`); con el `Viewport` ya crecido a su contenido, ambas medidas coincidían y
        Radix nunca activaba el scroll — el contenido se desbordaba de los 80vh sin recortarse
        ni poder alcanzar el footer (Guardar/Cancelar) con scroll. Reportado sin corregir, por
        regla del rol.
      - ✅ **2ª ronda — fix verificado, mecanismo confirmado correcto**: la sesión principal
        movió `max-h-[80vh]` + `overflow-hidden` a un `<div className="flex max-h-[80vh]
        flex-col overflow-hidden">` que envuelve al `ScrollArea`, y el `ScrollArea` pasó a
        `className="min-h-0 flex-1"` (sin `max-h` propio). Confirmado línea por línea en el
        archivo real (`ItemForm.tsx` líneas 217-219 y 676-678), no solo por el diff pegado en el
        mensaje. Con esta estructura, el algoritmo de flexbox (no la resolución de porcentajes
        de CSS 2.1 §10.5, que es la regla que rompía el patrón anterior) calcula la altura
        "tentativa" del contenedor flex (`flex flex-col`) sumando el tamaño hipotético de sus
        hijos, y la clampa contra `max-height: 80vh` — esto SÍ produce una altura final definida
        para el contenedor (el algoritmo flex resuelve el `max-height` antes de repartir espacio
        entre los flex-items, a diferencia del layout de bloque con porcentajes). El
        `overflow-hidden` explícito en ese mismo div ahora sí recorta cualquier exceso. El
        `ScrollArea` (Root), como único flex-item con `flex-1` + `min-h-0` (crítico: sin
        `min-h-0`, el default `min-height: auto` de un flex-item no lo deja encogerse por debajo
        de la altura mínima de su contenido, reproduciendo el mismo bug), recibe ahora una
        altura definida real vía flexbox — su `Viewport` (`height: 100%`) sí puede resolverse
        contra ella, `clientHeight` queda genuinamente menor que `scrollHeight` cuando el
        contenido excede el espacio, y Radix activa `overflow-y: scroll` correctamente. Verificado
        que las clases compiladas existen tal cual en el CSS de build (`dist/assets/index-*.css`):
        `.max-h-\[80vh\]{max-height:80vh}`, `.min-h-0{min-height:0}`, `.flex-1{flex:1}`,
        `.flex-col{flex-direction:column}`, `.overflow-hidden{overflow:hidden}`,
        `.flex{display:flex}` — no es solo una promesa de nombre de clase, el CSS real las
        emite. Es el patrón canónico recomendado para "Dialog + ScrollArea + formulario largo" en
        Radix/shadcn (evita la deficiencia de porcentaje-contra-padre-auto usando el algoritmo de
        flexbox, que sí resuelve `max-height` antes de heredar la altura hacia abajo).
      - ⚠️ **Caso borde residual, NO bloqueante, documentado (no verificado con navegador real —
        sigue sin haber Playwright/herramienta de navegador en este entorno)**: el fix resuelve
        que el *contenido del formulario* se pueda scrollear dentro de sus 80vh, pero
        `DialogContent` (`src/components/ui/dialog.tsx`, sin tocar por este fix a propósito) y
        `ItemsSection.tsx` siguen sin tener `max-height`/`overflow` propios — el div envolvente
        vive dentro de un `DialogHeader` + `gap-4` + `p-4` (~32px padding) que NO están
        contemplados en el `80vh` (esa unidad es relativa al viewport completo, no al espacio
        restante tras el header). Estimando la altura del `DialogHeader` (~60-90px) + `gap-4`
        (16px) + padding (32px) ≈ 110-140px adicionales por fuera del `80vh` del formulario: en
        viewports con menos de ~590px de alto (ventana de navegador achicada, zoom alto, algunos
        tablets/móviles en landscape con la barra del navegador visible) el `DialogContent`
        total seguiría excediendo el viewport, y como no tiene scroll/overflow propio ni lo
        compensa el `body` (bloqueado por Radix Dialog mientras el diálogo está abierto), el
        borde inferior del diálogo —y con él el footer, aun con el scroll interno funcionando
        correctamente— podría quedar por debajo del viewport visible, inalcanzable. Mucho menos
        severo que el bug original (que rompía en cualquier pantalla normal), pero sigue siendo
        un caso real en pantallas cortas. Sugerencia para una vuelta de pulido futura, no
        bloqueante: acotar también `DialogContent` (ej. `max-h-[90vh] overflow-y-auto`, o restar
        el alto estimado del header al `max-h` del formulario con `calc()`), fuera del alcance
        que la sesión principal decidió tocar en este fix puntual.
      - Veredicto: **LISTO** — el bug reportado y verificado en la 1ª ronda está corregido con el
        patrón correcto (confirmado por mecanismo CSS/flexbox, no solo por confiar en el reporte
        de la sesión principal); type-check/lint/build/tests en verde, sin regresión. Único
        pendiente: el caso borde de viewports muy cortos arriba, documentado como riesgo menor no
        bloqueante, sin confirmación visual en navegador real por falta de herramienta en este
        entorno.


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
- [x] `OrderItem.comment` (`string | null`, comentario libre del cliente por ítem, ej. "sin
      cebolla") — confirmado contra el código fuente real de `backend-celtas`
      (`order-item.entity.ts` línea 73-74, `@Column({ type: 'varchar', length: 140, nullable:
      true })`; `orders.service.ts` `resolveComment()` trimea y normaliza vacío/solo-espacios a
      `null` antes de guardar, mismo criterio documentado en el diff de `api.d.ts` regenerado
      contra el backend local). NO es tri-state como `selectedSauces` — solo `null` (sin
      comentario) o `string` con texto; se aplica a las `quantity` unidades del ítem, no por
      unidad. `OrderDetailDialog.tsx` agrega la línea (`text-muted-foreground text-xs italic`,
      mismo patrón visual que `selectedSauces`) con `item.comment !== null` (no truthy check).
      **Verificado por @tester de forma independiente**: `type-check`, `lint`, `test` (23
      archivos / 127 tests) y `build` repetidos y en verde; diff de `OrderDetailDialog.tsx` y
      `api.d.ts` confirmado línea a línea contra `git diff`, coincide con lo reportado. **Mutación
      real**: eliminé el bloque nuevo de `item.comment !== null` en `OrderDetailDialog.tsx` → el
      test "comment con texto: muestra..." de `OrderDetailDialog.test.tsx` FALLÓ exactamente como
      se esperaba (`Unable to find an element with the text: Comentario: Sin cebolla`); restauré
      el archivo (`git diff` confirma 5 líneas agregadas, idéntico al estado original) y la suite
      relevante volvió a 8/8 (`OrderDetailDialog.test.tsx` + `merge.test.ts`)
- [x] **"Cancelar pedido" desde "en camino" con motivo obligatorio** — confirmado contra el código
      fuente real de `../backend-celtas` (accesible desde este entorno, verificado con `ls`):
      - `src/modules/orders/dto/update-order-status.dto.ts`: `cancelReason?: string` con
        `@IsOptional() @IsString({ message: 'cancelReason debe ser texto' }) @MaxLength(500, ...)`
        — el `Textarea` del diálogo usa `maxLength={500}` (cap nativo, espejo del DTO).
      - `src/modules/orders/orders.service.ts` línea 36-42: `VALID_TRANSITIONS[EN_CAMINO] =
        [ENTREGADO, CANCELADO]` — espejo exacto en `status.ts`
        (`VALID_ORDER_TRANSITIONS.en_camino = ['entregado', 'cancelado']`).
      - `orders.service.ts` línea ~281-289: lanza `BadRequestException('Debes indicar un motivo
        para cancelar un pedido que ya está en camino')` solo si `dto.status === CANCELADO &&
        order.status === EN_CAMINO && !dto.cancelReason?.trim()`; guarda
        `order.cancelReason = dto.cancelReason.trim()` si viene con texto. El frontend deshabilita
        el botón "Cancelar pedido" del diálogo hasta que `cancelReason.trim().length > 0` y envía
        `cancelReason: cancelReason.trim()`, así que ese 400 es inalcanzable desde la UI.
      - `src/modules/orders/entities/order.entity.ts` línea 96-97: `@Column({ type: 'text',
        nullable: true }) cancelReason: string | null` — espejo en `orders/types.ts`
        (`Order.cancelReason: string | null`, tipado a mano, consistente con el resto del módulo:
        el Swagger de prod aún NO expone `cancelReason` — la instancia de onrender.com va detrás
        del commit local `06b6968`).
- [x] `id` nunca viaja en el body del PATCH (regla de oro): `useUpdateOrderStatus` manda `id` solo
      en el path (`/orders/${id}/status`) y el body es `{ status, ...(cancelReason ? { cancelReason }
      : {}) }` — `cancelReason` se omite del body si llega vacío/`undefined`. Cubierto por
      `src/features/orders/hooks.test.tsx` (nuevo, 3 casos). **Verificado por @tester con mutación**:
      cambiar el spread condicional por `cancelReason` fijo → 2/3 fallan (`{ status, cancelReason:
      '' }` en vez de `{ status }`); restaurado, 3/3 en verde.
- [x] Cancelar desde `pendiente`/`confirmado` sigue siendo directo (sin diálogo, sin `cancelReason`
      en el payload) — cubierto por 2 casos de `OrderDetailDialog.test.tsx`.
- [x] El diálogo anidado (`Textarea` + `Label`, patrón "Eliminar categoría/producto") solo aparece
      en `en_camino → cancelado`; botón confirmar deshabilitado con motivo vacío, habilitado al
      escribir; envía `status` + `cancelReason` trimeado; motivo visible bajo el badge si el pedido
      ya está `cancelado` con `cancelReason`. 6 casos nuevos en `OrderDetailDialog.test.tsx`.
      **Verificado por @tester con 6 mutaciones independientes** (Edit puntual + Edit inverso, sin
      `git checkout` para no perder el resto del diff):
      1. `status.ts` `en_camino: ['entregado']` → 3 tests fallan (no renderiza el botón "Cancelar
         pedido" en `en_camino`).
      2. `hooks.ts` body con `cancelReason` fijo en vez del spread condicional → `hooks.test.tsx`
         2/3 fallan.
      3. `OrderDetailDialog.tsx` `handleConfirmCancel` envía `cancelReason` sin `.trim()` → el test
         "al confirmar, envía status + cancelReason" falla (recibe el string con espacios).
      4. `OrderDetailDialog.tsx` botón confirmar sin `|| cancelReason.trim().length === 0` en
         `disabled` → el test "botón deshabilitado con motivo vacío" falla.
      5. `OrderDetailDialog.tsx` guard de `handleTransition` neutralizado (`if (false && ...)`) →
         3 tests del diálogo `en_camino` fallan (cancela directo, sin abrir el diálogo).
      6. `OrderDetailDialog.tsx` bloque de display del motivo neutralizado (`{false && ...}`) → el
         test "pedido ya cancelado con motivo: lo muestra en el detalle" falla.
      Tras restaurar cada mutación, `git diff --stat` vuelve a `318 insertions(+), 7 deletions(-)`
      (idéntico al estado entregado) y `pnpm run test` = 230/230 en 35 archivos.
- [x] `api.d.ts` regenerado con `pnpm run generate:types`: el diff (`git diff src/types/api.d.ts`)
      trae solo cambios reales NO relacionados a esta feature (`UsersController_clearFcmToken` y la
      `description` de `/rewards/catalog`), confirmando que el Swagger de prod todavía no expone
      `cancelReason` ni la transición `en_camino → cancelado`. `cancelReason` está tipado a mano en
      `orders/types.ts` y en el payload del hook, coherente con la cabecera del propio archivo
      ("Swagger no documenta los schemas de respuesta").
- [x] `pnpm run type-check` (`tsc -b`, sin salida), `pnpm run lint` (0 errores; 1 warning
      pre-existente en `StarPromotionForm.tsx`, ajeno a este cambio), `pnpm run build` (sin
      warnings) y `pnpm run test` (230/230, 35 archivos) en verde — repetidos por @tester antes y
      después de las 6 mutaciones.

⚠️ **Riesgos / casos borde no cubiertos** (documentados, no bloqueantes):
- **Orden de despliegue**: el backend en `https://backend-celtas.onrender.com` todavía NO tiene
  desplegada la transición `en_camino → cancelado` ni el campo `cancelReason` (va detrás del commit
  local `06b6968`). Si `celtas-admin` sube esta feature a producción antes que el backend, el PATCH
  de "Cancelar pedido" desde "en camino" recibirá un 400 (`No se puede pasar el pedido de
  "en_camino" a "cancelado"`) del backend actual de prod. El botón/diálogo aparecerá en la UI pero
  la acción fallará. Coordinar el deploy: backend primero.
- Sin E2E/Playwright contra un backend real con la feature desplegada — no es posible hoy contra
  prod (ver primer punto). Toda la verificación fue: contrato contra el código fuente real del
  backend + tests de componente/hook con mocks + 6 mutaciones con reversión confirmada.

### Vuelta de pulido (cierre de los 3 riesgos de bajo impacto) — `OrderDetailDialog.tsx`

- [x] **Botón "Volver" deshabilitado durante la mutación** — se agregó
      `disabled={updateStatus.isPending}` al botón "Volver" del `DialogFooter` (antes solo lo tenía
      el de confirmar). Ya no se puede cerrar el diálogo con un clic mientras el PATCH está en
      vuelo. Test nuevo en `OrderDetailDialog.test.tsx`: con `updateStatusMock.isPending = true` +
      `rerender`, "Volver" queda `toBeDisabled()` y el de confirmar muestra "Cancelando…".
- [x] **Nombre accesible "Cancelar pedido" ya no queda duplicado** — el botón trigger de la
      transición (rama `next === 'cancelado'` del `transitions.map`) recibe
      `aria-hidden={cancelPromptOpen}` + `tabIndex={cancelPromptOpen ? -1 : undefined}`. Con el
      diálogo de motivo abierto, solo el botón de confirmar queda en la accessibility tree (el
      trigger ya estaba inerte para el mouse por el overlay). El texto de ambos botones NO cambió.
      **Test reescrito tras el hallazgo de @tester (1ª ronda):** la versión anterior comparaba
      `getAllByRole('button', { name: 'Cancelar pedido' }).toHaveLength(1)` antes y después de
      abrir — NO distinguía el fix, porque Radix, al abrir el `<Dialog>` modal, ya pone
      `aria-hidden="true"` en el `DialogContent` exterior vía `hideOthers`, así que el trigger sale
      de la a11y tree con o sin las props explícitas. El test actual guarda la referencia al
      `<button>` ANTES de abrir y afirma el atributo directamente sobre él:
      `expect(trigger).not.toHaveAttribute('tabindex')` antes, y tras `click`
      `expect(trigger).toHaveAttribute('aria-hidden', 'true')` + `toHaveAttribute('tabindex', '-1')`
      (Radix pone `aria-hidden` en un div ancestro, no en el `<button>`, así que esta aserción SÍ
      distingue el fix). Verificado por mutación: al revertir `aria-hidden`/`tabIndex` el test
      FALLA en `toHaveAttribute('aria-hidden', 'true')`; restaurado, 27/27. Los tests previos que
      usan `getAllByRole(...).at(-1)` siguen pasando tal cual (array de 1 elemento).
- [x] **Contador de caracteres 0/500** — `<p className="text-muted-foreground text-right text-xs">`
      bajo el `Textarea` con `{cancelReason.length}/500` (mismo patrón `text-muted-foreground
      text-xs` del resto del componente). El `maxLength={500}` nativo sigue siendo el límite duro.
      Test nuevo: al abrir muestra `0/500`, tras escribir "abc" muestra `3/500`.
- Verificación @tester: `pnpm run type-check` (`tsc -b`, sin salida), `pnpm run lint` (0 errores;
  1 warning pre-existente ajeno en `StarPromotionForm.tsx`), `pnpm run build` limpio. `pnpm run test`:
  una corrida en verde 233/233 (35 archivos) y otra con 2 fallos por timeout de 5 s
  (`menu/items/ItemForm.test.tsx` y `settings/DeliverySettingsCard.test.tsx`) — flakiness
  pre-existente por contención de CPU con `userEvent` en la suite paralela; ambos pasan 13/13 en
  aislado y no tocan nada de este cambio. `OrderDetailDialog.test.tsx` aislado: 27/27 estable.
- Verificación por mutación (Edit puntual + reverso, sin `git checkout`):
  - Revertir `disabled={updateStatus.isPending}` de "Volver" → FALLA solo
    "con una cancelación en curso, 'Volver' también queda deshabilitado". Test de regresión real. ✅
  - Revertir `aria-hidden`/`tabIndex` del trigger `cancelado` → tras reescribir el test (ver punto
    arriba), FALLA en `expect(trigger).toHaveAttribute('aria-hidden', 'true')`; restaurado, 27/27. ✅
    (La versión original del test NO fallaba — hallazgo de @tester, ya corregido.)
  - Revertir el `<p>{cancelReason.length}/500</p>` → FALLA solo "el contador de caracteres arranca
    en 0/500 y se actualiza al escribir". Test de regresión real. ✅
- Los tests previos del `describe` de cancelación siguen en verde con el `aria-hidden` puesto
  (9/9 en el describe, incluidos los `getAllByRole(...).at(-1)`).

⚠️ **Riesgos / casos borde que siguen abiertos tras el pulido** (no bloqueantes):
- **Orden de despliegue** (sin cambios): backend primero, ver el primer punto de arriba.
- El botón "Volver" ahora se deshabilita, pero si la mutación falla el `cancelError` se muestra
  dentro del diálogo y el usuario debe usar "Volver" (ya habilitado de nuevo) — flujo correcto,
  solo se anota.
- El contador `0/500` no cambia de color ni avisa al acercarse al máximo; es puramente
  informativo. El navegador sigue siendo quien impide pasarse (tipeo y pegado).
- Sin E2E/Playwright contra backend real con la feature desplegada (mismo motivo: prod va detrás).

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
- [x] **Fila "Cupón" en el desglose de precios del detalle de pedido**: `orderDiscount(order)`
      (nueva función pura en `orders-utils.ts`) deriva el descuento con el mismo despeje
      algebraico que usa el backend para `total` (`subtotal - total + deliveryFee`), redondeado a
      2 decimales (`Math.round(raw * 100) / 100`). `OrderDetailDialog.tsx` renderiza la fila
      "Cupón" entre "Subtotal" y "Envío" solo si `discount > 0.01`, con signo negativo antepuesto
      (`-{CURRENCY.format(discount)}`). Sin cambios de `api.d.ts` ni del contrato — el `Order` no
      expone el descuento ni el código del cupón, todo se deriva de datos que ya viajaban en la
      respuesta (`total`, `deliveryFee`, `items[].subtotal`).
      **Contrato verificado contra el código fuente real de `../backend-celtas`** (accesible
      desde este entorno, se comprobó con `ls` antes de asumir lo contrario):
      `orders.service.ts` líneas 98-121 confirman `total = round2(discountedTotal + deliveryFee)`
      y `discountAmount = round2(subtotal - discountedTotal)`; `coupons.service.ts`
      `applyDiscount()` (líneas 492-499) confirma que `discountedTotal` NO se redondea antes de
      esa resta. El despeje del frontend (`subtotal - total + deliveryFee`) coincide
      algebraicamente con el cálculo real, con un riesgo teórico de discrepancia de hasta un
      centavo por doble redondeo en casos límite — no se encontró ningún caso concreto que lo
      dispare, se deja como riesgo menor documentado, no bloqueante.
      **Verificado por @tester con dos mutaciones independientes**:
      (1) en `orderDiscount()`, quité `+ order.deliveryFee` del cálculo → 3 de 4 tests nuevos de
      `orders-utils.test.ts` (`describe('orderDiscount', ...)`) FALLARON exactamente como se
      esperaba, y el fallo se propagó al test de la fila "Cupón" en `OrderDetailDialog.test.tsx`
      (Test Files: 2 failed, 4 tests failed en total); restauré el archivo, `git diff --stat`
      confirmó 12 líneas agregadas, idéntico al estado original.
      (2) en `OrderDetailDialog.tsx`, forcé `{discount > 0.01 ? (...)` a `{false ? (...)` → el
      test "pedido CON cupón" FALLÓ (`getByText('Cupón')` no encontró el elemento), el de "SIN
      cupón" siguió pasando (comportamiento correcto para ese caso); restauré el archivo,
      `git diff --stat` confirmó 14 inserciones/1 eliminación, idéntico al original.
      Suite completa de Orders tras restaurar: 36/36 (`orders-utils.test.ts` con 4 tests nuevos:
      sin cupón, con cupón, redondeo de punto flotante, sin cupón ni envío;
      `OrderDetailDialog.test.tsx` con 2 tests nuevos: fila oculta sin cupón, fila visible con
      `-S/ 5.25` en el orden Subtotal → Cupón → Envío → Total). `type-check`, `lint` y `build`
      globales en verde. ⚠️ **Riesgo pre-existente detectado durante esta auditoría, no
      relacionado a este cambio**: la suite completa (`pnpm run test`, 191 tests) tiene
      flakiness — en una corrida falló `BroadcastForm.test.tsx` por timeout, en otra
      `GenerateCouponForm.test.tsx`, ambos módulos ajenos a Orders; aislados (`vitest run
      src/features/orders`) los 3 archivos de Orders pasan consistentemente. Vale la pena
      investigar la flakiness general de la suite en una auditoría futura, no bloquea este
      cambio.

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
- [x] **Mapa de solo lectura en direcciones** (Geoapify Static Maps API): `latitude`/`longitude`
      (`number | null`) agregados a `UserAddress` en `types.ts` — no están en `api.d.ts` porque
      `GET /users/:id/addresses` no declara `@ApiResponse({ type })` en Swagger (mismo gap que
      Marketing); confirmado de forma independiente contra el código fuente real de
      `backend-celtas` (`address.entity.ts` líneas 38-43: columnas `double precision` nullable,
      sin `@Exclude()`; `addresses.service.ts` `findByUser()` líneas 24-29: `find({ where:
      { userId }, order: {...} })` sin `select` que las omita; `users.controller.ts`
      `listUserAddresses()` líneas 165-168: `return this.addressesService.findByUser(id)` directo,
      sin DTO que mapee/oculte campos). `buildAddressMapUrl` (`users-utils.ts`) es función pura
      (recibe `apiKey` como parámetro, no lee `import.meta.env` internamente) que arma la URL de
      Geoapify Static Maps con `lonlat:{longitude},{latitude}` (orden lon,lat, no lat,lon) para
      `center` y `marker`, `apiKey` pasado por `encodeURIComponent`. `UserAddressesSection.tsx`
      renderiza el `<img>` SOLO cuando `latitude !== null && longitude !== null && geoapifyApiKey`
      (comparación estricta contra `null`, no truthy check) — si `VITE_GEOAPIFY_API_KEY` no está
      configurada, NO se renderiza ningún `<img>` con `apiKey=undefined` roto, incluso con
      coordenadas presentes (verificado con un test temporal ad hoc: `vi.stubEnv(...,'')` + coords
      reales → `queryByRole('img')` no encuentra nada; test descartado tras confirmar, no forma
      parte de la suite permanente). Direcciones sin coordenadas (la mayoría, creadas antes de la
      columna o sin usar el mapa/autocompletado) no muestran ningún placeholder — comportamiento
      intencional documentado en el doc-comment del componente.
      **Verificado por @tester con mutación real**: eliminé la condición
      `address.latitude !== null && address.longitude !== null` de
      `UserAddressesSection.tsx` (dejando solo el chequeo de `geoapifyApiKey`) → el test "dirección
      SIN coordenadas: no renderiza ningún mapa..." de `UserAddressesSection.test.tsx` FALLÓ
      exactamente como se esperaba (`expected document not to contain element, found <img ...
      src="...center=lonlat:null,null...">`); restauré el archivo con `git checkout --` y `git
      diff` confirmó que quedó idéntico al commit original; la suite volvió a 2/2 en ese archivo.
      **Revisión del cambio `encodeURIComponent(apiKey)`** (detectado en disco después de la
      última edición de la sesión principal, no estaba en el reporte original): es correcto y
      defensivo (protege contra una key con caracteres especiales en la URL), y NO rompe el test
      existente — confirmado con Node real: `encodeURIComponent('my-key') === 'my-key'` (el guion
      es un carácter "unreserved" para `encodeURIComponent`, no se altera), así que
      `users-utils.test.ts` (`buildAddressMapUrl` con `'my-key'`) sigue siendo válido sin cambios.
      Ningún test cubre explícitamente una key con caracteres que sí cambien con el encoding (bajo
      riesgo, ver más abajo).
      **Regla del id-en-el-body**: no aplica (el endpoint es `GET`, no `PATCH`) — `useUserAddresses`
      ya auditado arriba, sin regresión.
      **Sin URL/key hardcodeada**: la key viene únicamente de `import.meta.env.VITE_GEOAPIFY_API_KEY`
      (grep confirma un solo punto de lectura del env en todo el módulo, en
      `UserAddressesSection.tsx`); `.env.example` documenta la variable con un placeholder
      (`tu_api_key_de_geoapify`), sin la key real. La key real vive en `.env` local — confirmado con
      `git ls-files`/`git log --all -- .env` que `.env` nunca estuvo trackeado (el `.gitignore` ya
      tenía `.env`/`.env.*` con excepción explícita `!.env.example`) y `git status`/`git diff HEAD --
      .env.example` sin cambios pendientes (el commit `984fa62` ya incluye todo el trabajo).
      `type-check` (`tsc -b`), `lint` (`eslint .`) y `build` sin salida (0 errores); `test`: 24
      archivos / 130 tests en verde (incluye el archivo nuevo `UserAddressesSection.test.tsx`, 2/2,
      y el caso nuevo agregado a `users-utils.test.ts`).
      ⚠️ **Riesgos/casos borde no cubiertos**: (1) no hay manejo de `onError` en el `<img>` si la
      URL de Geoapify falla en runtime (rate limit del plan gratis, key inválida, red) — el
      navegador mostraría el ícono de imagen rota sin mensaje contextual, no es crítico porque es
      un elemento puramente informativo dentro de una tarjeta que ya muestra el resto de los datos
      de la dirección; (2) no se verificó contra la doc real de Geoapify con una herramienta de
      fetch web en esta auditoría (no disponible en el entorno de @tester) — el formato de la URL
      (`style=osm-carto`, `center=lonlat:lon,lat`, `marker=lonlat:lon,lat;color:%23hex`,
      `zoom`, `width`/`height`, `apiKey`) es consistente con el conocimiento general de la Static
      Maps API de Geoapify y con lo ya usado en `celtas-mobile` (misma key compartida), pero no se
      pudo re-confirmar en vivo contra `apidocs.geoapify.com` de forma independiente en esta pasada
      — pendiente de una prueba visual real (cargar la pantalla con una key válida y confirmar que
      el mapa se ve, no solo que la URL tiene el formato esperado); (3) no hay prueba E2E/Playwright
      contra el backend real mostrando una dirección con coordenadas reales — la verificación fue
      contrato (código fuente) + test de componente + mutación, mismo nivel que el resto del
      checklist de Users, sin pasada manual en navegador.


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

---

## Auditoría: `OrderItem.comment` en el detalle de pedido

✅ Pasó:
- `pnpm run type-check` (`tsc -b`), `pnpm run lint` (`eslint .`): ambos sin salida, cero errores —
  corridos de forma independiente
- `pnpm run test`: 23 archivos / 127 tests en verde (confirmado independientemente)
- `pnpm run build`: sin errores, bundle genera sin warnings de tamaño
- Contrato confirmado contra el código fuente real de `backend-celtas`
  (`order-item.entity.ts` línea 73-74: `@Column({ type: 'varchar', length: 140, nullable: true })
  comment: string | null`, con doc-comment que confirma snapshot y que aplica a toda la
  `quantity`, no por unidad) — coincide exacto con `types.ts` del frontend. También confirmé
  `orders.service.ts` (`resolveComment()`, líneas ~398-399): trimea y normaliza vacío/solo-espacios
  a `null` antes de persistir — consistente con la descripción del `@example`/`@description` en el
  diff de `api.d.ts` regenerado contra el backend local
- `OrderDetailDialog.tsx`: el bloque nuevo (`item.comment !== null ? <p className="text-muted-foreground text-xs italic">Comentario: {item.comment}</p> : null`)
  sigue exactamente el mismo patrón visual que el bloque de `selectedSauces` inmediatamente
  anterior, y usa `!== null` (no truthy check), consistente con la regla de estilo del proyecto
  para campos snapshot nullable
- `types.ts`: `comment: string | null` con doc-comment explícito de que NO es tri-state (a
  diferencia de `selectedSauces`) — solo `null` o texto
- **Mutación real** (no solo inspección): eliminé el bloque nuevo de `OrderDetailDialog.tsx` → el
  test "comment con texto: muestra..." de `OrderDetailDialog.test.tsx` FALLÓ exactamente como se
  esperaba (`TestingLibraryElementError: Unable to find an element with the text: Comentario: Sin
  cebolla`); los otros 4 tests del archivo (incluido "comment null: no muestra...") siguieron
  pasando, como se espera de una eliminación que solo afecta el caso con texto. Restauré el archivo
  desde backup y confirmé con `git diff` que el estado quedó idéntico al original (solo las 5
  líneas del bloque agregadas, sin residuos); la suite relevante volvió a 8/8
  (`OrderDetailDialog.test.tsx` + `merge.test.ts`)
- `merge.test.ts` sigue compilando y pasando con `comment: null` agregado a su `makeItem()` base
  (el tipo `OrderItem` ahora lo exige)

❌ Falló:
- Ninguno de los puntos críticos del checklist

⚠️ Riesgos / casos borde no cubiertos:
- No se probó la mutación complementaria de cambiar `!== null` a un truthy check (`if
  (item.comment)`) porque el test actual usa `comment: 'Sin cebolla'` (truthy), que no distinguiría
  ambas formas. El caso que sí distinguiría (`comment: ''`) no está cubierto por un test explícito
  — bajo riesgo real porque el backend (`resolveComment`) nunca envía `''` (lo normaliza a `null`
  antes de guardar), pero si se quiere blindar la regla de estilo del proyecto de forma explícita
  en este archivo, valdría agregar un tercer caso `comment: ''` que documente que técnicamente
  también se trataría como "hay comentario" con la implementación actual (edge case teórico, no
  bug real dado el contrato del backend)
- No se probó end-to-end contra el backend real (local ni producción) mostrando un pedido con
  comentario real en el detalle — la verificación fue contrato (código fuente) + test de
  componente con mocks, mismo nivel de rigor que el resto del checklist de Orders, pero sin una
  pasada manual en navegador
- El límite de 140 caracteres (`length: 140` en la columna) no tiene ninguna validación ni
  truncamiento explícito en el frontend — no es necesario porque el admin panel solo LEE el
  comentario (no lo crea ni edita), así que no hay riesgo de que el frontend intente guardar algo
  que exceda el límite

Veredicto: LISTO PARA MARCAR COMPLETO

---

## Auditoría: Mapa de solo lectura en direcciones del usuario (Geoapify Static Maps API)

✅ Pasó:
- `pnpm run type-check` (`tsc -b`), `pnpm run lint` (`eslint .`), `pnpm run build`: los tres sin
  salida, cero errores/warnings — corridos de forma independiente
- `pnpm run test`: 24 archivos / 130 tests en verde (confirmado independientemente); los 2 tests de
  `UserAddressesSection.test.tsx` y el caso nuevo de `users-utils.test.ts` pasan tanto aislados
  como dentro de la suite completa
- Contrato de `latitude`/`longitude` confirmado de forma independiente contra el código fuente real
  de `backend-celtas` (no solo el resumen de la sesión principal): `address.entity.ts` (columnas
  `double precision` nullable, sin `@Exclude()`), `addresses.service.ts` `findByUser()` (`find({
  where: { userId }, order: {...} })`, sin `select` que las omita) y `users.controller.ts`
  `listUserAddresses()` (`return this.addressesService.findByUser(id)` directo, sin DTO mapeador) —
  coincide exacto con lo reportado. `api.d.ts` sí documenta `latitude`/`longitude` en
  `CreateAddressDto`/`UpdateAddressDto` (input del cliente móvil), confirmando indirectamente que la
  columna existe, pero el endpoint admin `GET /users/:id/addresses` no declara `@ApiResponse({ type
  })`, así que el tipo a mano en `types.ts` sigue siendo la única fuente de verdad correcta para la
  respuesta
- Revisé el cambio de `encodeURIComponent(apiKey)` en `buildAddressMapUrl` (`users-utils.ts`),
  detectado en disco después de la última edición de la sesión principal: es correcto y defensivo
  (protege ante una key con caracteres especiales), y NO invalida el test existente — confirmado con
  Node real: `encodeURIComponent('my-key') === 'my-key'` (el guion no se altera), así que
  `users-utils.test.ts` sigue siendo válido sin necesidad de actualizarlo
- **Mutación real e independiente**: eliminé la condición `address.latitude !== null &&
  address.longitude !== null` de `UserAddressesSection.tsx` (dejando solo el chequeo de
  `geoapifyApiKey`) → el test "dirección SIN coordenadas: no renderiza ningún mapa..." de
  `UserAddressesSection.test.tsx` FALLÓ exactamente como se esperaba (`expected document not to
  contain element, found <img ... src="...center=lonlat:null,null...">`); restauré el archivo con
  `git checkout --` y confirmé con `git diff`/`git status` que quedó idéntico al commit `984fa62`;
  la suite de ese archivo volvió a 2/2
- **Verificación ad hoc del guard de la API key faltante** (no en la suite permanente, descartada
  tras confirmar): con `vi.stubEnv('VITE_GEOAPIFY_API_KEY', '')` y coordenadas reales presentes, el
  componente NO renderiza ningún `<img>` — evita un `<img src="...apiKey=undefined">` roto si la
  variable de entorno no está configurada
- Sin URL/key hardcodeada: único punto de lectura de `import.meta.env.VITE_GEOAPIFY_API_KEY` en todo
  `src/` es `UserAddressesSection.tsx` (grep confirmado); `.env.example` documenta la variable con
  placeholder (`tu_api_key_de_geoapify`), sin la key real
- `.env` nunca estuvo trackeado en git (`git ls-files`/`git log --all -- .env` = vacío), el
  `.gitignore` ya tenía `.env`/`.env.*` con excepción explícita `!.env.example` antes de este
  cambio; `git status`/`git diff HEAD -- .env.example` sin pendientes — el commit `984fa62` ya
  contiene todo el trabajo de esta mejora
- El `id` no aplica a esta feature (endpoint `GET`, no `PATCH`) — `useUserAddresses` ya auditado
  previamente en la sección "Users" de este mismo archivo, sin regresión
- Estados de UI: la sección ya maneja loading/error/vacío desde la auditoría previa de "Users"; el
  mapa es un elemento adicional condicional dentro del estado "con datos", no introduce un cuarto
  estado nuevo que requiera manejo explícito

❌ Falló:
- Ninguno de los puntos críticos del checklist

⚠️ Riesgos / casos borde no cubiertos:
- No hay manejo de `onError` en el `<img>` si la URL de Geoapify falla en runtime (rate limit del
  plan gratis, key inválida/revocada, sin red) — el navegador mostraría el ícono de imagen rota sin
  ningún mensaje contextual. Bajo riesgo: es un elemento puramente informativo dentro de una tarjeta
  que igual muestra el resto de los datos de la dirección, no bloquea ningún flujo
- No pude re-verificar el formato de la URL de la Static Maps API de Geoapify contra la
  documentación real (`apidocs.geoapify.com`) de forma independiente en esta auditoría — el entorno
  de @tester no tiene una herramienta de fetch web disponible. El formato usado
  (`style=osm-carto&center=lonlat:lon,lat&marker=lonlat:lon,lat;color:%23hex&zoom&width&height&apiKey`)
  es consistente con el conocimiento general de esa API y con el uso ya existente en
  `celtas-mobile` (misma key compartida), pero queda como un punto de la verificación de contrato
  que se apoyó en el reporte de la sesión principal en vez de una reconfirmación independiente. Se
  recomienda una prueba visual real (cargar el detalle de un usuario con una dirección con
  coordenadas y una key válida, confirmar que el mapa se ve) antes de dar esto por 100% verificado
  end-to-end
- Ningún test cubre explícitamente una API key con caracteres que `encodeURIComponent` sí altere
  (ej. con espacios o `&`) — bajo riesgo real porque las keys de Geoapify son alfanuméricas simples,
  pero es un hueco de cobertura explícita del cambio nuevo
- No hay prueba E2E/Playwright ni verificación manual contra el backend real (local ni producción)
  mostrando el mapa de una dirección con coordenadas reales en el navegador — la verificación de
  este módulo fue: contrato (código fuente real), test de componente con mocks, y mutación real con
  reversión confirmada. Mismo nivel de rigor que el resto del checklist de Users, pero sin pasada
  manual en navegador

Veredicto: LISTO PARA MARCAR COMPLETO (con los riesgos no bloqueantes documentados arriba, en
particular la falta de reconfirmación en vivo del formato de la API de Geoapify y de una pasada
visual real — se recomienda antes de que el dueño del negocio dependa de esta pantalla en
producción)

## Programa de Estrellas (toggle en Menú, CRUD de promociones, umbrales en Configuración)

- [x] **Pieza 1 — Toggle "canjeable con estrellas" en la lista de productos**: `MenuItem.redeemableWithStars: boolean` en `types.ts` confirmado contra el código fuente real del backend (`menu-item.entity.ts` línea 54-55, `@Column({ type: 'boolean', default: false })`) y `create-menu-item.dto.ts`/`update-menu-item.dto.ts` (opcional, `@IsOptional() @IsBoolean()`, `UpdateMenuItemDto extends PartialType(CreateMenuItemDto)`). `useToggleItemRedeemableWithStars` hace `PATCH /menu/items/:id` con body `{ redeemableWithStars }` — confirmado contra `menu.service.ts updateItem()` que usa `repository.merge(item, rest)` (no `Object.assign`), así que un PATCH parcial con un solo campo NUNCA pisa `available` ni otros campos ya guardados
- [x] `togglingId` (de `useToggleItemAvailable`) y `togglingRedeemableId` (de `useToggleItemRedeemableWithStars`) son mutaciones y estados completamente independientes en `ItemsSection.tsx` — cada `Switch` se deshabilita solo mientras SU propia mutación está pendiente, confirmado leyendo el componente línea por línea (dos hooks de mutación separados, dos `useState` de error separados, dos alertas separadas)
- [x] **Pieza 2 — CRUD de promociones de estrellas** (`src/features/star-promotions/`): contrato confirmado línea por línea contra el código fuente real del backend en `../backend-celtas/src/modules/rewards/`: `entities/star-promotion.entity.ts` (columna `date` con transformer que expone/recibe siempre `'YYYY-MM-DD'` string plano, nunca `Date`, con comentario explícito del backend sobre por qué evitar conversión de zona horaria), `dto/create-star-promotion.dto.ts` (`label`, `multiplier` 0.01-99.99 con 2 decimales, `startDate`/`endDate` `@IsDateString` obligatorias, `active` opcional default true), `dto/update-star-promotion.dto.ts` (todos opcionales), `dto/is-star-promotion-date-range-valid.ts` (comparación lexicográfica `startDate <= endDate`, idéntica a `isValidStarPromotionDateRange` del frontend), `star-promotions.controller.ts` (solo GET/GET:id/POST/PATCH:id, sin DELETE, rol admin), `star-promotions.service.ts` (mensaje EXACTO del 400 de solapamiento: `'Ya existe una promoción activa en ese rango de fechas'`, y el 400 de `assertValidDates`: `'startDate debe ser anterior o igual a endDate'` — ver riesgo abajo). Los tipos de `types.ts` coinciden campo a campo
- [x] `useUpdateStarPromotion` envía el `id` SOLO en el path de `PATCH /star-promotions/:id` (body sin `id`) — **verificado por @tester con mutación real e independiente**: cambié el hook para mandar `input` completo (con `id`) como body → **2/2 tests de `hooks.test.tsx` FALLARON** exactamente como se esperaba (`expected { id: 'promo-1', … } to not have property "id"` / `expected { id: 'promo-2', active: false } to deeply equal { active: false }`); restauré el hook y `git diff` confirmó que quedó idéntico al original, 2/2 en verde de nuevo
- [x] **Mapeo de error "fechas" → campo `endDate` en `StarPromotionForm.tsx`**: no existía ningún test para esta lógica (gap señalado explícitamente por la sesión principal) — **@tester creó `StarPromotionForm.test.tsx`** (3 tests: 400 con "fechas" del solapamiento real del backend se mapea a `endDate` sin mostrar alerta general, un 400 sin "fechas" cae al alert general del form, guardado exitoso sin errores + `onClose`), editando una promoción ya cargada (`promotion` prop con fechas prellenadas) para no depender de interactuar con el popover del `DatePicker`. **Verificado con mutación real**: cambié el regex `/fechas/i` a `/__MUTATED__/i` en `StarPromotionForm.tsx` → el primer test FALLÓ exactamente como se esperaba (el mensaje del solapamiento apareció como alerta general en vez de en el campo `endDate`); restauré el archivo y `git diff` confirmó que quedó idéntico, 3/3 en verde de nuevo
- [x] `isValidStarPromotionDateRange`/`formatStarPromotionDate`/`formatStarPromotionDateRange` con 6 tests en `star-promotion-utils.test.ts`, incluido el caso explícito de que `2026-01-01` NO se lee como 31-dic-2025 (parseo de componentes YYYY-MM-DD sin pasar por `Date`/zona horaria, correcto para Lima UTC-5)
- [x] Ambas fechas son obligatorias en el form (a diferencia de Banners) — confirmado que el schema Zod (`z.string().min(1, ...)`) coincide con `@IsDateString()` sin `@IsOptional()` en ambos DTOs reales
- [x] Sin DELETE ni reorder ni imagen — confirmado que `star-promotions.controller.ts` real solo expone `GET /`, `GET /:id`, `POST /`, `PATCH /:id`; `StarPromotionsPage.tsx` solo tiene botón "Editar" en Acciones
- [x] **Pieza 3 — Umbrales del programa de estrellas en Configuración**: `SOLES_POR_ESTRELLA_KEY`/`ESTRELLAS_POR_PREMIO_KEY` (`'soles_por_estrella'`/`'estrellas_por_premio'`) confirmadas carácter a carácter contra `settings.service.ts` del backend real (`export const SOLES_POR_ESTRELLA_KEY = 'soles_por_estrella'` línea 52, `ESTRELLAS_POR_PREMIO_KEY` línea 55 — **nota de precisión**: el reporte de la sesión principal las ubicó en "rewards.service.ts líneas 48-50", pero esas líneas son solo el doc-comment del módulo que las *menciona*; las constantes reales viven en `settings.service.ts`, confirmado con grep independiente); default `10`/`10` si el value falta o no es numérico positivo, coincide con `DEFAULT_SOLES_POR_ESTRELLA`/`DEFAULT_ESTRELLAS_POR_PREMIO` reales y con el seed (`seedIfMissing`) del backend, incluidas las descripciones exactas del seed real
- [x] `parseSolesPorEstrella`/`parseEstrellasPorPremio` **no tenían ningún test** (gap real encontrado por @tester, no señalado por la sesión principal) — se agregaron 4 tests a `settings-utils.test.ts` (valor válido + `undefined`/no numérico/`0`/negativo → default 10, para ambas funciones). **Verificado con mutación real**: quité la condición `&& parsed > 0` de `parseSolesPorEstrella` → el test de "cae al default" FALLÓ exactamente como se esperaba (`expected +0 to be 10`); restauré la función y `git diff` confirmó que quedó idéntica, suite completa en verde de nuevo
- [x] `EstrellasSettingsCard.tsx` sigue el mismo esqueleto que `DeliverySettingsCard.tsx`: mismo patrón de tipado `useForm<Input, unknown, Output>` (input/output separados por `z.coerce.number()`), estados de UI completos (`LoadingState`, `ErrorState` con retry, alerta de éxito, alerta de error del servidor), registrado correctamente en `SettingsPage.tsx` junto a las demás cards
- [x] Ruta `/star-promotions` y nav item "Estrellas" (ícono `Star`) registrados correctamente en `router.tsx` (lazy + `Suspense`, mismo patrón que el resto) y `AdminLayout.tsx` (`NAV_ITEMS`, posición entre Banners y Marketing) — confirmado por lectura directa del diff, sin imports muertos
- [x] Sin `any`/`@ts-ignore`/`@ts-expect-error`/casting forzado en los archivos nuevos/modificados de las 3 piezas (grep = 0 resultados; único `as AxiosResponse` es en el test nuevo, mismo patrón ya usado en `GenerateCouponForm.test.tsx`)
- [x] `pnpm run type-check` (`tsc -b`), `pnpm run lint` (`eslint .`), `pnpm run build`: los tres sin salida, cero errores — corridos de forma independiente por @tester (no solo de palabra), `StarPromotionsPage` en su propio chunk (`StarPromotionsPage-*.js`, 8.46 kB)
- [x] `pnpm run test`: **31 archivos / 212 tests en verde** (205 reportados por la sesión principal + 7 nuevos agregados por @tester: 3 de `StarPromotionForm.test.tsx` + 4 de `parseSolesPorEstrella`/`parseEstrellasPorPremio`)

❌ Falló:
- Ninguno de los puntos críticos del checklist

⚠️ Riesgos / casos borde no cubiertos (documentados, no bloqueantes):
- **`src/types/api.d.ts` estaba desactualizado respecto al backend real de producción** — hallazgo de @tester, no mencionado por la sesión principal. Antes de esta auditoría, `api.d.ts` NO tenía ningún rastro de `redeemableWithStars` (ni en `CreateMenuItemDto`/`UpdateMenuItemDto`) ni de `/star-promotions` — a pesar de que **ambos ya están desplegados en producción** (confirmado con `curl https://backend-celtas.onrender.com/docs-json`: `redeemableWithStars` y `/star-promotions`/`/star-promotions/{id}` SÍ existen en el Swagger real en vivo). Corrí `pnpm run generate:types` como verificación (no como fix) y confirmé un diff real de 420 líneas agregadas; **revertí el archivo** con `git checkout --` porque no es mi rol tocar archivos de producción, solo reportarlo. Esto contradice la regla explícita de `CLAUDE.md` #7 ("el primer paso es correr `pnpm run generate:types` antes de tocar cualquier componente") — no causó ningún bug funcional porque el código nuevo usa tipos escritos a mano en `types.ts` que SÍ coinciden con el backend real (verificado línea por línea contra el código fuente), pero el archivo generado quedó fuera de sincronía con el contrato real disponible. **Se recomienda que la sesión principal corra `pnpm run generate:types` y confirme que el diff no rompe nada más antes de dar el módulo por completo**
- El mensaje real del backend para `assertValidDates` (defensa en profundidad del servicio, `'startDate debe ser anterior o igual a endDate'`) **NO contiene la palabra "fechas"** — si ese 400 llegara a la API (solo posible saltándose la validación del cliente, ej. con DevTools), `StarPromotionForm.tsx` lo mostraría como error general del form en vez de mapearlo a `endDate`. Riesgo bajo en la práctica: el mismo `superRefine` del cliente (`isValidStarPromotionDateRange`) ya bloquea el submit antes de llegar a la API en el flujo normal, así que este 400 específico es inalcanzable desde la UI salvo manipulación directa
- No hay campo para `redeemableWithStars` en `ItemForm.tsx` (el diálogo completo de crear/editar producto) — solo se puede activar/desactivar desde el `Switch` de la lista después de creado el producto (a diferencia de `available`, que sí tiene campo en `ItemForm.tsx` Y toggle en la lista). Parece una decisión deliberada de scope (la tarea pedida fue explícitamente "toggle en la lista"), pero vale la pena confirmar con el dueño del producto si un admin debería poder marcar un producto como canjeable al crearlo, sin el paso extra de ir a la lista después
- No hay test de componente para `ItemsSection.tsx` (ni para la columna nueva "Canjeable" ni para la columna preexistente "Disponible") — la independencia de `togglingId`/`togglingRedeemableId` se verificó leyendo el código, no con un test de interacción real (ej. RTL simulando ambas mutaciones en paralelo y confirmando que ambos switches no se bloquean entre sí)
- No hay test de componente para `StarPromotionsPage.tsx` (tabla, estados de carga/error/vacío, apertura del diálogo de crear/editar) ni para `EstrellasSettingsCard.tsx` — la verificación de estos dos se apoyó en lectura de código + `type-check`/`lint`/`build`/suite completa en verde, mismo nivel de rigor que otros módulos del proyecto que tampoco tienen test de página completa (ej. `MarketingPage.tsx`), pero es un hueco de cobertura explícita
- No se probó contra el backend real desplegado (`https://backend-celtas.onrender.com`, más allá de la consulta de solo lectura a `/docs-json`) un flujo end-to-end real: crear una promoción, editarla, intentar solapar fechas con otra activa y confirmar el 400 real con el mensaje exacto, ni activar el toggle "Canjeable" de un producto real y confirmar que aparece en `GET /rewards/catalog`. Toda la verificación fue contrato (código fuente real) + tests de componente/hook con mocks + mutación real de dos fixes críticos, sin sesión de admin real contra producción
- El límite `multiplier` de 2 decimales (`@IsNumber({ maxDecimalPlaces: 2 })` del backend) no tiene validación explícita en el cliente (el input HTML tiene `step="0.01"` pero eso no impide escribir `2.005` a mano) — si el backend lo rechaza, el mensaje no contiene "fechas" así que caería correctamente al error general del form (comportamiento aceptable, pero sin test explícito de este caso límite)

Veredicto: LISTO PARA MARCAR COMPLETO, con la salvedad explícita del gap de `api.d.ts` desactualizado
(no bloqueante para el funcionamiento — los tipos a mano son correctos — pero sí un incumplimiento
del proceso documentado en `CLAUDE.md`, recomendado corregir con `pnpm run generate:types` antes de
continuar con el siguiente módulo) y los riesgos no bloqueantes documentados arriba.

## Programa de Estrellas — Hitos configurables (`RewardMilestone`) + Premio especial (`MenuItem.specialReward`)

Reemplaza el setting fijo `estrellas_por_premio` (eliminado del backend) por hitos configurables
con DELETE real, y agrega un segundo catálogo de canje independiente (`specialReward`), hermano de
`redeemableWithStars`.

- [x] Contrato confirmado línea por línea contra el código fuente real de `../backend-celtas`
      (no solo Swagger/`api.d.ts`): `src/modules/rewards/entities/reward-milestone.entity.ts`
      (`starsRequired: int UNIQUE`, `isSpecial: boolean default false`, comentario explícito de
      que el DELETE es real porque `RewardRedemption` guarda snapshot, no FK),
      `dto/create-reward-milestone.dto.ts` (`starsRequired: @IsInt() @Min(1)`, `isSpecial?:
      @IsOptional() @IsBoolean()`), `dto/update-reward-milestone.dto.ts` (ambos opcionales, mismas
      reglas), `reward-milestones.controller.ts` (`GET/GET:id/POST/PATCH:id/DELETE:id`, todos
      `@Roles(UserRole.ADMIN)`), `reward-milestones.service.ts` (`findAll` ordena `ASC` por
      `starsRequired` en SQL, no en cliente; `translateUniqueViolation` traduce el 23505 de
      Postgres al mensaje EXACTO `"Ya existe un premio configurado para esa cantidad de
      estrellas"` — coincide carácter a carácter con el regex `/premio configurado/i` de
      `RewardMilestoneForm.tsx`). Y `src/modules/menu/entities/menu-item.entity.ts` (columna
      `specialReward: boolean default false`, comentario explícito: "Un producto puede tener
      cualquier combinación de los dos switches") + `create-menu-item.dto.ts` línea 70
      ("independiente de redeemableWithStars") — confirma que la UI implementada (switches
      100% independientes, sin exclusión mutua) es la conducta correcta según el backend real
- [x] `useUpdateRewardMilestone` — regla del id-solo-en-path — **verificado con mutación real**:
      cambié `const { id, ...body } = input; patch(...,body)` a `patch(url, input)` (id incluido) →
      **2/2 tests de `hooks.test.tsx` FALLARON** exactamente como se esperaba (`expected {id:
      'milestone-1', ...} to not have property "id"` y `expected {id: 'milestone-2', isSpecial:
      false} to deeply equal {isSpecial: false}`); restauré el hook, `git diff --stat` confirmó
      0 líneas de diferencia contra el original, 3/3 en verde de nuevo
- [x] `useDeleteRewardMilestone` hace `DELETE /reward-milestones/:id` real (a diferencia de
      `star-promotions`, que no tiene DELETE) — cubierto en `hooks.test.tsx`, confirmado contra
      `reward-milestones.controller.ts`/`.service.ts` reales (`remove()` hace `findOne` + `.remove()`
      de TypeORM, 404 si no existe)
- [x] Mapeo del 400 de colisión de `starsRequired` (`/premio configurado/i` → `setError`
      `starsRequired`) en `RewardMilestoneForm.tsx` — **verificado con mutación real**: cambié el
      regex a `/nunca va a coincidir/i` → el test "mapea un 400 de colisión..." de
      `RewardMilestoneForm.test.tsx` **FALLÓ** exactamente como se esperaba (encontró el div
      "No se pudo guardar" que no debía aparecer); restauré el archivo, `git diff --stat` confirmó
      0 líneas de diferencia, 3/3 en verde de nuevo
- [x] `MilestonesSection.tsx`: estados de UI completos (`LoadingState`, `ErrorState` con retry,
      vacío explícito "No hay hitos configurados"), confirmación de borrado en diálogo separado
      (no borra con un solo clic), error de borrado mostrado en `Alert` dentro del mismo diálogo sin
      cerrar la confirmación
- [x] `StarPromotionsPage.tsx` reestructurada como shell de tabs ("Promociones"/"Hitos") — **mismo
      patrón exacto que `MenuPage.tsx`** (confirmado por grep: mismo `TABS` array tipado, mismo
      `role="tablist"`/`role="tab"`/`aria-selected`, mismos tokens de estilo activo/inactivo). El
      contenido de "Promociones" (`PromotionsSection.tsx`) es una extracción literal del
      `StarPromotionsPage.tsx` original — confirmado por diff: el único cambio de contenido es
      `<h1 className="text-2xl font-bold...">Estrellas</h1>` (compartido con toda la página) →
      `<h2 className="text-xl font-semibold...">Promociones</h2>` (propio de la sección); el resto
      (query, estados, tabla, diálogo, `StarPromotionForm`) es carácter por carácter idéntico al
      original. Ruta `/star-promotions` y nav item "Estrellas" NO cambiaron (confirmado sin diff en
      `router.tsx`/`AdminLayout.tsx`)
- [x] Switch "Premio especial" en `ItemsSection.tsx` — **verificado que NO impone exclusión mutua
      con "Canjeable"**: `handleToggleSpecial`/`toggleSpecialMutation` son un hook y un estado
      (`togglingSpecialId`) completamente independientes de `handleToggleRedeemable`/
      `togglingRedeemableId`, mismo patrón ya auditado para "Canjeable"/"Disponible" — dos switches
      del mismo producto pueden estar ambos en `true` simultáneamente sin que la UI lo bloquee,
      consistente con el contrato real del backend (`create-menu-item.dto.ts`: "independiente de
      redeemableWithStars"; `menu-item.entity.ts`: "cualquier combinación de los dos switches")
- [x] `useToggleItemSpecialReward` hace `PATCH /menu/items/:id` con body `{ specialReward }` — un
      solo campo, no pisa `available`/`redeemableWithStars`/otros (confirmado contra
      `menu.service.ts updateItem()`, que usa `repository.merge()`, ya auditado en el módulo de
      Menú)
- [x] `estrellas_por_premio` eliminado por completo del lado del cliente: grep de
      `estrellas_por_premio`/`ESTRELLAS_POR_PREMIO`/`parseEstrellasPorPremio` en `src/` = 0
      resultados funcionales (solo 2 menciones en comentarios de `EstrellasSettingsCard.tsx`/
      `settings-utils.ts` que documentan el reemplazo histórico, no código vivo). Confirmado contra
      el backend real que la key ya no existe en `settings.service.ts` (grep = 0 resultados;
      `soles_por_estrella` sigue existiendo, es la única key de Estrellas que queda en Configuración)
- [x] `settings-utils.test.ts`: los 4 tests de `parseEstrellasPorPremio` se eliminaron junto con la
      función (no quedaron huérfanos ni comentados); `parseSolesPorEstrella` conserva sus tests sin
      cambios
- [x] `pnpm run type-check` (`tsc -b`): sin salida, 0 errores — repetido de forma independiente
- [x] `pnpm run lint` (`eslint .`): 0 errores, 1 warning preexistente en `StarPromotionForm.tsx`
      (`react-hooks/incompatible-library` por `watch()`, archivo NO tocado en este cambio, ya
      documentado en `ROADMAP.md` módulo 10 como pendiente de un fix igual al de `BannerForm.tsx`)
- [x] `pnpm run build`: exitoso, sin warnings de tamaño de chunk; `StarPromotionsPage-*.js` sigue en
      su propio chunk lazy
- [x] `pnpm run test`: **33 archivos / 216 tests en verde, repetido en 3 corridas completas
      independientes** (no solo una) — sin ningún timeout ni fallo, incluidos los 4 archivos
      señalados como flaky intermitente por la sesión principal (`OrderDetailDialog.test.tsx`,
      `GenerateCouponForm.test.tsx`, `BroadcastForm.test.tsx`, `DeliverySettingsCard.test.tsx`), que
      pasaron 3/3 veces dentro de la suite completa en este entorno. No se reprodujo el flakiness
      reportado — consistente con que ya está documentado como intermitente por contención de CPU
      (no determinístico), no bloqueante
- [x] Sin `any`/`@ts-ignore`/`@ts-expect-error`/casting forzado en los archivos nuevos/modificados
      (grep = 0 resultados)
- [x] `ItemForm.tsx` (diálogo de crear/editar producto) confirmado SIN cambios (`git diff --stat` =
      vacío) y sin ninguna mención de `specialReward` — fuera de alcance a propósito, mismo criterio
      ya aplicado a `redeemableWithStars`

❌ Falló:
- Ninguno de los puntos críticos del checklist

⚠️ Hallazgo de documentación (no bloqueante, pero digno de corrección explícita):
- **El doc-comment de `MenuItem.specialReward` en `src/features/menu/types.ts` usa la palabra
  "EXCLUYENTE" de forma potencialmente engañosa.** Texto actual: *"Si el producto puede canjearse
  específicamente con el PREMIO ESPECIAL (catálogo exclusivo, `GET /rewards/catalog?especial=true`)
  — independiente de `redeemableWithStars`. Un producto puede tener cualquier combinación de los dos
  switches."* — este comentario en concreto SÍ es correcto (dice explícitamente "independiente" y
  "cualquier combinación"). Pero el comentario equivalente en el diff/reporte de la sesión principal
  y el que aparece en `src/features/reward-milestones/types.ts` (`RewardMilestone.isSpecial`) usan
  la palabra "catálogo exclusivo" heredada literalmente de la documentación Swagger del propio
  backend (`rewards.controller.ts`/`rewards.service.ts`: *"lista EXCLUYENTE, no una unión de
  ambas"*). Verifiqué el significado real en el backend: "EXCLUYENTE" ahí describe el comportamiento
  de la **consulta** `GET /rewards/catalog?especial=X` (una sola llamada nunca devuelve la unión de
  ambos catálogos, siempre filtra por un solo campo) — **no** significa que un producto no pueda
  tener ambos flags en `true` a la vez. Confirmé con el código real que SÍ puede (`menu-item.entity.ts`
  no tiene ningún check/constraint de exclusión entre las dos columnas, `create-menu-item.dto.ts` lo
  dice explícitamente: "independiente de redeemableWithStars"). **La implementación real (switches
  100% independientes en `ItemsSection.tsx`, confirmado arriba) es correcta** — este es un hallazgo
  puramente de redacción/documentación, no un bug funcional, pero es exactamente el tipo de
  ambigüedad que ya causó un incidente real en este proyecto (ver `CLAUDE.md`, incidente de campos
  inventados) y vale la pena que la sesión principal aclare la palabra "exclusivo/EXCLUYENTE" en los
  comentarios para que quede inequívoco que se refiere a la consulta del catálogo, no a los dos
  campos del producto
- **Nota sobre la premisa original del pedido**: el enunciado de la tarea decía que el usuario había
  descrito los catálogos como "mutuamente excluyentes, nunca se combinan en un mismo canje" — esto
  es cierto solo para un **canje individual** (`redemption.isSpecial` decide contra qué catálogo se
  valida el producto elegido, `rewards.service.ts` líneas 260-262, nunca ambos a la vez en la misma
  transacción), pero **no** para los switches del producto en el catálogo administrable, que sí
  pueden coexistir en `true`. La implementación del frontend (sin bloqueo en el admin, un producto
  puede marcarse como ambos) es la correcta según el contrato real del backend

⚠️ Riesgos / casos borde no cubiertos (documentados, no bloqueantes):
- Sin test de componente para `useToggleItemSpecialReward`/la columna "Especial" de
  `ItemsSection.tsx` — mismo hueco de cobertura ya documentado y aceptado para "Canjeable"/
  "Disponible" en la auditoría anterior (`ROADMAP.md` módulo 4), no es una regresión nueva
- Sin test de componente para `StarPromotionsPage.tsx` (el shell de tabs nuevo) ni para
  `MilestonesSection.tsx` como página completa — la cobertura de `MilestonesSection` es a nivel de
  hooks (`hooks.test.tsx`) y del formulario (`RewardMilestoneForm.test.tsx`), no de la tabla/estados
  de carga-error-vacío/diálogo de borrado como interacción end-to-end de RTL. Mismo nivel de rigor
  que `PromotionsSection`/`StarPromotionsPage` original (tampoco tenían este test), pero sigue siendo
  un hueco explícito
- Sin prueba E2E/Playwright contra un backend real (local o producción) de ningún flujo de este
  módulo: crear un hito, editarlo, borrarlo, intentar un `starsRequired` duplicado y confirmar el 400
  real con el mensaje exacto, activar "Premio especial" de un producto real y confirmar que aparece
  en `GET /rewards/catalog?especial=true`. Toda la verificación fue: contrato contra código fuente
  real + tests de hook/componente con mocks + 2 mutaciones reales con reversión confirmada + 3
  corridas completas de la suite
- No se verificó el flujo de canje real en la app cliente (Flutter) que consume estos hitos/catálogo
  especial — fuera de alcance de este panel admin, pero es la consecuencia de negocio real de esta
  feature

Veredicto: **LISTO PARA MARCAR COMPLETO**, con el hallazgo de documentación (wording "EXCLUYENTE")
reportado explícitamente para corrección de comentarios (no de lógica — la lógica ya es correcta) y
los riesgos no bloqueantes de cobertura de tests de componente/E2E documentados arriba, consistentes
con el nivel de rigor ya aceptado en auditorías previas de módulos hermanos (Menú, Promociones de
estrellas).

---

## Auditoría: Menu — Salsas (catálogo `sauces` + checklist `sauceIds` por producto), commit `085091e`

Auditor: @tester (independiente). Fecha: 2026-08-26. Alcance: `src/features/menu/sauces/*`,
`src/features/menu/items/ItemForm.tsx`, `src/features/menu/MenuPage.tsx`, `src/features/menu/types.ts`,
`src/types/api.d.ts`.

✅ Pasó:
- `pnpm run type-check` (`tsc -b`): sin salida, cero errores. Repetido de forma independiente.
- `pnpm run lint` (`eslint .`): `0 errors, 1 warning`. El único warning
  (`react-hooks/incompatible-library`, `watch()` de RHF) está en
  `src/features/star-promotions/StarPromotionForm.tsx`, NO en archivos de esta feature. Los archivos
  de salsas pasan limpios.
- `pnpm run build` (`tsc -b && vite build`): `✓ built in 6.44s`, sin errores.
- **Contrato confirmado contra el código fuente real del backend** (accesible en
  `D:/proyecto-celtas/backend-celtas/`, NO reconstruido de Swagger):
  - `src/modules/sauces/sauces.controller.ts`: `GET /sauces`, `POST /sauces` (201/400/409),
    `PATCH /sauces/:id` (`@Param('id', ParseUUIDPipe)` + `@Body() UpdateSauceDto`),
    `DELETE /sauces/:id`. Guard `@Roles(ADMIN)`.
  - `src/modules/sauces/dto/create-sauce.dto.ts`: `name` (string, no vacío, requerido),
    `active?` (boolean), `sortOrder?` (int >= 0). `update-sauce.dto.ts` = `PartialType(CreateSauceDto)`
    → NO declara `id`.
  - `src/modules/sauces/entities/sauce.entity.ts`: `id`, `name` (unique), `active` (default true),
    `sortOrder`, `createdAt`, `updatedAt`. `findAll()` ordena `sortOrder ASC, name ASC` y NO carga
    la relación `menuItems` → el `Sauce` de `types.ts` (sin `menuItems`) coincide.
  - `src/modules/menu/dto/create-menu-item.dto.ts`: `sauceIds?: string[]` con
    `@IsArray` + `@IsUUID('4', { each: true })`, `@IsOptional`. `update-menu-item.dto.ts` =
    `PartialType`.
  - `src/modules/menu/entities/menu-item.entity.ts`: `@ManyToMany(() => Sauce)` + `@JoinTable`
    (`menu_item_sauces`). `menu.service.ts` `createItem`/`updateItem` separan `sauceIds` del resto,
    hacen `merge()` de lo demás y resuelven `item.sauces = saucesService.findByIds(sauceIds)` **solo
    si `sauceIds !== undefined`** (guard explícito). `findAllItems()` carga `relations: { sauces: true }`
    → `MenuItem.sauces` siempre presente en `GET /menu/items`.
  - `src/main.ts`: `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
    → un `id` en el body de un PATCH devuelve 400 "property id should not exist". Confirma la
    relevancia del fix de clase.
- `src/types/api.d.ts` regenerado correctamente: `CreateSauceDto` / `UpdateSauceDto` /
  `CreateMenuItemDto.sauceIds` / `UpdateMenuItemDto.sauceIds` coinciden campo a campo con los DTO
  reales. `types.ts` (`Sauce`, `MenuItem.sauces`, `CreateSauceInput`, `UpdateSauceInput`,
  `CreateMenuItemInput.sauceIds`) son espejo fiel (los responses no están en el Swagger:
  `content?: never`, así que el tipado a mano de respuestas es el patrón ya establecido del módulo).
- Hooks (`src/features/menu/sauces/hooks.ts`) tipados con los tipos-espejo (`get<Sauce[]>`,
  `post<Sauce>`, `patch<Sauce>`, `del<void>`) — sin `any`, sin `as unknown as`, sin `@ts-ignore`.
- **Fix de clase "id solo en el path del PATCH"**: `useUpdateSauce` hace
  `const { id, ...body } = input; patch(\`/sauces/${id}\`, body)`. Verificado por **mutación
  independiente**: revertí a `patch(\`/sauces/${id}\`, input)` → `hooks.test.tsx` falló 2/5
  (`AssertionError: expected { id: 's-2', ... } to deeply equal { active: false, sortOrder: 3 }`);
  restauré con `git checkout` → 5/5 en verde. El test de regresión NO pasa si se revierte el fix.
- **Salsas inactivas ya asignadas ("(oculta)") en `ItemForm.tsx`**: no había test de componente que
  lo cubriera → creé `src/features/menu/items/ItemForm.test.tsx` (5 tests). Verificado por mutación:
  (1) quité el sufijo `{!sauce.active ? ' (oculta)' : ''}` → 1/5 falló
  (`getByText(/Aji \(oculta\)/i)`); (2) cambié `defaultValues.sauceIds` de
  `item?.sauces.map((s) => s.id) ?? []` a `[]` → 2/5 fallaron (checkbox pre-marcado + payload
  `['s-aji','s-mayo']` y el test de "desmarcar"). Ambas mutaciones restauradas con `git checkout`,
  5/5 en verde tras restaurar. `git status` tras la auditoría: solo `?? ItemForm.test.tsx` (ningún
  archivo de producción quedó modificado).
- Catálogo de salsas vacío en `ItemForm`: muestra el mensaje explícito
  "Todavía no hay salsas en el catálogo. Créalas primero en la pestaña "Salsas" del Menú." y no
  rinde checkboxes — cubierto por test.
- Payload `sauceIds`: `buildPayload` siempre manda `sauceIds: values.sauceIds` (array de strings,
  nunca `undefined`, nunca objetos) — cubierto por 3 tests (pre-asignadas conservadas, alta de una
  nueva = `['s-mayo']`, desmarcar la última = `[]`).
- Estados de UI:
  - `SaucesSection.tsx`: loading (`LoadingState`), error (`ErrorState` con `onRetry`), vacío
    (mensaje explícito), poblado (tabla). Diálogo de borrado con su propio manejo de error
    (`deleteError` en `Alert`), botón deshabilitado mientras `isPending`.
  - `SauceForm.tsx`: 409 de nombre duplicado → `setError('name', ...)` con el mensaje del backend
    tal cual (regex `/nombre/i`), fallback a `serverError` genérico. Mismo patrón que
    `CategoryForm`/`ItemForm`. `name` se envía `.trim()`.
  - `ItemForm.tsx` sección salsas: loading ("Cargando salsas…"), error (`Alert`, el producto se
    puede guardar igual — cubierto por test), vacío (mensaje), poblado (checkboxes). El `id` de la
    salsa nunca viaja en el body de un PATCH (el checklist solo produce `sauceIds`, y
    `useUpdateItem` ya separa el `id` en el path — fix de clase preexistente y con test propio).
- `useUpdateSauce` y `useDeleteSauce` invalidan además `['menu', 'items']` (renombrar/ocultar/borrar
  una salsa afecta la vista embebida del producto) — correcto.
- Sin hex hardcodeado en los archivos de la feature; usa tokens celtas (`bg-celtas-orange`,
  `text-celtas-red-light`, `ring-celtas-orange/40`, etc.). Sin texto de UI en inglés.
- `pnpm exec vitest run src/features/menu`: 4 archivos / 14 tests en verde de forma aislada y
  repetible (incluye `ItemForm.test.tsx` nuevo, 5/5). Suite completa con `--maxWorkers=2`:
  221/221 (34 archivos).

❌ Falló:
- (ninguno bloqueante)

⚠️ Riesgos / casos borde no cubiertos (documentados, no bloqueantes):
- **`pnpm run test` (parallelism por defecto) es flaky en este entorno por saturación de CPU**:
  tres corridas dieron `6`, `4` y `15` tests en rojo, con conjuntos DISTINTOS cada vez
  (`banners/BannerForm`, `coupons/GenerateCouponForm` y `GenerateBulkCouponForm`,
  `settings/DeliverySettingsCard`, `users/UserDetailDialog`, `marketing/BroadcastForm`,
  `orders/OrderDetailDialog`, `reward-milestones/RewardMilestoneForm`, y en la peor corrida 3 de
  los 5 tests nuevos de `ItemForm.test.tsx`), **todos** con `Error: Test timed out in 5000ms` y
  siempre en tests que hacen `userEvent` + `waitFor`. NO es lógica: con
  `pnpm exec vitest run --maxWorkers=2` la suite completa pasa **221/221 (34 archivos)**, y
  `ItemForm.test.tsx` en aislamiento pasa 5/5 de forma determinista (3 corridas seguidas). Es un
  problema de infra preexistente que afecta por igual a los tests de regresión de cupones/banners/
  settings/users, no una regresión de esta feature. Sugerencia para la sesión principal: fijar
  `poolOptions`/`maxWorkers` o subir `testTimeout` en `vitest.config.ts`.
- `ItemForm.tsx` muestra **todas** las salsas inactivas del catálogo en el checklist, no solo las
  que el producto ya tiene asignadas. El ROADMAP describe "las inactivas se muestran igual si el
  producto ya las tenía asignadas". El efecto práctico: el admin puede asignar una salsa oculta a
  un producto nuevo desde el form. El backend lo acepta (`findByIds` no filtra por `active`). No es
  un bug —no se pierde ninguna relación, que es el objetivo declarado— pero diverge del wording y
  vale confirmarlo con la sesión principal si el diseño buscado era más estricto.
- `itemSchema.sauceIds` es `z.array(z.string())` sin `.uuid()`; el `sauceSchema` no valida longitud
  de `name`. Validación laxa en cliente, el backend valida de verdad (`@IsUUID('4', { each: true })`,
  `@IsNotEmpty`). Cosmético.
- `CreateSauceInput`/`UpdateSauceInput` en `types.ts` duplican a mano `CreateSauceDto`/`UpdateSauceDto`
  ya presentes en `api.d.ts`. Es el mismo patrón que `CreateMenuItemInput`/`CreateCategoryInput`
  preexistentes (no una desviación nueva de esta feature), pero sigue siendo tipo de request escrito
  a mano existiendo el generado.
- `MenuPage.tsx`: el `<header>` sigue diciendo "Gestiona las categorías y productos…" y el JSDoc
  "Dos vistas: categorías y productos (tabs)" — quedaron desactualizados con la 3ª pestaña "Salsas".
  Solo texto/comentario, no afecta funcionamiento.
- Sin prueba E2E/Playwright ejecutada por @tester (la sesión principal reportó una sesión manual de
  Playwright en el commit, no reproducida acá). Toda la verificación de @tester fue: contrato contra
  código fuente real del backend + tests de hook/componente + 3 mutaciones reales con reversión
  confirmada (1 en `hooks.ts`, 2 en `ItemForm.tsx`) + corridas de la suite.
- Sin test de componente de `SaucesSection.tsx` como página (tabla/estados/diálogo de borrado
  end-to-end con RTL) — mismo nivel de cobertura que `CategoriesSection`/`ItemsSection`, que tampoco
  lo tienen. Hueco explícito, no regresión.

Veredicto: **LISTO PARA MARCAR COMPLETO** (`ROADMAP.md` línea ~176). Type-check, lint y build
limpios; contrato confirmado contra el backend real; fix de clase "id solo en el path" con test de
regresión que falla si se revierte; regla de "salsas ocultas ya asignadas" ahora con test de
componente propio (`ItemForm.test.tsx`) verificado por mutación. Los ítems ⚠️ son no bloqueantes y
quedan documentados para la sesión principal.

## Auditoría: Menu — Bebidas y Porciones Extras (catálogos `beverages`/`extra-portions` + checklist
de grupo en `ItemForm`)

Auditor: @tester (independiente). Fecha: 2026-09-15. Alcance: `src/features/menu/beverages/*`,
`src/features/menu/extra-portions/*`, `src/features/menu/items/ItemForm.tsx`,
`src/features/menu/MenuPage.tsx`, `src/features/menu/types.ts`, `src/types/api.d.ts`, y el fix de
clase `noValidate` en los 5 `<form>` del módulo Menú.

✅ Pasó:
- `pnpm run type-check` (`tsc -b`): sin salida, cero errores.
- `pnpm run lint` (`eslint .`): `0 errors, 1 warning` (el mismo warning preexistente y ajeno de
  `StarPromotionForm.tsx`, no de esta feature).
- `pnpm run build`: `✓ built in 7.89s`, sin errores ni warnings de tamaño nuevos.
- `pnpm exec vitest run --maxWorkers=2`: **269/269** (39 archivos) — incluye los 12 tests nuevos
  agregados por @tester (ver hallazgos abajo) sobre los 257 que ya traía la sesión principal.
- **Contrato confirmado contra el código fuente real del backend** (`D:/proyecto-celtas/backend-celtas/`,
  no reconstruido de Swagger):
  - `src/modules/beverages/entities/beverage.entity.ts` y
    `src/modules/extra-portions/entities/extra-portion.entity.ts`: `id`, `name` (unique), `price`
    (`decimal(10,2)` con transformer a `number`), `active` (default true), `sortOrder`,
    `createdAt`/`updatedAt` — coincide campo a campo con `Beverage`/`ExtraPortion` en `types.ts`.
  - `dto/create-beverage.dto.ts` / `create-extra-portion.dto.ts`: `price` con
    `@IsNumber({ maxDecimalPlaces: 2 })` + `@Min(0.01, 'El precio debe ser mayor a cero')` — el
    schema Zod de `BeverageForm`/`ExtraPortionForm` es espejo exacto (mismos 3 mensajes en
    español). `update-*.dto.ts` = `PartialType(Create*Dto)` → NO declaran `id`.
  - `*.controller.ts`: `GET`/`POST /beverages`, `PATCH`/`DELETE /beverages/:id` (mismo patrón en
    `extra-portions`), guard `@Roles(ADMIN)`.
  - `*.service.ts` `remove()`: sin bloqueo por uso (catálogo de etiquetas, no FK con historial —
    `OrderItem.selectedBeverages`/`selectedExtraPortions` guardan `{name, price}` como snapshot);
    borra explícitamente de `menu_item_beverages`/`menu_item_extra_portions` antes del delete para
    evitar un 500 por FK. El texto de confirmación de borrado en `BeveragesSection`/
    `ExtraPortionsSection` coincide con este comportamiento real.
  - `menu-item.entity.ts`: `beverages`/`extraPortions` (`@ManyToMany` + `@JoinTable`),
    `beverageGroupRequired`/`extraPortionsGroupRequired` (boolean, default `false`),
    `beverageGroupMaxSelectable`/`extraPortionsGroupMaxSelectable` (int, default `1`) — coincide
    campo a campo con `MenuItem` en `types.ts`, incluidos los defaults usados en
    `defaultValues` de `ItemForm.tsx` (`?? false`, `?? 1`).
  - `dto/create-menu-item.dto.ts`: `beverageIds?`/`extraPortionIds?` (`@IsArray` +
    `@IsUUID('4', { each: true })`), `*GroupRequired?` (`@IsBoolean`), `*GroupMaxSelectable?`
    (`@IsInt` + `@Min(1)`) — espejo exacto de `CreateMenuItemInput` en `types.ts`.
  - `menu.service.ts` `createItem`/`updateItem`: separan `sauceIds`/`beverageIds`/`extraPortionIds`
    del resto, `merge()` para lo demás, y resuelven cada relación **solo si el campo no es
    `undefined`** (mismo guard ya confirmado para `sauceIds`) — `ItemForm.tsx` siempre manda los
    tres arrays como `string[]` (nunca `undefined`), consistente con ese guard.
  - `src/main.ts`: `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` — confirma que
    un `id` colado en el body de `PATCH /beverages/:id` o `/extra-portions/:id` devuelve 400
    "property id should not exist".
- `src/types/api.d.ts` regenerado correctamente (`git diff --stat`: 623 inserciones, 2 eliminaciones):
  trae `/beverages`, `/beverages/{id}`, `/extra-portions`, `/extra-portions/{id}`,
  `CreateBeverageDto`/`UpdateBeverageDto`/`CreateExtraPortionDto`/`UpdateExtraPortionDto`, y los 6
  campos nuevos en `CreateMenuItemDto`/`UpdateMenuItemDto` — todo coincide campo a campo con el
  código fuente real revisado arriba.
- **Fix de clase "id solo en el path del PATCH"** aplicado desde el primer intento en
  `useUpdateBeverage`/`useUpdateExtraPortion` (`const { id, ...body } = input`). **Verificado por
  mutación real (2 mutaciones independientes, Edit puntual + reverso)**: cambié ambos hooks para
  mandar `input` completo (con `id`) en el body → **4 de 10 tests fallaron exactamente como se
  esperaba** (`useUpdateBeverage`/`useUpdateExtraPortion`, "el id SOLO en el path" y "conserva los
  campos editables", `AssertionError: expected { id: ... } to not have property "id"` /
  `to deeply equal {...sin id}`); restauré ambos hooks y `10/10` volvieron a pasar
  (`hooks.test.tsx` de ambos módulos).
- Precio: schema Zod espejo del DTO (`Number.isFinite` → "El precio debe ser un número",
  `v >= 0.01` → "El precio debe ser mayor a cero", `Math.round(v*100)/100 === v` → "Máximo 2
  decimales"), con `noValidate` en el `<form>` para que el mensaje de Zod se muestre en vez de que
  el navegador bloquee el submit silenciosamente (mismo bug de clase ya documentado en Cupones).
  Casos ya cubiertos por la sesión principal: precio válido con decimales, `0`, más de 2 decimales,
  edición conserva el `id` solo para la mutación, 409 de nombre duplicado → campo `name`.
- **Hallazgo de @tester, cerrado en esta misma auditoría (no bloqueante, agregué los tests yo
  mismo)**: la tarea pedía explícitamente revisar "precio negativo escrito directo sin pasar por
  el spinner" y "campo vacío" — ninguno de los dos estaba cubierto (el único test de precio
  inválido usaba `'0'`, pese a que su título decía "0 o negativo"). Agregué 2 tests por formulario
  (`BeverageForm.test.tsx`, `ExtraPortionForm.test.tsx`): tipear `'-5'` directo y dejar el campo
  vacío al enviar — ambos casos **ya funcionan correctamente** con el código actual (el `-5` cae en
  el refine `v >= 0.01` → "El precio debe ser mayor a cero"; el campo vacío coacciona a `0` por el
  mismo camino), pero no había ninguna prueba que lo demostrara. 14/14 en verde tras agregarlos.
- **Hallazgo de @tester, cerrado en esta misma auditoría (el más relevante de la ronda)**: la
  sesión principal actualizó los mocks de `useBeverages`/`useExtraPortions` en
  `ItemForm.test.tsx` para que el componente no crasheara, pero **no dejó ningún test ejercitando
  el comportamiento real de esas dos secciones nuevas** — la paridad con el checklist de salsas
  (inactiva ya asignada "(oculta)", catálogo vacío, payload como `string[]`, alta/baja) y la config
  de grupo (`Obligatorio`/`Máximo a elegir`) estaban sin cubrir. Agregué 12 tests nuevos (2
  describes: "ItemForm - checklist de bebidas" y "ItemForm - checklist de porciones extras", 6 cada
  uno, espejo exacto de los 5 ya existentes para salsas + 1 nuevo de config de grupo por sección).
  **Verificado por mutación real (2 mutaciones independientes, Edit puntual + reverso)**:
  (1) quité el sufijo `{!beverage.active ? ' (oculta)' : ''}` en `ItemForm.tsx` → el test "una
  bebida inactiva ya asignada se muestra..." falló exactamente como se esperaba
  (`TestingLibraryElementError: Unable to find an element with the text: /Fanta \(oculta\)/i`);
  (2) forcé `beverageGroupMaxSelectable: 1` fijo en `buildPayload` (en vez de
  `values.beverageGroupMaxSelectable`) → el test de config de grupo falló exactamente como se
  esperaba (`expected 1 to be 2`). Ambas mutaciones restauradas, `17/17` en `ItemForm.test.tsx`
  tras restaurar. `git status` tras la auditoría: solo archivos `*.test.tsx` modificados, ningún
  archivo de producción quedó tocado.
- Consistencia de UX entre Salsas/Bebidas/Porciones Extras en `ItemForm.tsx`: los tres bloques
  comparten estructura idéntica (loading/error/vacío con el mismo wording adaptado, checklist de
  `Checkbox` + sufijo "(oculta)", payload siempre `string[]`) — confirmado línea por línea
  comparando los tres bloques del JSX. `BeveragesSection.tsx`/`ExtraPortionsSection.tsx` son
  espejo estructural de `SaucesSection.tsx` (diff normalizado por nombre = solo texto/naming),
  con la columna "Precio" agregada.
- El checklist de grupo (switch "Obligatorio" + input "Máximo a elegir") solo se renderiza cuando
  el catálogo respectivo tiene al menos un elemento — con catálogo vacío no aparece ni el
  checklist ni la config de grupo (cubierto por los 2 tests nuevos de "catálogo vacío"), sin
  romper el caso ya existente de "catálogo de salsas vacío" (sigue en verde, sin cambios).
- `noValidate` agregado a los 5 `<form>` del módulo (`ItemForm`, `SauceForm`, `CategoryForm`,
  `BeverageForm`, `ExtraPortionForm`) — confirmado con `grep` que los 5 lo tienen y que ninguno de
  los otros módulos (`settings`, `coupons`, `star-promotions`, `reward-milestones`, `banners`) fue
  tocado, tal como reportó la sesión principal. Coincide con el bug de clase ya conocido en
  Cupones (`minPurchaseAmount`/`percentage`).

❌ Falló:
- (ninguno bloqueante)

⚠️ Riesgos / casos borde no cubiertos (documentados, no bloqueantes):
- **Bug de clase pendiente fuera de este alcance**: `settings`, `coupons` (formularios que aún no
  lo tenían), `star-promotions`, `reward-milestones` y `banners` siguen teniendo `<input
  type="number">` con `min`/`step` nativos sin `noValidate` en sus `<form>` — mismo patrón de
  riesgo ya identificado y corregido en Menú y en `GenerateCouponForm`/`GenerateBulkCouponForm`.
  Vale la pena un barrido dedicado en una sesión futura (regla del proyecto: "si encuentras un bug
  de clase, haz un barrido completo antes de continuar" — este barrido específico quedó fuera del
  alcance pedido para esta auditoría).
- Sin validación explícita en cliente de que `*GroupMaxSelectable` no supere la cantidad de
  elementos del catálogo elegidos para ese producto (ej. marcar 1 bebida pero dejar "Máximo a
  elegir" en 5) — el backend tampoco lo valida (`@Min(1)` es la única cota), así que no es una
  regresión de este frontend, solo un caso borde de UX no resuelto por ninguno de los dos lados.
- Los 4 campos de config de grupo (`*Required`/`*MaxSelectable`) no tienen tests directos de
  "tipear directo sin pasar por el spinner" (negativo/vacío) como sí los tiene `price` — el schema
  Zod usa el mismo patrón ya probado (`z.coerce.number().int().min(...)` + `noValidate`), así que
  el riesgo es bajo, pero no se verificó explícitamente con un test nuevo en esta ronda.
- Mismos huecos ya aceptados y heredados de Salsas: sin test de componente de
  `BeveragesSection.tsx`/`ExtraPortionsSection.tsx` como página end-to-end (tabla/diálogo de
  borrado con RTL); `MenuPage.tsx` sigue con el `<header>`/JSDoc desactualizado ("Dos vistas:
  categorías y productos") pese a que ahora son 5 pestañas — puramente cosmético, señalado también
  en la auditoría de Salsas y aún no corregido; `itemSchema.beverageIds`/`extraPortionIds` son
  `z.array(z.string())` sin `.uuid()` (mismo criterio laxo ya aceptado para `sauceIds`); sin
  prueba E2E/Playwright de esta feature específica.

Veredicto: **LISTO**. `type-check`/`lint`/`build` limpios; contrato confirmado línea por línea
contra el código fuente real del backend; fix de clase "id solo en el path" con test de regresión
que falla si se revierte (verificado por mutación en ambos hooks nuevos); huecos de cobertura
reales encontrados (checklist de bebidas/porciones extras y casos borde de precio sin tests) y
cerrados por @tester en esta misma auditoría con 16 tests nuevos, todos verificados por mutación
donde aplicaba. Los ítems ⚠️ son no bloqueantes y quedan documentados para la sesión principal.

## Auditoría: Menu — Grupo obligatorio/máximo a elegir en Salsas (`sauceGroupRequired`/
`sauceGroupMaxSelectable`), commit `2606fa2`

Auditor: @tester (independiente). Fecha: 2026-09-17. Alcance: el retrofit de
`sauceGroupRequired`/`sauceGroupMaxSelectable` sobre el catálogo de salsas, agregando paridad con
`beverageGroupRequired`/`beverageGroupMaxSelectable` y
`extraPortionsGroupRequired`/`extraPortionsGroupMaxSelectable` (ya auditados en la sección
anterior). Nota: la auditoría original de Salsas (`085091e`, ver arriba) **no incluía** estos dos
campos — el catálogo `sauces` nació sin config de grupo y la recibió después, en este commit. Es la
primera vez que se audita este par de campos específicamente para salsas.

✅ Pasó:
- `pnpm run type-check` (`tsc -b`): sin salida, cero errores. Corrido de forma independiente.
- `pnpm run lint` (`eslint .`): `0 errors, 1 warning` — el mismo warning preexistente y ajeno de
  `StarPromotionForm.tsx` (`react-hooks/incompatible-library` por `watch()`), no relacionado con
  esta feature.
- `pnpm run build`: `✓ built in 779ms`, sin errores.
- `pnpm run test`: **278/278** (40 archivos) en el primer pase, igual a lo reportado por la sesión
  principal. Tras agregar el test nuevo (ver hallazgo abajo): **279/279** (40 archivos).
- **Contrato confirmado contra el código fuente real de `backend-celtas`**
  (`D:/proyecto-celtas/backend-celtas/`, no reconstruido de Swagger):
  - `src/modules/menu/dto/create-menu-item.dto.ts` líneas 95-112: `sauceGroupRequired?: boolean`
    (`@IsOptional`, `@IsBoolean`) y `sauceGroupMaxSelectable?: number` (`@IsOptional`, `@IsInt`,
    `@Min(1)`) — espejo exacto del schema Zod en `ItemForm.tsx` (`z.boolean()` sin default propio,
    `z.coerce.number().int().min(1)`) y de `CreateMenuItemInput` en `types.ts`.
  - `src/modules/menu/entities/menu-item.entity.ts` líneas 106/113: mismas columnas, mismo patrón
    de default (`boolean` default `false`, `int` default `1`) que `beverageGroupRequired`/
    `extraPortionsGroupRequired` — confirma que `defaultValues` de `ItemForm.tsx`
    (`item?.sauceGroupRequired ?? false`, `item?.sauceGroupMaxSelectable ?? 1`) usa los defaults
    correctos.
  - `src/modules/menu/menu.service.ts`: `createItem`/`updateItem` no tienen ninguna validación
    cruzada entre `sauceGroupMaxSelectable` y el tamaño de `sauceIds` — el campo se guarda tal cual
    llega, sin relación con el catálogo elegido. Mismo comportamiento confirmado para
    `beverageGroupMaxSelectable`/`extraPortionsGroupMaxSelectable` (ninguno de los tres tiene esa
    cota en el backend).
  - `src/modules/orders/orders.service.ts` líneas 624-634 y `validateGroupSelection` (líneas
    794-815): la validación real de `sauceGroupRequired`/`sauceGroupMaxSelectable` ocurre en tiempo
    de pedido (`POST /orders`), no en la creación/edición del producto — `sauceGroupRequired`
    dispara 400 si el cliente no elige ninguna salsa y el grupo la ofrece, y
    `sauceGroupMaxSelectable` dispara 400 si el cliente elige más de las permitidas. Confirmado
    también el comentario explícito del backend: "Sin efecto si el producto no ofrece nada de esta
    categoría (`offered` vacío o ausente)" — coincide palabra por palabra con el JSDoc ya puesto en
    `ItemForm.tsx` ("Sin efecto si `sauces` está vacío") y en `types.ts`. Esta misma función
    (`validateGroupSelection`) es compartida por los tres grupos (salsas/bebidas/porciones extras),
    así que el comportamiento es idéntico entre los tres, sin caso especial para salsas.
  - `src/types/api.d.ts` regenerado: confirmado por la sesión principal (`sauceGroupRequired?:
    boolean` y `sauceGroupMaxSelectable?: number` en `CreateMenuItemDto`/`UpdateMenuItemDto`) y
    re-verificado por @tester leyendo `types.ts` (líneas 52-56 en `MenuItem`, 153-157 en
    `CreateMenuItemInput`) — sin castings forzados ni `any`.
- **Verificado con mutación real (3 mutaciones independientes, Edit puntual + reverso, `git diff
  --stat` confirmó `ItemForm.tsx` sin cambios netos tras cada reverso)**:
  1. `defaultValues.sauceGroupRequired: item?.sauceGroupRequired ?? false` → `false` fijo: el test
     "al editar un producto con sauceGroupRequired=true, el switch 'Obligatorio' carga marcado..."
     falló exactamente como se esperaba (`toBeChecked()` con `aria-checked="false"` real).
  2. Quité `{...register('sauceGroupMaxSelectable')}` del `<Input id="item-sauce-max">` → el test
     "el input 'Máximo a elegir' muestra 3" falló exactamente como se esperaba (`toHaveValue(3)`
     recibió `null`); confirmado además que esto NO rompió los tests equivalentes de
     bebidas/porciones extras (aislamiento correcto por campo).
  3. En `buildPayload`, quité la línea `sauceGroupRequired: values.sauceGroupRequired` → el test
     "se conserva en el payload sin tocarlo" falló con `expected undefined to be true` (detecta
     también la omisión silenciosa del campo en el payload, no solo el estado visual del switch).
- **Hallazgo de @tester, cerrado en esta misma auditoría**: a diferencia de los bloques de bebidas
  y porciones extras (que sí tienen un test "cambiar 'Máximo a elegir' y activar 'Obligatorio' se
  refleja en el payload" con interacción real de usuario), el bloque de salsas en
  `ItemForm.test.tsx` solo tenía tests de **carga** (`sauceGroupRequired=true` se preserva sin
  tocarlo, `sauceGroupMaxSelectable=3` se muestra) pero ninguno que ejercitara el **cambio en vivo**
  de ambos controles. Agregué el test faltante (paridad exacta con el de bebidas/porciones extras):
  tipea `2` en "Máximo a elegir", activa el switch "Obligatorio", envía, y confirma
  `sauceGroupMaxSelectable: 2` / `sauceGroupRequired: true` en el payload. **Verificado por
  mutación**: forzar `sauceGroupMaxSelectable: 1` fijo en `buildPayload` (en vez de
  `values.sauceGroupMaxSelectable`) → el test nuevo falló exactamente como se esperaba (`expected 1
  to be 2`); restaurado, `22/22` en `ItemForm.test.tsx` (279/279 en la suite completa).
  `git status` tras la auditoría: solo `src/features/menu/items/ItemForm.test.tsx` modificado,
  ningún archivo de producción quedó tocado.
- Consistencia con beverages/extras: el switch "Obligatorio" y el input "Máximo a elegir" de salsas
  usan exactamente el mismo patrón JSX (`Controller` + `Switch` / `register` + `Input type=number`)
  y el mismo `aria-label` estructurado (`"El cliente debe elegir una salsa"`), confirmado
  comparando línea por línea los tres bloques en `ItemForm.tsx`.

❌ Falló:
- (ninguno bloqueante)

⚠️ Riesgos / casos borde no cubiertos (documentados, no bloqueantes):
- **Heredado, ya documentado en la auditoría de Bebidas/Porciones Extras y confirmado también acá
  contra el backend real**: no hay validación (ni en frontend ni en backend) de que
  `sauceGroupMaxSelectable` no supere la cantidad de salsas realmente marcadas para el producto
  (ej. marcar 1 sola salsa pero dejar "Máximo a elegir" en 5) — consistente entre los tres grupos,
  no es una regresión de esta feature puntual.
- Mismo hueco heredado: `itemSchema.sauceIds` es `z.array(z.string())` sin `.uuid()` (validación
  laxa ya aceptada desde la auditoría original de Salsas).
- No se verificó visualmente en navegador (Playwright) esta feature puntual — el usuario decidió
  omitir esa parte de la auditoría por falta de credenciales de admin a mano en esta sesión. La
  auditoría original de Salsas (`085091e`) sí tuvo verificación visual completa, pero no incluía
  estos dos campos porque no existían todavía.
- Sin test dedicado de "tipear directo sin pasar por el spinner" (negativo/vacío) en
  `sauceGroupMaxSelectable` — mismo hueco ya aceptado en la auditoría de Bebidas/Porciones Extras
  para sus campos equivalentes (`noValidate` + `z.coerce.number().int().min(1)` ya cubre el caso a
  nivel de patrón, pero no hay un test explícito nuevo para salsas en esta ronda).

Veredicto: **LISTO**. `type-check`/`lint`/`build` limpios (independiente); contrato confirmado
línea por línea contra el código fuente real del backend, incluida la validación real en tiempo de
pedido (`orders.service.ts`) que confirma el efecto de ambos campos; 3 mutaciones independientes
confirmaron que los tests de regresión existentes realmente fallan si se revierte el fix; 1 hueco
de cobertura real encontrado (falta de test de interacción en vivo para el switch/input de salsas,
a diferencia de bebidas/porciones extras) y cerrado por @tester en esta misma auditoría, también
verificado por mutación. Los ítems ⚠️ son no bloqueantes, heredados de auditorías previas, y quedan
documentados para la sesión principal.

## Auditoría: Menu — Bebida gratis en combos (`Beverage.includeFreeTo`)

Auditor: @tester (independiente). Fecha: 2026-09-16. Alcance: `src/features/menu/types.ts`,
`src/features/menu/beverages/BeverageForm.tsx`, `src/features/menu/beverages/BeverageForm.test.tsx`,
`src/features/menu/items/ItemForm.test.tsx`, `src/types/api.d.ts`.

✅ Pasó:
- `pnpm run type-check` (`tsc -b`): sin salida, cero errores.
- `pnpm run lint` (`eslint .`): `0 errors, 1 warning` (mismo warning preexistente y ajeno de
  `StarPromotionForm.tsx`).
- `pnpm run build`: build limpio, sin warnings nuevos.
- `pnpm exec vitest run --maxWorkers=2`: **277/277** (40 archivos).
- Contrato: `Beverage.includeFreeTo: string[] | null` y `CreateBeverageInput.includeFreeTo?:
  string[]` en `types.ts` coinciden con `CreateBeverageDto`/`UpdateBeverageDto` regenerados en
  `src/types/api.d.ts` (`includeFreeTo?: string[]`, único diff real del regenerado en este
  archivo aparte de dos cambios ajenos de otro módulo — `OrdersController_listMine` y la
  `description` de `/rewards/catalog` — que confirman que se regeneró contra el swagger real, no
  a mano). Como es esperable en este proyecto, Swagger no documenta el shape de la entidad
  `Beverage` en las respuestas GET, así que el campo en `types.ts` queda tipado a mano — mismo
  patrón ya aceptado para el resto del módulo Menú.
- `useUpdateBeverage` (sin tocar en este cambio) sigue mandando el `id` solo en el path
  (`const { id, ...body } = input`), así que `includeFreeTo` viaja dentro del body del PATCH sin
  arrastrar el bug de clase.
- `buildPayload`/`onSubmit` de `BeverageForm.tsx` siempre manda `includeFreeTo` como `string[]`
  (nunca `undefined`/`null`), consistente con `sauceIds`/`beverageIds`/`extraPortionIds` de
  `ItemForm.tsx`.
- Estados de UI del checklist de combos: loading ("Cargando productos…"), error (`Alert` sin
  bloquear el guardado de la bebida) y vacío ("Todavía no hay productos…") — los tres cubiertos
  explícitamente en el JSX, aunque **sin test de componente para los tres casos** (ver hallazgo
  abajo).
- **Verificado por mutación (2 mutaciones independientes, Edit puntual + reverso)**:
  1. Forcé `includeFreeTo: []` fijo en el payload de `onSubmit` (en vez de
     `values.includeFreeTo`) → **3 de 10 tests de `BeverageForm.test.tsx` fallaron exactamente
     como se esperaba** ("crea una bebida marcada como gratis...", "al editar, actualiza
     includeFreeTo...", "al editar, quita un combo desmarcado..." — los tres con
     `AssertionError: expected [] to deeply equal [...]`).
  2. Restauré (1), y luego quité la rama de remoción del handler `onCheckedChange` (el checkbox
     solo agregaba, nunca filtraba al desmarcar) → **el test "al editar, quita un combo
     desmarcado de includeFreeTo" falló** (`expected [ 'combo-1', 'combo-2', 'combo-1' ] to
     deeply equal [ 'combo-2' ]`), los otros 9 siguieron en verde.
  Restauré ambas mutaciones desde una copia de respaldo; `git diff --stat` volvió a
  `69 insertions(+), 2 deletions(-)` en `BeverageForm.tsx`, idéntico al estado entregado; la
  suite de `BeverageForm.test.tsx` + `ItemForm.test.tsx` volvió a 31/31.

❌ Falló:
- (ninguno bloqueante)

⚠️ Riesgos / casos borde no cubiertos (documentados, no bloqueantes):
- **Gap de UX real, no de código**: la regla de negocio más importante de este cambio —
  "`includeFreeTo` de una bebida SOLO tiene efecto en un producto que ADEMÁS tenga esa bebida
  asignada como opción propia"— hoy solo se comunica con un párrafo de texto fijo en
  `BeverageForm.tsx` ("marcarla acá sola no la agrega como opción"). El checklist de combos NO
  cruza, por cada `menuItem`, si ese producto ya tiene la bebida en `menuItem.beverages` (el dato
  sí viaja embebido en `GET /menu/items`, confirmado en `types.ts`: `MenuItem.beverages:
  Beverage[]`) para avisar en el momento — por ejemplo con un sufijo tipo "(bebida no asignada
  como opción todavía)". Sin este aviso puntual, un admin puede marcar tranquilamente un combo
  que en la práctica no tendrá el efecto esperado, y solo el texto genérico de arriba lo previene.
  No es un bug (el comportamiento del backend se respeta y el payload es correcto), pero es
  exactamente el tipo de regla "silenciosa" que este proyecto ya ha preferido hacer explícita en
  la UI en otros módulos (ej. "(oculta)" en salsas/bebidas/porciones extras, "(sin coincidencia)"
  en banners). Sugerido para una vuelta de pulido futura, no bloqueante.
- Sin test de componente que ejercite explícitamente los 3 estados de UI del checklist de combos
  (`isLoading`/`isError`/catálogo vacío) en `BeverageForm.test.tsx` — se verificó leyendo el JSX
  que las tres ramas existen y no rompen el guardado de la bebida, pero no hay una aserción
  automatizada por cada rama (mismo hueco de cobertura, más leve, que el que @tester encontró y
  cerró en la auditoría anterior de Bebidas/Porciones Extras).
- `BeveragesSection.tsx` (la tabla del catálogo) no muestra ninguna indicación de en cuántos/qué
  combos una bebida es gratis — solo se ve entrando a editarla. No es un requisito pedido, se
  documenta como posible mejora de visibilidad.
- Sin prueba E2E/Playwright de este cambio específico contra el backend real.

Veredicto: **LISTO**. `type-check`/`lint`/`build` limpios (repetidos por @tester de forma
independiente); `pnpm exec vitest run --maxWorkers=2` en 277/277 (40 archivos); contrato de
`includeFreeTo` confirmado contra `src/types/api.d.ts` regenerado (sin `any` ni castings
forzados); `id` sigue sin viajar en el body del PATCH; los 3 tests nuevos de `BeverageForm.test.tsx`
son regresiones reales — verificado por mutación que fallan si se revierte tanto el envío del
campo en el payload como la lógica de quitar un combo desmarcado, y que vuelven a pasar al
restaurar el código original. El único hallazgo es un gap de UX no bloqueante (falta de aviso
puntual por producto cuando el combo elegido no tiene la bebida asignada como opción), documentado
arriba para la sesión principal.

**Addendum (misma sesión, post-auditoría):** se cerró el gap de UX arriba. `BeverageForm.tsx`
ahora cruza, por cada `menuItem` del checklist, si `menuItem.beverages` ya incluye esta bebida
(dato embebido en `GET /menu/items`) y agrega el sufijo " (bebida no asignada como opción)" cuando
no es el caso — mismo criterio que el sufijo "(no disponible)" ya usado ahí mismo. Se agregó el
test "avisa cuando un combo no tiene la bebida asignada como opción todavía". Los tests que
seleccionan combos por texto exacto se ajustaron a un matcher por prefijo (`/^Combo X/`) para no
quedar acoplados al sufijo. Suite completa vuelve a verificarse en 278/278 (40 archivos),
`type-check`/`lint`/`build` limpios.

