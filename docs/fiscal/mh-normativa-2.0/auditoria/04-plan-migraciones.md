# Fase 4: plan de migraciones y persistencia MH 2.0

**Estado: diseñado, NO ejecutado.** No se modificó `prisma/schema.prisma` ni se creó ninguna carpeta en `prisma/migrations/`. No se consultó Supabase, Vercel ni ninguna base.

## 1. Principios

1. **Solo aditivo.** Columnas nullable, tablas nuevas y enums nuevos. No hay `DROP`, no se renombra nada y no hay defaults que reescriban tablas grandes.
2. **Sin backfill fiscal.** `mh_spec_profile = NULL` significa "histórico, se infiere por `identificacion.version`".
3. **Los snapshots son inmutables.** Ninguna migración ni script toca:
   - `json_document`, `signed_jws`, `mh_response`, `reception_stamp`;
   - `event_json` y `mh_sello_recibido` de los eventos.
4. **Los correlativos no se tocan.** No hay `UPDATE` sobre `dte_correlatives` ni sobre `control_number`.
5. **Datos maestros derivados, no sobrescritos.** Sin columnas territoriales nuevas: `Municipality` ya contiene `district_code`, `new_municipality_code` y `new_municipality_name`.
6. **Cada base runtime se migra por separado.** Hay una base por cliente (Dedicated DB Only como objetivo). El Control Plane se migra aparte.

## 2. Evaluación de los modelos existentes

| Modelo (`schema.prisma`) | ¿Sirve tal cual? | Cambio |
|---|---|---|
| `Municipality` (:1418) | **Sí**, para la proyección territorial | Ninguno |
| `Customer` (:2131), `Supplier` (:1464) | Sí (`dept_code`, `municipality_code` = distrito 2.0) | Ninguno |
| `DteIssuerConfig` (:2406) | Falta el perfil activo | M1: `mh_spec_profile`, `numbering_modality` |
| `DteCorrelative` (:2542) | Sí para la 2.0 sin reinicio | Ninguno (COR-01 aparte, no diseñado para ejecutar) |
| `DteOutgoingDocument` (:2578) | No registra la normativa aplicada | M1: `mh_spec_profile` |
| `DteInvalidationEvent` (:2845) | Solo apunta a un DTE | M1: `mh_spec_profile`; M2: `return_event_id`, `dte_document_id` nullable + CHECK; M3: `special_ops_event_id` |
| `DteContingencyEvent` (:2901) | Sí | M1: `mh_spec_profile` |
| `DteContingencyEventItem` (:2953) | Solo admite DTE | M2: `return_event_id` nullable + CHECK (contingencia de Retorno, MH20-053) |
| `DteDocumentRelation` (:2816) | Es para NC/ND; no se reutiliza para el Retorno (otra semántica) | Ninguno |
| `DteCatalogItem` (:2719) | **Sí**: `version` forma parte del unique | Solo datos |
| `PlatformDteMhTestRun` (CP :4125) | Sí (`plan` es JSON) | Ninguno |
| `PlatformDteMhTestRunItem` (CP :4154) | `kind` es texto libre; faltan los FK lógicos a los eventos nuevos | M4 |

## 3. Migraciones

### M1 `mh20_spec_profile` (runtime, común a todas las organizaciones)

```sql
-- Diseño. No ejecutar en esta fase.
ALTER TABLE dte_issuer_configs      ADD COLUMN mh_spec_profile    TEXT NULL;  -- 'MH_1_2' | 'MH_2_0'
ALTER TABLE dte_issuer_configs      ADD COLUMN numbering_modality TEXT NULL;  -- 'CENTRALIZED' | 'PER_ESTABLISHMENT' (declarativo)
ALTER TABLE dte_outgoing_documents  ADD COLUMN mh_spec_profile    TEXT NULL;
ALTER TABLE dte_invalidation_events ADD COLUMN mh_spec_profile    TEXT NULL;
ALTER TABLE dte_contingency_events  ADD COLUMN mh_spec_profile    TEXT NULL;
ALTER TABLE dte_issuer_configs ADD CONSTRAINT dte_issuer_configs_mh_spec_profile_chk
  CHECK (mh_spec_profile IS NULL OR mh_spec_profile IN ('MH_1_2','MH_2_0'));
```

- Se usa TEXT con CHECK en vez de un enum Prisma: agregar perfiles futuros no exige `ALTER TYPE`.
- Costo: `ADD COLUMN NULL` sin default es instantáneo en PostgreSQL.
- Reversión operativa: dejar las columnas en NULL. `DROP COLUMN` solo con una decisión explícita.

### M2 `mh20_return_events` (runtime, común)

