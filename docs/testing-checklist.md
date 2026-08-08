# ✅ Celtas Admin — Checklist de QA

Referencia usada por el agente `@tester`. Cada módulo del `ROADMAP.md` se considera "completo"
solo cuando pasa lo aplicable de este checklist.

---

## General (aplica a todo módulo)

- [ ] `pnpm run type-check` sin errores
- [ ] `pnpm run lint` limpio
- [ ] `pnpm run build` sin errores
- [ ] Las llamadas a la API usan los tipos de `src/types/api.d.ts`, sin `any` que oculte un mismatch
- [ ] Toda pantalla que llama a la API maneja: loading, error, y estado vacío explícitos
- [ ] Ningún texto de UI en inglés (salvo nombres propios/técnicos donde no aplica traducir)

---

## Auth

- [ ] `ProtectedRoute` redirige a `/login` sin sesión
- [ ] El `accessToken` nunca se persiste en `localStorage` (solo en el store de Zustand, en memoria)
- [ ] El `refreshToken` sí persiste en `localStorage`, y se usa para recuperar sesión al recargar
- [ ] Un 401 dispara el interceptor de refresh una sola vez, no un loop
- [ ] Si el refresh falla, se limpia la sesión y redirige a `/login` sin dejar estado corrupto
- [ ] Un usuario con `role: cliente` (si accede por error) es rechazado con mensaje claro

## Layout

- [ ] Sidebar funciona en desktop y colapsa/responde en pantallas chicas
- [ ] Logout limpia sesión y redirige correctamente

## Dashboard

- [ ] Selector de fechas refleja lo que realmente devuelve el backend (no reinterpreta timezone)
- [ ] Maneja el caso de "sin datos" (ej. día sin ventas) sin romper la gráfica

## Menu

- [ ] 409 de nombre duplicado se muestra en el campo del formulario, no como error genérico
- [ ] Subida de imagen maneja error de tipo/tamaño de archivo con mensaje claro
- [ ] Toggle de disponibilidad refleja el estado real tras la mutación (no solo optimista sin confirmar)

## Orders

- [ ] Solo se muestran botones de transición de estado válidos según el estado actual
- [ ] El link de WhatsApp del pedido es clickeable y correcto

## Coupons

- [ ] El formulario de generación manual rechaza `percentage > 100` en el cliente, antes del submit

## Banners

- [ ] Selector de fechas valida `startDate < endDate` en el cliente
- [ ] Reordenamiento drag-and-drop persiste correctamente contra `PATCH /banners/reorder`

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
