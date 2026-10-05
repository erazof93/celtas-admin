# HISTÓRICO — Desarrollo anterior de celtas-admin

**Sin autoridad operativa.** Síntesis de evidencia única del antiguo ROADMAP,
checklist de auditorías y configuración de Claude Code/OpenCode, trasladada el
2026-10-04. No prueba el estado actual de producción ni resultados actuales.
Las reglas vigentes están en AGENTS.md y los documentos activos; los pendientes
revalidados están en ROADMAP.md. No ejecutar procedimientos antiguos desde aquí.

Se conservaron causas, decisiones, referencias y límites de evidencia útiles
para investigar regresiones. Se retiraron checklists repetidos, prompts,
permisos de herramientas y reportes completos duplicados. Los hashes de commits
citados proceden de las notas anteriores; sirven para buscar en Git, no prueban
por sí solos despliegue ni validación del árbol actual. No se preservan cuentas,
credenciales ni identificadores privados de pruebas.

## Contratos y fiabilidad de los reportes

- Un incidente inicial reconstruyó campos/implementación supuestamente reales
  (`isAvailable`, `paymentMethod`) a partir de inferencias. La corrección exigió
  leer código/tipos reales. Swagger incompleto no autoriza inventar backend.
- La documentación llamaba al hermano `celtas-backend` y declaraba React 18;
  el árbol actual usa `backend-celtas` y React 19. También describía banners
  como paginado, aunque el endpoint devuelve un array.
- Se reportó “Limpiar fecha” como terminado antes de que existiera toda la
  interacción esperada. Resúmenes y checkboxes no equivalen a evidencia cruda.
- Hubo cierres prematuros de módulos antes del veredicto de auditoría. Los
  conteos acumulativos (53 tests inicialmente, luego 59 archivos/546 tests y
  60/558) son resultados históricos, no una ejecución de esta migración.
- El anterior proceso obligaba a leer roadmap, cargar una skill y convocar
  `tester` en cada cierre, con typecheck/build incondicionales. Se reemplazó por
  contexto mínimo y verificación proporcional; ese proceso ya no está activo.

## Arquitectura, UI y pruebas

- Auditoría global: rojo de marca sobre fondo oscuro daba contraste 3.12:1,
  insuficiente para texto normal; se introdujo `celtas-red-light` (#F87171,
  reportado 7.03:1) para errores/badges, dejando rojo de marca para iconos.
  Se registraron naranja 5.43:1, dorado 11.21:1, cream 17.24:1 y muted 7.58:1.
  Estas cifras dependen de
  colores/fondo medidos entonces, no son una nueva certificación WCAG.
- Code splitting por ruta redujo el principal de ~1.17 MB a ~296 kB (gzip
  ~94 kB) en aquella medición; Recharts/dnd-kit quedaron en chunks separados.
  No tomar esos tamaños como presupuesto comprobado del build actual.
- `watch()` en BannerForm producía aviso incompatible-library; pasó a
  `useWatch()`. Un warning `act()` de GenerateCouponForm se cerró esperando
  el alert de éxito, que flusheaba actualización asíncrona de estado.
- Formularios number/url podían ser detenidos por validación HTML antes de
  mostrar errores Zod; `noValidate`, coerción/valueAsNumber y tratamiento de
  NaN con Zod 4 fueron parte de la corrección. Preservar la regresión observable.
- BannersPage fallaba bajo carga de CPU al hacer resetModules/doMock/import
  dinámico: el grafo frío tardaba 5.3–8.6 s. El 2026-08-19 se cambió a mock
  hoisted e import estático. No era necesariamente una carrera de la aplicación.
  Otras esperas con userEvent/timers tuvieron sensibilidad a carga de CPU.
- ItemForm, auditoría 2026-09-16: primer veredicto NO LISTO por max-height y
  ScrollArea porcentual sin altura definida. Corrección flex, max-h-[80vh],
  overflow-hidden y min-h-0/flex-1 en hijo. jsdom no prueba scroll/layout;
  alcanzar footer en viewport pequeño requería navegador real.
- Clipboard usaba fallback de textarea invisible: podía dejar DOM temporal
  si execCommand lanzaba. Se corrigió limpieza con finally y mensajes de fallo.

## Menú, opciones y combos

- Bug de clase: PATCH de categorías/productos/banners enviaba `id` en body,
  rechazado por forbidNonWhitelisted (`property id should not exist`). Hooks
  separaron identificador; pruebas verificaron path y payload sin campos extra.
  Reordenamiento y DTOs que incluyen IDs son excepciones reales, no el mismo bug.
- Salsas, referencia backend `085091e` (2026-08-26): catálogo separado y
  relación por `sauceIds`. Inactivas conservadas y marcadas “oculta” al editar;
  limpiarlas automáticamente habría perdido configuraciones del producto.
- Bebidas y porciones extras (2026-09-15): precios con dos decimales,
  relaciones ManyToMany y snapshots de nombre/precio. Subtotal de pedido
  incorpora extras por unidad; la descripción antigua `unitPrice * quantity`
  dejó de reflejar todos los pedidos posibles.