- **Enum** `DteReturnStatus`: `DRAFT`, `PENDING_SIGNATURE`, `SIGNED`, `SENT`, `ACCEPTED`, `REJECTED`.
- **`dte_return_events`** (cabecera):
  - `id`, `tenant_id`, `location_id`, `issuer_config_id`, `environment`, `generation_code` (unique), `dte_type_code_origin` ('01' | '11' | '14');
  - `event_json`, `signed_jws`;
  - `mh_estado`, `mh_sello_recibido`, `mh_codigo_msg`, `mh_descripcion_msg`, `mh_observaciones`;
  - `status`, `transmission_type_code`, `mh_spec_profile`;
  - fechas `requested/sent/accepted/rejected`, `requested_by`, `created_at` y `updated_at`.
  - Índices: `(tenant_id, location_id)` y `(status)`.
- **`dte_return_event_items`**:
  - `id`, `return_event_id`, `dte_document_id`, `no_item`;
  - `returned_amount` DECIMAL(14,2), `returned_tax` DECIMAL(14,2), `line_detail` JSON;
  - unique `(return_event_id, dte_document_id)` y `(return_event_id, no_item)`; índice `(dte_document_id)`.
- **`dte_invalidation_events`**:
  - `ADD return_event_id NULL` con FK;
  - `ALTER dte_document_id DROP NOT NULL`;
  - `CHECK (num_nonnulls(dte_document_id, return_event_id) = 1)`.
- **`dte_contingency_event_items`**:
  - `ADD return_event_id NULL`;
  - `dte_document_id DROP NOT NULL`;
  - CHECK de exactamente uno.
- **Riesgo.** Relajar el `NOT NULL` es el único cambio que no es puramente aditivo:
  - Prisma regenera los tipos como `string | null`, y los consumidores actuales deben tratarlo, aunque el CHECK garantiza que las filas existentes siguen pobladas.
  - Rollback: `SET NOT NULL` solo es posible si no existen filas con `return_event_id`. Si las hay, se conservan; nunca se borran.
- La regla del límite acumulado (MH20-059) vive en el servicio, con lock sobre la fila de `dte_outgoing_documents`, no en un trigger.

### M3 `mh20_special_ops` (runtime, **depende de la autorización fiscal del emisor**)

- `dte_special_operations_authorizations`:
  - `tenant_id`, `location_id`, `issuer_config_id`;
  - `kind` ('FVS' | 'CCI'), `resolution_ref`, `valid_from`, `valid_to`, `is_active`;
  - auditoría.
- `dte_special_ops_events` y `dte_special_ops_event_items`. Los ítems llevan:
  - `range_from`/`range_to`, o un documento unitario;
  - `doc_type_code` (CAT-023 2.0).
- `dte_invalidation_events.special_ops_event_id NULL`, con el CHECK ampliado a 3 destinos.
- **Solo se aplica cuando haya un cliente en el supuesto.** Mientras tanto se puede diferir: no la necesita ninguna otra tarea, salvo IMP20-023 y los escenarios OE.

### M4 `mh20_test_run_events` (**Control Plane**)

```sql
ALTER TABLE platform_dte_mh_test_run_items ADD COLUMN runtime_return_event_id      TEXT NULL;
ALTER TABLE platform_dte_mh_test_run_items ADD COLUMN runtime_special_ops_event_id TEXT NULL;
```

- `kind` admite, sin migración: `RETURN_EVENT`, `RETURN_INVALIDATION` y `SPECIAL_OPS_EVENT`.
- No toca las bases cliente.

### M5 (opcional) `mh20_transmission_batches` (runtime)

Solo si se implementa la recepción por lote (IMP20-025):

- `dte_transmission_batches`: `codigo_lote`, `status`, `sent_at`, `last_polled_at`, `response`;
- FK nullable `batch_id` en `dte_transmission_logs`.

### Datos sin DDL: seeds de catálogo (runtime, común)

- Se hacen con upsert por `(catalog_code, item_code, version)`.
- Contenido:
  - **CAT-002**: se agregan 04, 07, 08, 09, 11, 14, 15, 17 y 18.
  - **CAT-017**: se agregan 08, 09, 11, 12, 13 y 14.
  - **CAT-024**: la etiqueta del código 2 pasa a "Rescindir de la operación realizada". Es una actualización de etiqueta, no de código, y no afecta a eventos ya transmitidos.
  - **CAT-028**: 90 filas con `version = "2.0"`. Las 56 filas V1.2 se conservan.
  - **CAT-033**: 4 filas con `version = "2.0"`.
- Las dos fuentes (`prisma/seeds/seed.dte-catalog-items.ts` y `platform/lib/seed-runners/dte-catalog-items-runner.ts`) pasan a una sola: `prisma/seeds/data/dte-catalog-items.data.ts`.
- No hay `DELETE`.

