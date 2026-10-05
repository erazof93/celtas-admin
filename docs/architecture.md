# Arquitectura actual

Referencia del código inspeccionado el 2026-10-04. Describe implementación;
no constituye una propuesta de refactor. Contratos y reglas delicadas se consultan
en [integración](backend-integration.md) y [reglas de negocio](business-rules.md).

## Stack y arranque

SPA React 19 + TypeScript 6 estricto + Vite 8, módulos ES y alias `@/` hacia
`src/`. El lockfile de pnpm fija las versiones resueltas. No hay SSR ni framework
full-stack. `main.tsx` monta StrictMode y QueryClientProvider; `App.tsx` espera
el bootstrap de sesión antes de mostrar RouterProvider y provee los toasts.

`src/routes/router.tsx` usa `createBrowserRouter`, páginas `React.lazy` y
Suspense con LoadingState. `/` redirige a `/dashboard`. `ProtectedRoute` requiere
sesión y rol exacto `admin`; no existe una matriz de permisos por feature.
El backend vuelve a autorizar las operaciones. `/login` queda fuera de
`AdminLayout`, que contiene sidebar, drawer responsive y topbar.

| Ruta                    | Feature y alcance                                                   |
| ----------------------- | ------------------------------------------------------------------- |
| `/dashboard`            | Resumen, productos, métricas por canal y tendencia                  |
| `/reports`              | Resumen, comparación, productos y conversión app/teléfono           |
| `/menu`                 | Categorías, productos, salsas, bebidas, extras y tipos de papas     |
| `/orders`               | Lista, filtros, detalle, estados y WhatsApp                         |
| `/orders/create-manual` | Pedido telefónico, cliente, dirección, mapa y opciones              |
| `/coupons`              | Lista, generación individual y campañas masivas                     |
| `/banners`              | Edición, imágenes y reordenamiento                                  |
| `/star-promotions`      | Promociones de estrellas e hitos configurables                      |
| `/marketing`            | Broadcast manual e historial                                        |
| `/settings`             | Negocio, horarios, delivery, estrellas, roles y cupones automáticos |
| `/users`                | Usuarios, direcciones, pedidos, roles y vinculación de anónimos     |

`reward-milestones` aporta la sección de hitos dentro de estrellas; no tiene
ruta propia. No hay registro de usuarios ni login Google en el panel.

## Organización y estado

`src/features/<feature>/` agrupa páginas, componentes específicos, hooks,
tipos, validadores/utilidades y tests. Menú tiene subcarpetas por catálogo;
pedidos separa `pages/` y `components/`; reportes separa hooks, componentes y
tipos. Esta variación local no exige homogeneizar carpetas.

- TanStack Query mantiene datos remotos y mutaciones; el cliente compartido
  configura `staleTime: 30_000`, un retry y sin refetch por foco. Hay excepciones
  locales, por ejemplo bootstrap y cotización sin retry.
- Zustand se limita a sesión: access token y usuario en memoria. No es una
  segunda caché de entidades de negocio.
- React local mantiene selección, diálogos, filtros y formularios. Las keys de
  query incluyen parámetros; las mutaciones invalidan recursos específicos.
  Las invalidaciones entre features aún tienen deuda: véase ROADMAP.
- El backend se consume mediante hooks y `src/lib/api-client.ts`. El acceso
  externo de Geoapify se encapsula en `src/lib/geoapify.ts`.

No existe polling, conexión WebSocket/SSE de pedidos ni integración `onMessage`
en foreground. Firebase registra push y el service worker maneja background;
no equivale a sincronización en vivo de la caché de pedidos.

## Formularios y UI

React Hook Form + `zodResolver` con Zod 4; tipos de entrada/salida cuando la
transformación lo requiere. Los schemas reflejan los DTOs, con normalización de
vacíos y errores de campo. Reutilizar `api-errors.ts` y revisar el shape real
de los errores: el backend puede concatenar mensajes de validación en un string.
`noValidate` permite que Zod muestre los errores propios, donde ya se utiliza;
la validación HTML nativa puede bloquear el submit antes del resolver.

Tailwind 4 se integra con Vite. `src/index.css` combina `@config` con tokens
`@theme`; `tailwind.config.ts` conserva colores Celtas. Componentes locales
Radix/shadcn, Geist, Lucide y `cn()`/tailwind-merge. UI en español, moneda PEN.
Reutilizar `components/ui/` (Pagination, DatePicker, ImageUpload, toasts,
LoadingState y ErrorState) antes de añadir variantes.

LoadingState añade una indicación tras una espera prolongada (~5 s); ErrorState
permite reintento. Las páginas manejan carga/error/vacío de forma local. No hay
un error boundary propio ni `errorElement` configurado en el router.

Recharts para gráficos; dnd-kit para banners; Leaflet/react-leaflet para mapas
y Geoapify para sugerencias/imágenes. El mapa de cotización se carga de forma
lazy. El scroll de formularios largos depende de contenedores flex con altura
limitada y `min-h-0`, no de jsdom: verificarlo en navegador.

## Configuración y entrega

Vite expone `VITE_*` al cliente; `.env.example` es la referencia de nombres,
no un esquema de validación ejecutable. No hay proxy local configurado ni
timeout global en Axios. No copiar valores privados de `.env` a documentación.
Vercel contiene el rewrite SPA hacia `index.html`; no se encontró pipeline CI
versionado. Scripts y efectos: [testing-checklist.md](testing-checklist.md).

Fuentes principales: `main.tsx`, `App.tsx`, `routes/`, `layouts/`,
`lib/query-client.ts`, `features/`, `index.css`, `vite.config.ts`,
`tailwind.config.ts`, `components.json`, `package.json` y `pnpm-lock.yaml`.
