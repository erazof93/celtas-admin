# Cierre de fase 7A.5

## Alcance y revisión

Se leyó `AGENTS.md` y se revisó el diff aplicado por el usuario de:

- `src/features/orders/orders.polling.test.tsx`.
- `src/features/orders/orders.polling.integration.test.tsx`.

No se encontraron aserciones debilitadas ni tests eliminados, omitidos o sustituidos por versiones superficiales. Se conservan el montaje real de `OrdersPage`, la bandeja y las consultas TanStack. En integración solo se simula el transporte, conservando timeout y AbortSignal.

El parche corrige fixtures y expectativas anteriores a la bandeja:

- Diferencia las consultas independientes de tabla (limit=10) y bandeja (limit=100), con conteos exactos para cada vista y para el total. Conserva el refresh y la reconciliación de perfil compartidos.
- Proporciona una respuesta completa y consistente para la bandeja, sin consumir la secuencia de respuestas de tabla.
- Acota a la tabla los selectores de referencias que pueden aparecer legítimamente también en la bandeja.
- Comprueba paginación y filtros sobre solicitudes de tabla, sin depender del orden de llamadas entre vistas.
- Conserva los intervalos de 30/120 segundos, ausencia de retries y solicitudes tras desmontaje, bloqueos 401/403, recuperación, cancelación por cambio de identidad y conservación/ocultación de caché. El timeout de 90 segundos se comprueba ahora en ambas consultas.

Estas correcciones no modifican la lógica funcional. La suite ejecutada verifica el comportamiento actual; no demuestra ausencia universal de regresiones ni reemplaza pruebas E2E.

## EPERM y cambios realizados

La escritura habitual funciona actualmente: `pnpm exec prettier --write` pudo formatear ambos archivos. No se cambiaron ACL, propietarios, atributos ni configuración Git. La causa histórica de EPERM no quedó confirmada, pero ya no bloquea este trabajo.

En esta ejecución se modificó únicamente el formato de los dos tests y se añadió este informe. El parche funcional de fixtures ya había sido aplicado por el usuario. Se conservaron los demás cambios locales de fases anteriores.

## Resultados actuales

| Verificación                         | Resultado            | Evidencia                                                         |
| ------------------------------------ | -------------------- | ----------------------------------------------------------------- |
| Polling unitario                     | PASS                 | 33 tests, cero fallos                                             |
| Polling integrado                    | PASS                 | 18 tests, cero fallos                                             |
| Polling conjunto después del formato | PASS                 | 51 tests, cero fallos                                             |
| Suite completa                       | PASS                 | 973 tests en 86 archivos, cero fallos; salida 0                   |
| TypeScript                           | PASS                 | `pnpm type-check`, salida 0                                       |
| Lint                                 | PASS con advertencia | `pnpm lint`, salida 0; cero errores, una advertencia preexistente |
| Formato de ambos tests               | PASS                 | Prettier aplicado y posterior `--check` satisfactorio             |
| Espacios del diff                    | PASS                 | `git diff --check`, salida 0                                      |

Advertencia de lint: `src/features/star-promotions/StarPromotionForm.tsx:101`, `react-hooks/incompatible-library`, relativa a `watch()` de React Hook Form. No se modificó ese componente por estar fuera del alcance.

Comandos ejecutados:

```powershell
pnpm exec vitest run src/features/orders/orders.polling.test.tsx src/features/orders/orders.polling.integration.test.tsx --configLoader runner --no-file-parallelism --reporter=json --outputFile=../phase7a5-final-polling.json
pnpm exec vitest run --configLoader runner --no-file-parallelism --reporter=json --outputFile=../phase7a5-final-full.json
pnpm type-check
pnpm lint
pnpm exec prettier --write src/features/orders/orders.polling.test.tsx src/features/orders/orders.polling.integration.test.tsx
pnpm exec prettier --check src/features/orders/orders.polling.test.tsx src/features/orders/orders.polling.integration.test.tsx
git diff --check
```

El primer check de Prettier detectó diferencias de estilo; se corrigieron con Prettier y se repitieron los 51 tests satisfactoriamente. No se encontraron fallos funcionales que requirieran cambiar código.

Los reportes JSON están en la raíz del workspace, fuera del repositorio. No se modificaron backend, app, base de datos, secretos, configuración de producción ni servicios externos. No se realizaron commit, push, deploy ni nuevas pruebas E2E.

## Pendientes y límites

La fase queda cerrada: los 19 fallos anteriores se resolvieron y la suite completa actual pasa. Los mensajes de jsdom sobre navegación no implementada no provocaron tests fallidos. Reporte completo: `../../phase7a5-final-full.json`; polling: `../../phase7a5-final-polling.json`.

La advertencia preexistente de lint permanece. El formato se verificó en los archivos de tests afectados, sin reformatear globalmente el repositorio. Las notas históricas de fases previas se conservan; este informe registra la ejecución posterior a la aplicación del parche.
