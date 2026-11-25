# COR-01: reinicio anual del correlativo

Estado: **IMPLEMENTADA EN LOCAL, opción B**. Fecha: 2026-11-25 (Fase 9.0). Antecedente: `auditoria/05-1-correlatives-assessment.md` y `auditoria/09-0-readiness-report.md` §6.

- Fase 9.1: la migración está **aplicada en TrustmeDB local**; **no** en el Control Plane ni en los runtimes. Ver §7.
- Commit local en la Fase 9.1 (ver `auditoria/09-1-commit-report.md`).
- El reinicio del número de control en `000000000000001` en cada ejercicio impositivo (MH20-005, que ya exigía la Normativa 1.2) es un criterio **RESUELTO_DOCUMENTALMENTE**, pero **no** está **CERTIFICADO_MH**.

## 1. Comportamiento anterior

- Al cambiar de año se creaba una fila `DteCorrelative` nueva, pero la secuencia **continuaba** desde el máximo usado.
- El año salía de `new Date().getFullYear()`, es decir, de la zona horaria del proceso (COR-02).
- `unique (tenant_id, environment, control_number)` no incluía el año.
- La reserva simple usaba `upsert` y tenía una carrera (P2002) en el primer alta (R-COR-3).

## 2. Comportamiento implementado

| Punto | Implementación |
|---|---|
| Año fiscal | `fiscalYearInElSalvador(now)` (UTC−6 fijo) mediante `currentDteFiscalYear()` en `dte-correlative.service.ts`. Ya no se usa `getFullYear`. |
| Columna | `dte_outgoing_documents.fiscal_year INT NULL`. Se fija **en la reserva**, en la misma transacción que el número, y no cambia después. |
| Unicidad | `@@unique([tenant_id, environment, fiscal_year, control_number])`, más un índice único parcial `dte_outgoing_documents_legacy_control_number_key` sobre `(tenant_id, environment, control_number) WHERE fiscal_year IS NULL` (SQL manual) que protege a los heredados ambiguos. |
| Reserva simple | `createMany({skipDuplicates})`, después un UPDATE que toma el bloqueo de fila, después el piso, después el incremento. Corrige R-COR-3. Devuelve `fiscal_year`. Acepta `{ now }` para pruebas. |
| Reserva en bloque (MH TEST) | Mismo año SV y mismo piso por año. Devuelve `fiscal_year`. |
| Piso | `readMaxSequenceUsedInOutgoing(…, fiscal_year)` considera **los documentos del mismo año más los de `fiscal_year` NULL** (fail-safe: nunca se reutiliza un número cuyo año no consta). |
| Estado y alineación | `getDteCorrelativeStatus` y `alignDteCorrelativeBaseline` aceptan `fiscal_year`, que por defecto es el vigente en SV. El estado informa `fiscal_year`. El baseline externo es **por año** y no puede retroceder por debajo de lo usado en ese año. |
| Pendientes de años anteriores | `checkDteFiscalYearForGeneration` en FE, CCF, NC, FEX, FSE y la generación MH TEST. Si el `fecEmi` cae en un ejercicio distinto del de la reserva, se rechaza con `DTE_FISCAL_YEAR_MISMATCH`. El documento **conserva** su `control_number` y no se regenera ni se renumera; el operador lo cancela (CANCELLED) y emite uno nuevo. Para un heredado sin `fiscal_year` se compara con el año SV de `created_at`, sin escribir nada. |
| TEST/PROD | Separados por `environment`, tanto en el unique como en `DteCorrelative`. |
| COR-03 | **No modificado.** La modalidad de numeración sigue bloqueada y es P0 para PRODUCTION 2.0. |

### Puntos de reserva conectados

Todos escriben `fiscal_year` en el documento:

- `dte-outgoing.service.ts`: venta 01/03 y compra 14
- `create-credit-note-dte.service.ts`: 05
- `export-sale.service.ts`: 11
- `support-dte-create-pending-runner.ts`
- `mh-test-documents.service.ts`: bloque
- `dev/verify-fex11-preview-local.ts`

## 3. Migración M-COR-01: `20261125000000_cor01_fiscal_year`

Es independiente: no modifica ninguna migración anterior.

1. `ADD COLUMN fiscal_year INT` (sin DEFAULT ni reescritura), con CHECK 2000–9999.
2. **Backfill de solo lectura**, basado en la **fecha fiscal original verificable** y nunca en la fecha actual. Solo se asigna el año cuando coinciden todas las evidencias:
   - el año de `created_at` (instante de la reserva) es el mismo en hora SV y en UTC, es decir, fuera de la ventana 31/12 18:00–23:59 SV donde el año dependía del proceso;
   - si existe `identificacion.fecEmi`, su año coincide con el anterior.
3. Cualquier otro caso queda como **ambiguo**: `fiscal_year` NULL. Esas filas no se modifican, se informan con `RAISE NOTICE COR01_BACKFILL` y las protege el índice parcial.
4. `DROP` del unique anterior y `CREATE` del unique por año y del índice parcial de heredados.

La migración no toca `control_number`, `json_document`, `signed_jws`, `reception_stamp`, estados ni `dte_correlatives`.

### Registros ambiguos

| Base | Asignados | Ambiguos |
|---|---|---|
| Copia restaurada de TrustmeDB (datos reales) | 72 | **0** |
| Fixture de casos límite | 4 | 3 (esperados: ventana COR-02, `fecEmi` frente a reserva, `fecEmi` malformado) |

