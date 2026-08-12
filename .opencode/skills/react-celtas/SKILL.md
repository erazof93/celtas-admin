---
name: react-celtas
description: Convenciones y patrones específicos del panel admin de Celtas en React + Vite + TypeScript (manejo de auth con Zustand, cliente Axios con refresh automático, hooks de React Query por recurso, paleta de colores, generación de tipos desde Swagger). Usar siempre que se cree o modifique un componente, hook, formulario o llamada a la API.
license: MIT
metadata:
  project: celtas-admin
  audience: opencode-agent
---

## Cuándo usar esta skill

Cargar esta skill antes de crear o modificar cualquier componente, hook de React Query,
formulario, o llamada a la API dentro de `src/`. Contiene las decisiones de diseño ya tomadas
para este proyecto, para no reinventarlas en cada módulo.

## Backend que consumimos

```
Base URL (prod):  https://backend-celtas.onrender.com
Swagger JSON:     https://backend-celtas.onrender.com/docs-json
```

El backend está terminado, auditado y estable. Antes de escribir una llamada nueva a la API,
confirma el contrato exacto (método, path, body, response, códigos de error) contra
`src/types/api.d.ts` (generado desde Swagger) o directamente contra `/docs-json`. Nunca asumas
la forma de los datos.

### ⚠️ Verificación de código real de proyectos hermanos

**Nunca reconstruyas código de un proyecto backend basándote solo en:**
- Descripciones de Swagger/OpenAPI
- Inferencias sobre la estructura de DTOs
- Patrones "probables" basados en convenios comunes

Esto ya causó un incidente real en este proyecto donde se presentaron implementaciones
falsas de campos que nunca existieron en el backend, requiriendo corrección posterior tras
verificar contra el código fuente real.

Si no tienes acceso directo al código fuente del proyecto backend (`celtas-backend`):
1. **Dice explícitamente** que no tienes acceso al código real
2. **Pide al usuario** que pegue el archivo o fragmento relevante
3. **Nunca presentes código reconstruido** con el mismo nivel de confianza que código verificado

El acceso directo al código fuente del proyecto hermano es la única fuente de verdad para
implementaciones que no están documentadas en Swagger o que han evolucionado desde el último
generación de tipos.

### Regenerar tipos cuando el backend cambie

```bash
pnpm run generate:types
```
Esto corre `openapi-typescript` contra el Swagger JSON de producción y sobreescribe
`src/types/api.d.ts`. Ese archivo **nunca se edita a mano**.

## Paleta de colores (tokens de Tailwind)

```
celtas-black:  #0D0D0D   (fondo principal)
celtas-orange: #E8590C   (primario / CTA)
celtas-red:    #C1121F   (acentos, alertas)
celtas-gold:   #FFB800   (badges, destacados)
celtas-cream:  #F5F1E8   (texto sobre fondo oscuro)
```
Configurados en `tailwind.config.ts`, nunca hardcodeados como hex directo en un componente.

## Cliente Axios (`src/lib/api-client.ts`)

- Una sola instancia, `baseURL` desde `import.meta.env.VITE_API_BASE_URL`.
- Interceptor de **request**: agrega `Authorization: Bearer <accessToken>` leyendo del store de
  Zustand (no de localStorage — el access token vive solo en memoria).
- Interceptor de **response**: si la respuesta es 401 y no es ya un retry, intenta
  `POST /auth/refresh` con el `refreshToken` (ese sí en localStorage), y si funciona reintenta
  la request original una sola vez. Si el refresh también falla, limpia el store y redirige a
  `/login`. Nunca reintentar en loop infinito.

## Auth (Zustand) — trade-off de seguridad, documentado a propósito

- `accessToken`: **solo en memoria** (store de Zustand), se pierde al recargar la página a
  propósito — se recupera pidiendo uno nuevo con el `refreshToken` al cargar la app.
- `refreshToken`: en `localStorage`. Esto es un trade-off aceptado para un panel interno de bajo
  número de usuarios (no una app pública) — un XSS podría robar el refresh token. Si en el
  futuro se quiere eliminar este riesgo, la solución real es que el backend setee el refresh
  token como cookie `httpOnly` en vez de devolverlo en el body del login — eso requiere cambiar
  el backend, no es algo que se resuelva solo del lado del frontend. No lo hagas sin coordinarlo.
- El panel **solo tiene login tradicional**, no hay botón de Google aquí.

## Hooks de React Query por recurso

Cada feature expone sus propios hooks, nunca se llama a Axios directo desde un componente:

```ts
// src/features/menu/hooks.ts
export function useMenuItems() {
  return useQuery({ queryKey: ['menu', 'items'], queryFn: () => api.get('/menu/items') });
}
export function useCreateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMenuItemInput) => api.post('/menu/items', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu', 'items'] }),
  });
}
```

