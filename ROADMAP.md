# Estado actual y prioridades

Revalidado contra código/configuración y `../backend-celtas` el 2026-10-04.
“Implementado” describe presencia y comportamiento en código, no certifica
producción ni una ejecución nueva de tests. Auditorías anteriores:
[historial](docs/history/legacy-development.md).

## Implementado

- Sesión email/password, bootstrap/refresh, protección admin y layout responsive.
- Dashboard con métricas/tendencia y reportes app vs teléfono: resumen,
  comparación, top productos y conversión.
- Menú: categorías/productos, imágenes, disponibilidad, catálogos de salsas,
  bebidas/extras/papas, grupos required/max, “Sin X” y bebidas gratis en combos.
- Pedidos: lista/filtros, detalle, estados/cancelación, cotización real de delivery,
  pedido manual registrado/anónimo, direcciones/autocomplete/mapa y WhatsApp.
- Usuarios: listado/top, direcciones, pedidos, roles y vinculación de anónimos.
- Cupones: listado, generación individual/masiva y configuración automática.
- Banners: CRUD, imágenes, vigencia/días/acciones y reordenamiento.
- Estrellas: flags independientes de canje/premio especial, promociones e hitos.
- Configuración: WhatsApp, horarios/cierre manual, estrellas, delivery y roles.
- Marketing: broadcast manual con confirmación/link e historial.
- Pruebas Vitest colocadas, ESLint, TypeScript y configuración SPA para Vercel.
- Configuración de trabajo Codex con documentación modular; migración limitada
  a documentación y retiro de configuración anterior, sin cambios funcionales.

## Trabajo en progreso

No se identificó implementación parcial declarada en el árbol analizado que
justifique una sección de ejecución activa. Los problemas siguientes son deuda
abierta; no implican una nueva feature en curso ni un despliegue pendiente probado.

## Deuda comprobada y riesgos

| Pendiente                             | Evidencia y alcance                                                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detalle incompleto de pedidos         | `orders/types.ts` y `OrderDetailDialog.tsx` omiten snapshots de bebidas/extras/papas presentes en backend; comentario de subtotal quedó desactualizado                      |
| Retry de solicitudes encoladas        | `lib/api-client.ts` encola antes de marcar `_retry`; un nuevo 401 de esas solicitudes puede iniciar otro refresh                                                            |
| Invalidaciones parciales              | Estado/creación de pedido invalidan lista, sin cubrir todos los detalles, usuarios, métricas/reportes; settings no invalida cotizaciones ya cacheadas                       |
| Configuración sin atomicidad          | Horarios y delivery hacen PATCH secuenciales por key; un fallo puede persistir parte del formulario                                                                         |
| Cobertura de auth                     | No hay tests colocados de bootstrap, store, interceptor/cola, login o ProtectedRoute; bootstrap transitorio carece de recuperación explícita                                |
| Validación ambiental                  | No existe esquema central de `VITE_*`; API sin URL/timeout configurados puede fallar tarde; Firebase/Geoapify degradan parcialmente                                         |
| FCM al logout                         | Logout no elimina registro backend ni token Firebase; DELETE backend disponible no consumido                                                                                |
| Deriva de tipos                       | `/coupons/auto-config` existe en Swagger de producción según confirmación del desarrollador y falta en generado; respuestas incompletas y DTOs manuales requieren contraste |
| Multiplicador estrellas               | Backend exige hasta dos decimales; el schema del formulario no refleja ese límite de forma explícita                                                                        |
| Resiliencia/accesibilidad verificable | Sin error boundary propio; scroll/mapas/foco y push real requieren validación de navegador, no garantía por unitarios                                                       |
| Calidad automatizada                  | Sin CI, cobertura configurada ni suite E2E con framework/assertions robustas; scripts CDP existentes no sustituyen regresión automatizada                                   |

## Decisiones del desarrollador

- Elegir entorno de integración/E2E y autorizar efectos concretos; no usar
  producción para campañas, pedidos, roles o push por defecto.
- Confirmar configuración real de despliegue: URL/CORS, ubicación del local,
  tramos de delivery y Firebase/VAPID. Las notas antiguas de faltantes no prueban
  el estado remoto actual. `vercel.json` no demuestra un deploy realizado.
- Programar regeneración de tipos como tarea independiente, fijando backend/
  Swagger objetivo y revisando compatibilidad; mantener contratos manuales que
  sigan cubriendo gaps reales.
- Definir alcance del detalle de pedidos y estrategia de invalidación tras
  mutaciones; después priorizar auth/FCM y guardado parcial de settings.
- Decidir si marketing debe aceptar deep links además de URLs y mostrar link
  en historial; no tratar diferencias actuales como cambio autorizado.
- Decidir requisitos/versión de pnpm y eventual CI/cobertura; actualmente no
  están fijados. Cookie httpOnly, revocación de sesión o transacción de settings
  exigirían coordinación backend, fuera de una migración documental.

## Próximas prioridades propuestas

1. Contrastar y regenerar tipos en tarea separada; revisar contratos de opciones
   y completar representación de snapshots de pedidos.
2. Cubrir auth y corregir retry/recuperación con escenarios concurrentes y fallos
   transitorios; revisar ciclo FCM y actualización de roles.
3. Acordar invalidaciones entre features y solución al guardado parcial de
   configuración, conservando orden del motivo antes del cierre manual.
4. Validar entorno y regresión de navegador en servicios de pruebas; decidir
   automatización CI/E2E proporcional a los flujos sensibles.

No se corrigió ninguna de estas deudas durante la migración. No hay autorización
implícita de backend, despliegue o efectos de producción por estar listadas aquí.