## 4. Dry-run territorial (prerrequisito de la activación por emisor)

Script de solo lectura `prisma/scripts/mh20-territory-dry-run.ts` (IMP20-008).

| Fuente | Base | Campos |
|---|---|---|
| `DteIssuerConfig` | runtime | `dept_code`, `municipality_code`, `cod_estable_mh`, `cod_punto_venta_mh` (además, formato M/S/B/P) |
| `Customer` | runtime | `dept_code`, `municipality_code` |
| `Supplier` | runtime | `dept_code`, `municipality_code` |
| `PlatformDteMhTestRun.plan` (receptores) | Control Plane | `deptCode`, `municipalityCode` |

**Salida:** un JSON por base con estas columnas:

- `entity`, `id`;
- `dept`, `code`;
- `projected {departamento, municipio, distrito}`;
- `status`.

`status` toma uno de estos valores:

- `OK`;
- `INCOMPLETE`;
- `NOT_FOUND`;
- `CAT_INC_001_CABANAS`;
- `REVIEW_LABEL` (Delgado);
- `ESTAB_CODE_INVALID`.

Los números de documento van enmascarados.

**Garantías:**

- conexión con `default_transaction_read_only = on`, o `SET TRANSACTION READ ONLY`;
- solo `findMany` con `select`;
- el reporte se escribe en el scratchpad o en un directorio de operación, nunca en el repositorio.

**Criterio de activación:** 0 `NOT_FOUND`, 0 `INCOMPLETE` en el emisor y 0 `ESTAB_CODE_INVALID`. Cabañas queda bloqueado hasta CAT-INC-001. Los clientes o proveedores con problemas no bloquean al emisor: bloquean el documento puntual en el momento de generarlo, con un mensaje accionable.

**No existe un paso de "apply".** La proyección se calcula en tiempo de generación, así que no hay datos que actualizar.

## 5. Compatibilidad histórica

| Dato | Tratamiento |
|---|---|
| DTE y eventos aceptados | Sin cambios. Se revalidan y descargan con su propia versión. |
| `mh_spec_profile` NULL | Se infiere: FE v1/CCF v3/NC v3/FSE v1/INV v2/CONT v3 = `MH_1_2`. FEX v3 = `AMBIGUOUS`; se informa como "MH 1.2/2.0 (FEX v3 común)". |
| Catálogos V1.2 | Se conservan con `version = "1"` y siguen resolviendo las etiquetas de los históricos |
| Municipio en DTE históricos | `direccion.municipio` histórico = código antiguo. No se reinterpreta con el CAT-013 2.0. La UI histórica muestra el valor con la semántica 1.2. |

## 6. Alcance por base y orden de aplicación

| Paso | Base | Migración | Condición |
|---|---|---|---|
| 1 | Local (`DATABASE_URL`) | M1 | `prisma validate` + `generate` + tests |
| 2 | Control Plane | M4 | Después del paso 1. Independiente de los runtime. |
| 3 | Cada runtime cliente | M1 | Checklist por base. Sin efecto funcional con el flag OFF. |
| 4 | Local y después cada runtime | M2 | Cuando IMP20-022 esté listo |
| 5 | Solo los runtime con autorización OE | M3 | Cliente en el supuesto MH20-063 |
| 6 | Runtime (opcional) | M5 | Si se implementa el lote |

## Impacto en bases de datos y sincronización local/remota

- **Qué base se tocó:** ninguna. Esta fase solo diseña.
- **Qué base no se tocó:** la local (`DATABASE_URL`), la remota (`DIRECT_URL`), el Control Plane y todos los runtime.
- **Qué quedó alineado:** nada cambia, así que no aparece ninguna desalineación nueva.
- **Qué quedó pendiente:** M1 a M4 (y M5 opcional), el seed de catálogos 2.0 y el dry-run territorial por base.
- **Qué debe ejecutar el usuario después, durante la implementación, por cada migración:**
  1. `npx prisma validate`, `npx prisma generate` y `npx prisma migrate dev --name mh20_spec_profile` en local.
  2. Probar en local.
  3. `npx prisma migrate deploy` contra cada base remota (`DIRECT_URL` del runtime correspondiente).
  4. `npx prisma migrate status` en local y en cada remoto, y confirmar que coinciden.

  Si `DATABASE_URL` y `DIRECT_URL` apuntan a bases distintas, la migración aplicada por la CLI **no** queda en la base local del runtime. Hay que aplicarla explícitamente en las dos.
- **Script auxiliar sugerido:** extender `prisma/apply-local-migration.ts` con una verificación de `migrate status` multi-base, en una tarea aparte (no incluida).