### Regla de oro — el `id` NUNCA viaja en el body de un PATCH/PUT

Todo hook de mutación PATCH/PUT debe destructurar cualquier campo identificador fuera del body
antes de enviarlo: el `id` viaja **SOLO** en el path de la URL, **nunca** en el body — salvo que
el DTO del backend lo declare explícitamente (confirmar contra `src/types/api.d.ts` caso por
caso, no asumir).

El backend usa un `ValidationPipe` global con `whitelist: true, forbidNonWhitelisted: true`:
cualquier campo extra en el body (como un `id` que solo debería ir en el path) se rechaza con
400 `property id should not exist`. Este bug de clase ya mordió en Banners, Menú (items y
categorías) — cada hook de update debe seguir este patrón:

```ts
export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string } & UpdateMenuItemInput) => {
      const { id, ...body } = input; // el id viaja SOLO en el path
      return patch<MenuItem>(`/menu/items/${id}`, body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu', 'items'] }),
  });
}
```

Cada hook de edición corregido por este bug DEBE tener un test de regresión que mockee `patch`
de `@/lib/api-client` y verifique que el body enviado no incluye `id` (y que el test FALLA si se
revierte el fix). Ver `src/features/menu/items/hooks.test.tsx` y
`src/features/menu/categories/hooks.test.tsx` como referencia del patrón.

## Formularios (React Hook Form + Zod)

- El schema de Zod debe reflejar las mismas reglas del DTO del backend (límites de longitud,
  requeridos, formatos) — revisar Swagger para los valores exactos, no adivinar.
- Errores de validación del backend (400 con mensajes de `class-validator`) se mapean a los
  campos del formulario cuando sea posible, no se muestran como un toast genérico si el campo
  es identificable.
- Errores de negocio específicos (ej. 409 nombre duplicado en Menu) se muestran como error del
  campo correspondiente, con el mensaje que ya viene del backend en español.

## Paginación

Los endpoints paginados del backend (`GET /users`, `/orders`, `/coupons`, `/banners`) devuelven
un formato consistente — confirmar la forma exacta en `api.d.ts` antes de construir el
componente de tabla/lista, y reutilizar un componente de paginación genérico
(`src/components/ui/Pagination.tsx`) en vez de reimplementarla por módulo.

## Fechas

Todas las fechas se muestran en zona horaria de Lima (`America/Lima`) con `date-fns` +
`date-fns-tz`, igual que el backend. El dashboard en particular: `revenue`/`top-products` se
agrupan por `deliveredAt` en Lima, no por `createdAt` ni en UTC — no reinterpretar esto en el
frontend, solo mostrar lo que ya viene calculado del backend.

## Manejo de "el backend puede estar dormido"

Render pone a dormir el servicio free tier tras inactividad — la primera request tras un rato
sin uso puede tardar 30-50 segundos en responder. Los estados de loading de React Query deben
comunicar esto quando la espera se prolongue (ej. un mensaje "Esto puede tardar un poco la
primera vez" tras ~5 segundos de loading), no solo un spinner indefinido que parezca colgado.

## Testing (Vitest + React Testing Library)

- **Stack**: Vitest + React Testing Library + jsdom + `@testing-library/jest-dom`. Correr con
  `pnpm run test` (una vez) o `pnpm run test:watch` (modo watch). Config en `vitest.config.ts`,
  setup compartido en `src/test/setup.ts` (matchers de jest-dom + cleanup automático).
- **Dónde viven los tests:** colocalos junto al código que prueban —
  `src/features/<feature>/<archivo>.test.ts(x)`. No hay carpeta `__tests__` separada.
- **Sin globals:** los tests importan `describe/it/expect` explícitamente desde `vitest`
  (no `globals: true`), para que el type-check (`tsc -b`) y ESLint los traten igual que el
  resto del código.
- **Regla de oro — lógica de datos que ya mordió una vez:** la lógica de transformación/merge
  de respuestas de la API (no solo el renderizado visual) DEBE tener al menos un test cuando
  maneja un caso donde ya se encontró un bug real. No se trata de cubrir todo al 100%, sino de
  no dejar sin test la misma clase de error que ya crasheó en producción. Ejemplo: el merge de
  `onOrderUpdated` en Pedidos (`src/features/orders/merge.ts` + `merge.test.ts`) — el PATCH
  devuelve el pedido sin `items` y el detalle debe conservarlos.
- **Patrón para lógica testeable:** extraer la transformación a una función pura
  (`merge.ts`, `status.ts`, etc.) y que el componente solo la consuma — así el test cubre la
  lógica real sin mockear el árbol de React Query/Radix.
- **Verificación de que un test de regresión "prueba algo":** si el test cubre un fix, debe
  fallar al revertir temporalmente el fix. El agente `@tester` lo verifica antes de dar LISTO.