- Grupos required/max, referencia `2606fa2` (2026-09-17): el required no aplica
  a un producto sin opciones asignadas. Defaults de retrofit/backend no son
  especificación para futuros cambios.
- Bebida gratis en combos (2026-09-16): `includeFreeTo` modifica precio solo
  dentro de bebidas asignadas al producto. La relación de gratuidad no ofrece
  por sí sola una bebida. Selecciones omitidas/arrays vacíos importan al snapshot.
- Permitir “Sin X”, referencia `ae05ede` (2026-09-17): flags separados para
  salsas/bebidas/extras; `extraPortions*` es plural. El backend cambió antes del
  snapshot generado y se confundió deriva con falta de despliegue.
- “Sin límite” salsas, referencia `03699d7` (2026-09-29): max nullable,
  null no equivale a 0 ni a omitir campo. Posteriormente apareció en generados.
- Tipos de papas, referencia `485ed81` (2026-09-30): catálogo, default único,
  grupo opcional para compatibilidad móvil y selección sin flag allowWithout.
  El detalle de pedidos no se amplió para las nuevas selecciones: sigue deuda.

## Pedidos y cancelación

- PATCH de estado no cargaba relaciones. El primer merge conservó `items`;
  otra vuelta tuvo que conservar también `user` para evitar crash del detalle.
  Pruebas de función pura cubrieron respuestas parciales y conservación.
- `selectedSauces` tri-state: null no aplica/legado, [] decisión “Sin salsas”,
  array no vacío nombres históricos. Truthy checks borraban esa diferencia.
- Comentario por ítem (máximo 140) se mostró como snapshot; corresponde a todas
  las unidades de la línea, no una nota por unidad ni una nota global del pedido.
- Descuento inferido por diferencia entre subtotales, total y delivery;
  redondeo doble puede producir un céntimo en casos límite. No se documentó
  un campo de descuento nuevo del servidor para reemplazarlo.
- Cancelación en camino pidió motivo; botones duplicados de “Cancelar” en
  diálogos anidados confundían a testing/lectores. Se ocultó el trigger
  subyacente con aria-hidden/tabIndex mientras se confirmaba, y se bloqueó pending.
- Pedidos anónimos obligaron a hacer null-safe `userId`/`user` y resolver
  contacto registrado/anónimo. No asumir usuario con email en todo pedido.

## Delivery, mapas y pedido manual

- Hubo una cotización **simulada**, referencia `be84b73` (2026-09-29), con
  Haversine local copiado. Se sustituyó por geocode/estimate reales en
  `640cd6b` (2026-09-30). Limitaciones del mock no son pendientes actuales.
- Se corrigieron longitude wrap del mapa y búsquedas repetidas; la calidad de
  carga de tiles dentro de diálogo quedó como caso de navegador, no unitario.
- Mapas estáticos de direcciones (Geoapify) eran de solo lectura; no daban
  permiso para modificar coordenadas de la dirección desde el perfil.
- Pedido manual, referencia `dc35681`: DTO IDs/cantidad/comment, cliente
  registrado XOR nombre/teléfono anónimo, dirección JSON string; sin deliveryFee
  ni notas globales. El backend resuelve precios y cobro; frontend solo preview.
- Primera validación falló para grupos requeridos con todas las opciones
  inactivas: filtrar por activas ocultaba existencia del grupo para backend.
  Corrección separó total asignadas de disponibles. Con allowWithout se envía
  [] explícito y se deja confirmar, incluso sin activas; sin él se bloquea.
- Direcciones guardadas: snapshot conserva ajustes del pin; enviar solo
  addressId los perdería. Preselección principal y pickNonce permitieron volver
  a elegir la misma dirección. No deducir reset del mapa desde notas anteriores;
  código posterior conservó ubicación al cambiar cliente/modo según su flujo.
- Autocomplete Geoapify directo: cuatro caracteres, debounce 400 ms,
  cancelación de request, no mostrar resultados viejos. Bug blur/clic/refocus
  se corrigió cancelando el timeout al recuperar foco.
- Solo pin requiere referencia; fullAddress fallback “Ubicación marcada en el
  mapa”. Límite 80 para nuevas referencias, sin truncar una guardada más larga.
- WhatsApp, referencia `6a47dce` (2026-09-30): links desde snapshot y teléfono
  actual del negocio, confirmación `whatsapp-sent` idempotente conserva primera
  fecha. No envía WhatsApp. Las notas de despliegue/migración de esos endpoints
  no prueban su ausencia en el backend actual.

## Usuarios y vinculación

- Vista 360: direcciones principal primero, pedidos reutilizando query de
  orders; cambio de usuario debe resetear tabs/página y evitar respuestas
  asociadas al usuario anterior. Se usó key por user.id para estado local.
- Roles: confirmación y protección UI contra autodegradación; backend conserva
  responsabilidad de autorización. Cambiar rol no vuelve mágicamente actual
  el rol del JWT ya emitido.