En TrustmeDB no hay registros ambiguos. En CP y runtimes remotos hay que repetir la consulta de verificación antes de aplicar:

```sql
SELECT id, environment, dte_type_code, control_number, dte_status, created_at,
       json_document->'identificacion'->>'fecEmi' AS fec_emi
  FROM dte_outgoing_documents
 WHERE control_number IS NOT NULL
   AND (EXTRACT(YEAR FROM created_at - INTERVAL '6 hours') <> EXTRACT(YEAR FROM created_at)
        OR (json_document->'identificacion' ? 'fecEmi'
            AND COALESCE(substr(json_document->'identificacion'->>'fecEmi',1,4), '') <>
                EXTRACT(YEAR FROM created_at - INTERVAL '6 hours')::text));
```

Si esta consulta devuelve filas, se documentan. La migración las deja en NULL **sin modificarlas**.

## 4. Pruebas

El detalle está en `auditoria/09-0-test-results.md` §C.

| Bloque | Resultado |
|---|---|
| Unitarias (`dte-correlative.cor01-characterization.test.ts`) | 19/19 |
| PostgreSQL desechable (`dte-correlative.cor01.pg.test.ts`) | 9/9: transición, reinicio, unicidad, 25 reservas concurrentes, bloque concurrente, TEST/PROD, pendientes del año anterior, heredados, alineación por año, compatibilidad histórica |
| Backfill SQL (`prisma/scripts/cor01/*.scratch.sql`) | PASS (8 casos) |
| Copia restaurada de TrustmeDB | 72/72 asignados, `migrate diff` vacío, huella documental idéntica |
| Regresión | Las 26 PG anteriores pasan con la migración; la suite amplia queda en 0 fallos nuevos |

## 5. Pendiente y riesgos

1. **Aplicación.**
   - Primero TrustmeDB, con un backup nuevo y autorización.
   - Después CP y runtimes TEST, con autorización separada y la consulta de ambiguos del §3.
   - La migración y el código deben estar desplegados **antes del 2026-12-31 18:00 SV** (00:00 UTC). A esa hora, el código anterior desplegado en UTC ya cambiaría de fila de año. El ejercicio 2027 empieza el 2027-01-01 a las 00:00 SV (06:00 UTC).
2. **Runtime local.** El cliente Prisma generado ya incluye `fiscal_year`. Mientras M-COR-01 no se aplique en TrustmeDB, la app local falla (P2022) en las lecturas de `dte_outgoing_documents`.
3. **Despliegue.** El código nuevo requiere la columna. El orden es: migración en todas las bases, después deploy.
4. **Supuesto de zona horaria del proceso anterior.** Para clasificar un documento como ambiguo se compararon SV y UTC, que corresponden a local y Vercel. Un proceso en otra zona no está contemplado.
5. **Pendiente que cruza el año.** Solo el borrador (`PENDING_GENERATION`) se rechaza al generarse y no se renumera. La decisión operativa (cancelar y reemitir) es manual. Ver §7.

## 7. Distinción por etapa del ciclo de vida (Fase 9.1, confirmada)

Se confirma: **no se renumeran automáticamente** documentos históricos ni pendientes de años anteriores. Política pura en `utils/dte-fiscal-year-lifecycle.ts` (`classifyDteFiscalYearStage`, `decideDteCrossYearPolicy`), con pruebas en `dte-fiscal-year-lifecycle.test.ts`.

| Etapa | Estados | `DTE_FISCAL_YEAR_MISMATCH` | Continuar firma/transmisión | Cancelar y reemitir |
|---|---|---|---|---|
| Borrador sin generar ni firmar | `PENDING_GENERATION` | Sí, si cruza el año | No (no hay JSON) | Sí, decisión manual del operador |
| Generado | `GENERATED`, `SCHEMA_VALIDATED` sin intento de envío | No para firma; sí bloquea **regenerar** (reescribir JSON) en FEX/FSE | Sí, con su número, código y JSON | No |
| Firmado pendiente de transmisión | `SIGNED` sin intento de envío | No | Sí, con su número, código, JSON y firma | No |
| Respuesta incierta de MH | `SENT`, o `SIGNED`/`SCHEMA_VALIDATED` con intento previo | No | Solo tras consulta/conciliación (MT v2 §3.3) | **No** |
| Aceptado | `ACCEPTED`, `OBSERVED` | No | No aplica (inmutable) | No |

- La guarda solo existe en los generadores y en la generación MH TEST; las pruebas estructurales verifican que firma, transmisión, conciliación, reapertura para re-firma, retransmisión y entrega MariaDB no la invocan.
- Las cancelaciones existentes no tocan firmados ni inciertos: la anulación de venta solo cancela `PENDING_GENERATION` intactos y `cancelUnsignedMhTestDocument` excluye `SIGNED`/`SENT`/`ACCEPTED`.
- La admisibilidad fiscal de transmitir un documento firmado de un ejercicio anterior la decide MH; Zolvi no la bloquea por el año.
- COR-03 sin cambios.

**Aplicación (Fase 9.1):** M-COR-01 aplicada en TrustmeDB local (70/70) tras respaldo verificado y ensayo; 72/72 documentos con `fiscal_year` 2026, 0 ambiguos. Control Plane y runtime compartido: 0 ambiguos (consulta de solo lectura), migración **no aplicada**.

## 6. Restricciones respetadas

- No se reescribió `control_number`, `json_document`, `signed_jws` ni el sello de ningún documento emitido.
- No se renumeró nada de lo ya entregado a MariaDB.
- No se tocaron correlativos productivos ni COR-03.
