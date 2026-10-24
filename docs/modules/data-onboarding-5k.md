# Data Onboarding — capacidad 5K (ONBOARDING-5K)

Estado: implementado en `feat/gym-training-stage5d` (2026-10-23), publicado para revisión — **sin merge a `main`, sin deploy**. Sin cambios en `schema.prisma` ni migraciones.

## Causa del truncamiento corregido

`excel-preview-parser.ts` tenía `MAX_ROWS_TO_PROCESS = 1000` y `MAX_ROWS_IN_RESULT = 200`. Para los datasets Commerce el resultado se recortaba a 200 filas y el pipeline de importación re-parseaba y escribía desde ese resultado: un archivo de 500 categorías importaba 200 y lo informaba como éxito. GYM ya bloqueaba más de 1,000 filas.

## Contrato actual

| Pieza | Comportamiento |
|---|---|
| Límites (`data-onboarding-limits.ts`) | 5,000 registros no vacíos, 4 MB por archivo, muestra de 200 filas para la vista, lotes de 500 |
| Parser | Devuelve **todas** las filas; más de 5,000 → `DataOnboardingRowLimitError` (rechazo entero). Recorta el rango declarado de la hoja a las celdas con valor |
| Vista (`data-onboarding-view.ts`) | Solo el navegador recibe una muestra (prioriza errores/advertencias). Los resúmenes siempre cubren el archivo completo (`sample`, `summary.analyzedRows`) |
| Cobertura (`data-onboarding-coverage.ts`) | El pipeline rechaza si el análisis no cubre exactamente todas las filas parseadas |
| Runners | `createMany` por lotes de 500 dentro de UNA transacción (`timeout` 45 s); cada lote verifica su conteo; los runners Commerce rechazan archivos con filas no-CREATE (defensa en profundidad) |
| Pipeline | Tras EXECUTE, `created` debe ser igual al total analizado; si no, error (nunca éxito) |
| Transporte | `serverActions.bodySizeLimit = "4mb"` (por defecto en Next: 1 MB); `maxDuration = 60` en las páginas del Data Onboarding |

## Límites de Vercel verificados (docs oficiales, 2026-08-24)

- Cuerpo de solicitud/respuesta: 4.5 MB (413 `FUNCTION_PAYLOAD_TOO_LARGE`). Medido: un .xlsx de 5,000 filas con todas las columnas ocupa entre 186 KB (líneas) y 946 KB (clientes GYM).
- Duración con Fluid compute: 300 s por defecto. `maxDuration = 60` es válido en cualquier plan.
- Memoria: 2 GB (Hobby), hasta 4 GB (Pro).

No hace falta almacenamiento temporal ni ejecución durable: la escritura es una sola transacción, así que si se corta la función PostgreSQL revierte. Si la función muere después del COMMIT, el reintento queda bloqueado por CREATE_ONLY.

## Certificación

- `data-onboarding-5k.test.ts`: suite sintética para los 9 datasets en 199…5,000 filas, rechazo de 5,001, duplicados entre lotes, muestra de vista, lotes y tamaño de archivo.
- `data-onboarding-5k.integration.test.ts`: PostgreSQL real desechable (arnés `pg-it-harness`, requiere `GYM_BOOKING_IT_ADMIN_URL` / `GYM_BOOKING_IT_DATA_DIR` / `GYM_BOOKING_IT_PSQL`). Cubre los 9 datasets en todos los tamaños, reintento, fallo en el lote 4, timeout, límite de productos, aislamiento Shared y una segunda base (Dedicated).

## Limitaciones conocidas

- Clientes GYM sin `operational_code`, `document_id` ni datos fuertes (email, teléfono, nacimiento) solo generan advertencia por nombre: el reintento de un archivo así puede duplicar socios (semántica GYM-ONBOARDING sin cambios).
- La concurrencia de dos imports simultáneos del mismo dataset Commerce no está certificada (GYM usa un advisory lock).
- Las métricas se midieron contra PostgreSQL local. Con base remota cada lote suma la latencia de red (unos 10–20 viajes por import de 5,000 filas).