- Vinculación, referencia `302531c`: preview por teléfono del cliente y un
  único POST con hasta 100 orderIds únicos UUID; todo o nada, 409 si conflicto.
  Un plan proponía customerPhone como filtro de `/orders` y PATCH por pedido;
  se descartó porque no existían esos contratos.
- Perfil mostraba `totalSpent` viejo tras vincular. Se corrigió con valor
  absoluto de respuesta, invalidación users/orders y actualización del detalle,
  evitando acumular delta duplicado. Una prueba con autocierre 2 s real resultó
  sensible a ejecución lenta, sin demostrar fallo del cálculo de backend.

## Banners, fechas y estrellas

- Borrar fechas requería enviar null, no undefined: TypeORM merge conserva la
  columna si falta. El botón X también debía cerrar popover. Una auditoría
  detectó concatenación/espaciado de rango; inicio con elipsis era dato realmente
  null y no necesariamente bug de presentación.
- Banners title pasó a nullable y actionValue de categoría/producto se verificó
  como UUID pese a descripciones viejas de slug. Reorder optimista tuvo rollback.
- Promociones usan días de Lima, no Date UTC shifting; mismo día de inicio/fin
  es válido. Dos decimales del multiplicador siguen exigidos en backend y no
  completamente reflejados en schema del formulario.
- Programa de estrellas evolucionó de umbral fijo a hitos configurables.
  `soles_por_estrella` permanece; `estrellas_por_premio` quedó viejo.
  Redeemable/specialReward independientes; snapshots de recompensas evitan que
  borrar un hito destruya premios ya otorgados. No reintroducir exclusividad.

## Configuración, cupones y marketing

- Horarios (2026-08-19): ida/vuelta local auditada; después se cerraron casos
  que el checklist anterior seguía marcando pendientes. Cruce de medianoche
  válido; motivo por defecto evita IsNotEmpty. Orden schedule→reason→closed
  existe porque push lee motivo ya persistido. No es transacción atómica.
- Default defensivo horario 11–23 uniforme no coincidía con semilla (viernes/
  sábado hasta 01, domingo 22). Es fallback, no horario comercial autoritativo.
- Auditoría de settings añadió una key de prueba `secret_internal` y observó
  que el endpoint admin genérico devuelve todas las settings. Es evidencia de
  alcance, no de un secreto real expuesto hoy; el marcador y valor se omiten.
- Viejos pendientes de deploy decían ubicación del local vacía y VAPID sin
  configurar en producción. Una semilla o `.env.example` no prueban el estado
  remoto actual: requieren confirmar con responsable, no afirmarse como hechos.
- Cupones: fixed_amount admite >100; límite 100 aplica a percentage. Compra
  mínima 0/vacía→null. Campaña masiva valida DTO propio y confirmación; no se
  sustituyó por bucle de generación individual.
- Broadcast local real (2026-08-19) retornó `sent: 0, total: 16` en Firebase de
  prueba. Esto no acreditó entrega real a dispositivos. No conservar cuentas
  de auditoría ni atribuir esos contadores a producción.
- Link marketing, referencia `9c97272` (2026-09-17): max500, backend plain string,
  UI URL. `.trim().url().optional().or(z.literal(''))` rechaza whitespace-only
  por la rama literal; no asumirlo equivalente a vacío normalizado. Notas de
  límites título/body no eran prueba de límites backend: revisar DTO real.
- Historial de broadcast no mostraba link; ningún scheduler se implementó.
  Campañas/cierre de negocio pueden emitir push y los E2E anteriores tenían
  efectos reales: su existencia no autoriza repetirlos contra producción.

## Reportes y cupones automáticos recientes

- Reportes, referencia `a669513` (2026-10-01): en aquel momento producción
  devolvió 404; luego snapshot `cc303c9` incorporó contratos. No mantener 404
  histórico como pendiente sin comprobar. Rangos limitados a 366 días y
  channel solo top-products; enviar channel al resto daba errores de DTO.
- Un error de comparación quedaba silencioso y fue corregido con estado
  visible/reintento. Revenue se apoya en entregados y fechas Lima; conversionRate
  string es contrato real, no un dato que deba corregirse con casts inventados.
- Cupones automáticos se auditó en `feature/auto-coupon-config`: GET/PUT de
  cuatro campos, DTO local por ausencia en generado. Inicialmente hubo 404
  remoto y ausencia en Swagger; **el desarrollador confirma ahora presencia en
  Swagger de producción**. Mantener solo deriva del archivo generado como pendiente.
- Mapper de errores inicialmente esperaba array, pero backend concatenaba
  mensajes en string; se corrigió parser y pruebas. Incluyó regresión de
  fixed_amount >100, porcentajes, decimales, umbral y vigencia. Reportes 60/558
  son históricos y no se ejecutaron nuevamente durante esta migración.

## Límites de esta conservación

La copia externa de configuración anterior está en poder del desarrollador.
Git conserva versiones previas de documentación versionada para investigar
detalles no reproducidos aquí. No se guardaron resultados repetidos ni inventarios
completos de cada sesión. Consultar código/tests y fechas/commits antes de
concluir que un problema histórico está abierto o que un despliegue ocurrió.
