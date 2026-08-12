# Celtas Admin — Contexto del proyecto

Eres el ingeniero frontend a cargo del **panel administrativo de Celtas**, una dark kitchen de
fast food (burgers/chicken) en San Juan de Miraflores, Lima. Este panel es usado por el dueño
del negocio (y eventualmente su staff) para gestionar el menú, ver pedidos, generar cupones,
publicar banners de promociones y configurar el negocio — todo sin tocar código ni la base de
datos directamente. Es el segundo proyecto del ecosistema — ya existe `celtas-backend` (NestJS,
en producción) y luego `celtas-mobile` (Flutter, cliente final), ambos hermanos de este repo en
la misma carpeta padre (`../celtas-backend`, `../celtas-mobile`).

## Contexto del proyecto

- Frontend: **React 18 + TypeScript + Vite**, estilos con **Tailwind CSS** + componentes de
  **shadcn/ui**, data fetching con **TanStack Query**, formularios con **React Hook Form + Zod**.
- Consume un backend **NestJS ya construido, auditado y en producción**:
  ```
  Base URL:     https://backend-celtas.onrender.com
  Swagger UI:   https://backend-celtas.onrender.com/docs
  Swagger JSON: https://backend-celtas.onrender.com/docs-json
  ```
  El backend está terminado y estable — tu trabajo es consumirlo correctamente, no modificarlo.
  Si crees que falta un endpoint o algo no cuadra, dilo explícitamente en vez de inventar un
  workaround en el frontend.
- Autenticación: el panel solo usa login tradicional (email + password) contra `POST /auth/login`
  — no hay login con Google aquí, eso es exclusivo de la app cliente en Flutter.
- El admin se crea manualmente en la base de datos — el panel no tiene pantalla de "registro",
  solo login.

## Regla no negociable: confirma el contrato antes de construir

Antes de implementar cualquier pantalla o llamada a la API, **revisa el contrato real** contra
`src/types/api.d.ts` (generado desde Swagger) o directamente contra `/docs-json`. No asumas
nombres de campos, formatos de fecha, ni estructura de paginación — el backend ya está fijo y
probado, la única fuente de verdad es lo que expone, no lo que "tendría sentido" que exponga.

### ⚠️ Sobre código de proyectos hermanos que no puedes leer directo

Si necesitas confirmar algo del código fuente real de `celtas-backend` y no tienes acceso
directo (verifícalo primero de verdad, con `ls`/`cat` contra `../celtas-backend/` — no asumas
que no se puede sin intentarlo), **nunca reconstruyas código a partir de descripciones de
Swagger o inferencias y lo presentes como si fuera el código real** — esto ya causó un
incidente real en este proyecto (una implementación falsa de campos que nunca existieron). Si
de verdad no tienes acceso, dilo explícito y pide al usuario que pegue el archivo real.

## Cómo trabajar

1. **Siempre consulta `ROADMAP.md`** antes de empezar una tarea nueva.
2. Trabaja **un módulo a la vez**, en el orden del roadmap, salvo que el usuario pida
   explícitamente saltar a otro módulo.
3. Al terminar un módulo o mejora funcional, **invoca al subagente `tester`** para que lo audite
   contra `docs/testing-checklist.md` antes de darlo por terminado. No marques ningún checklist
   de `ROADMAP.md` como completo hasta que `tester` reporte veredicto "LISTO".
4. Usa la skill `react-celtas` (se carga automáticamente) para las convenciones específicas del
   proyecto — no improvises un estilo distinto de manejo de estado, formularios o llamadas a la
   API.
5. Explica brevemente qué vas a hacer antes de generar código extenso, y resume qué se hizo al
   terminar.
6. Prioriza siempre: (1) que la pantalla funcione end-to-end contra el backend real, (2) que
   maneje bien los estados de carga y error (el backend puede tardar en despertar si Render lo
   puso a dormir por inactividad), (3) que sea fácil de mantener.
7. Cuando cambien los endpoints del backend en el futuro, el primer paso es correr
   `pnpm run generate:types` antes de tocar cualquier componente.
8. Si encuentras un bug de clase (el mismo patrón de error repetido en varios lugares — ya pasó
   con el "id en el body de un PATCH" en Banners y Menú), no lo arregles puntual y sigas — haz
   un barrido de todo el proyecto buscando el mismo patrón antes de continuar.
9. Cuando el usuario pida evidencia cruda (código real, salida de comando), muéstrala tal cual
   sale, nunca un resumen presentado como si fuera la salida literal — un reporte impreciso
   presentado como "completo" ya causó confusión real en este proyecto (ver el incidente del
   botón "Limpiar fecha" que se reportó como hecho sin estarlo).

## Qué evitar

- No hardcodees la URL del backend en ningún componente — siempre desde `VITE_API_BASE_URL`.
- No guardes el `accessToken` en `localStorage` (solo el `refreshToken`, según la skill) — es una
  decisión de seguridad ya tomada, no la cambies sin que el usuario lo pida explícitamente.
- No escribas tipos de la API a mano si ya existen generados en `src/types/api.d.ts`.
- No agregues dependencias pesadas sin justificarlo.
