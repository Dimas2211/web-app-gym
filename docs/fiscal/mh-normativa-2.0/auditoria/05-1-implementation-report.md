# Fase 5.1: informe de implementación (cierre de pendientes del motor fiscal base)

Fecha: 2026-11-24 · Rama `feat/mh-normativa-2.0` · HEAD inicial `b682b70` · **sin commit, sin push, sin deploy** · `DTE_MH20_PROFILE_ENABLED` **OFF** · Veredicto: **FASE_5_PASS**

Se preservó el trabajo de Fase 5 sin confirmar. No hubo reset, stash, clean ni archivos eliminados.

## Resultado por bloque

| Bloque | Resultado | Resumen |
|---|---|---|
| 5.1A Catálogos versionados | PASS | Resolución única `spec/dte-catalog-version.ts`. MH_1_2 → `"1"` siempre; MH_2_0 → `"2.0"` solo en CAT-002/017/024/028/033. Consultas, API, preflight y onboarding filtran por versión. Se corrigió un defecto latente: la limpieza FEX11 del seed 1.2 habría borrado las filas CAT-028 2.0. Seed 2.0 separado e idempotente, con confirmación. **Sin migración.** Ver `05-1-catalog-versioning.md`. |
| 5.1B Incidencias de catálogo y territorio | PASS | Contraste con el Excel oficial (A174, A398/399, A1907). Cabañas → error explícito `CAT_INC_001_CABANAS` también en FEX 2.0. Ciudad Delgado no es ambigua (REVIEW_LABEL). `" TA-1"` se conserva literal. CAT-028 sin equivalencias activadas. Dry-run con estado AMBIGUOUS y hallazgos CAT-028, sin ejecutar en bases reales. CAT-INC-005/006 no existen en el registro (error del informe de Fase 5). |
| 5.1C Reglas pendientes | PASS | Clasificación con fuente: PEND-01 (contingencia, INC-005), PEND-07 (UUID en mayúsculas en tipoGeneracion 2) y PEND-08 (umbral de receptor en FE, SCH20-066) = BLOCK_EMISSION. PEND-02..06 = WARNING. Ninguna es BLOCK_ACTIVATION. Pruebas positivas y negativas. |
| 5.1D Observaciones fiscales | PASS | `resolveMh20FiscalObservations`: solo texto explícito, null por defecto, error si pasa de 3000 caracteres (sin truncar). FE/CCF/FSE/FEX 2.0 nunca usan `notes`. NC v4 = null. 1.2 sin cambios. 11 pruebas con la nota secreta. |
| 5.1E Administración del perfil | PASS | Server action con Platform Admin + `fiscal.dte` (escritura) + confirmación `PERFIL:AMBIENTE`, y servicio con validaciones de interruptor, persistencia, alcance, schemas, catálogos, territorio, bloqueos P0 en PRODUCTION y concurrencia. Auditoría en la tabla nueva (M1b). El rollback a 1.2 siempre está permitido. Sin UI. |
| 5.1F FEX v3 | PASS | El schema oficial 2.0 tiene el mismo SHA-256 que el v3 vigente, y los 111 diffs no afectan a Zolvi. Cambio confirmado: la causa 2.0 del bloqueo de bienes. Fixtures 2.0 validadas contra el original. INC-003 sigue abierto (PRODUCTION fail-closed). Sin modalidades nuevas. |
| 5.1G Invalidación FEX (certificación) | PASS | Ver la sección siguiente. 77/77. |
| 5.1H Correlativos | PASS (documental) | `05-1-correlatives-assessment.md`: R-COR-1..5, alternativas y migraciones potenciales no preparadas. Sin cambios en secuencias. |

## Investigación 5.1G

`dte-internal-certification.test.ts:905` afirmaba que FEX (11) no es invalidable. El commit `58a00a8` (2026-11-11) incluyó `"11"` en `INVALIDABLE_DTE_TYPES` de forma deliberada y documentada (`docs/modules/fex11-standard-dte.md`). La suite (`d9f29de`, 2026-10-12) quedó desactualizada.

El defecto estaba en la prueba. La corrección fue inequívoca: el caso de "tipo no admitido" ahora usa FSE (14) ACCEPTED, que sigue sin ser invalidable, así que la regla sigue cubierta. No se modificó el código productivo.

## Archivos

**Nuevos (código):**
- `spec/dte-catalog-version.ts`
- `spec/mh20-activation-blockers.ts`
- `services/dte-spec-profile-admin.service.ts`
- `actions/set-dte-spec-profile.action.ts`
- `prisma/seeds/seed.dte-catalog-items-mh20.ts`
- `prisma/migrations/20261124010000_mh20_spec_profile_audit/`

**Nuevos (pruebas):**
- `spec/dte-catalog-version{,.integration}.test.ts`
- `utils/dte-territory-ambiguity.mh20.test.ts`
- `rules/mh-semantic-rules.pending.test.ts`
- `__golden__/mh20-fiscal-observations.test.ts`
- `__golden__/mh20-fex-v3.test.ts`
- `actions/set-dte-spec-profile.action.test.ts`
- `services/dte-spec-profile-admin{.service,.integration}.test.ts`

**Modificados:**
- `prisma/schema.prisma`
- `queries/list-dte-catalog-items.ts`
- `app/api/dte/catalogs/route.ts`
- `platform/actions/get-support-sale-form-data.action.ts`
- `platform/lib/database-preflight.ts`
- `prisma/seeds/seed.dte-catalog-items.ts`
- `platform/lib/seed-runners/dte-catalog-items-runner.ts`
- `utils/dte-territory-projection.ts`
- `utils/mh20-builder-helpers.ts`
- `utils/fex11-v3-rules.ts`
- `services/generate-{fe,ccfe,nc,fse,fex}-json.service.ts`
- `rules/mh-semantic-rules{,.catalog}.ts`
- `prisma/scripts/mh20-territory-dry-run{,.test}.ts`
- `__golden__/mh20-fixtures.test.ts`
- `certification/dte-internal-certification.test.ts`

Las rutas sin prefijo están bajo `src/modules/commerce/dte/`. No se tocó el interruptor (`config/dte-mh20.flags.ts`), `dte-correlative.service.ts`, los firmadores, las credenciales ni MariaDB.

## Tareas IMP20 (39)

IMPLEMENTED 14 · PARTIAL 9 · DEFERRED 9 · NOT_STARTED 7. Cambios en 5.1:
- 004, 009 y 020: PARTIAL → IMPLEMENTED
- 037: NOT_STARTED → IMPLEMENTED
- 008, 017 y 039: siguen en PARTIAL, con nuevas limitaciones que son bloqueos externos

Detalle e historial en `05-1-task-status.json`.

## Riesgos registrados

- FSE v1 y FEX con MH_1_2 siguen enviando `notes` en `observaciones`. Es comportamiento histórico: no se cambió para no romper los golden 1.2.
- La administración del perfil no tiene UI. La activación real queda sujeta al runbook.
- `cat-022-identification-types.test.ts` no carga por un problema de resolución ESM de next-auth. Es de entorno y ajeno a 5.1.

## Impacto en bases de datos y sincronización local/remota

- `schema.prisma` **cambió** (modelo `DteSpecProfileAuditLog` + relación). Migración nueva **M1b** `20261124010000_mh20_spec_profile_audit`.
- Aplicada **solo** en bases desechables `localhost:5432/zolvi_mh20_*_scratch_*`: 67/67, sin deriva. Ya están todas eliminadas.
- **No se tocó:** `TrustmeDB` (local de `.env`; sigue en 60 migraciones, sin M1 ni M1b), Supabase, el Control Plane ni MariaDB. No se aplicó ningún seed persistente.
- Las bases local y remota quedan **sin M1/M1b**. Es seguro: con el interruptor OFF nada lee las columnas nuevas, y la acción falla cerrada con `PERSISTENCE_INCOMPATIBLE`.
- Para alinear, cuando se autorice: seguir `05-1-activation-runbook.md` §2 (`migrate status` → `migrate deploy` por base, TEST primero, con respaldo).
