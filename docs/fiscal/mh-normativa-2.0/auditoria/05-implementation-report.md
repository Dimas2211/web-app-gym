# Fase 5 — Informe de implementación del motor fiscal base MH 2.0

Fecha: 2026-11-24 · Rama: `feat/mh-normativa-2.0` (creada desde `b682b70`) · Sin commit, push, merge ni deploy.
Estado: **FASE_5_PARTIAL**. Detalle por tarea en `05-task-status.json`.

## Resultado por bloque

| Bloque | Resultado | Resumen |
|---|---|---|
| 5A Registro / schemas | PASS | Perfiles MH_1_2 (default) / MH_2_0; registro (perfil, tipo) → versión/schema; 8 schemas oficiales copiados literal (SHA-256 verificado por test); 2.0 nunca se activa sola. |
| 5B M1 | PASS | Migración aditiva nullable, probada solo en base desechable; sin drift. Ver `05-migration-status.md`. |
| 5C Validación / transmisión | PASS | AJV por `identificacion.version` del documento (caché por schema); versión enviada = versión del documento; guarda versión↔perfil↔schema en firma/transmisión/invalidación; interruptor global OFF; pendientes de confirmación fallan cerrado en PRODUCTION. |
| 5D Catálogos / territorio | PARTIAL | Servicio territorial canónico (FEX conserva su salida); Cabañas falla cerrado en 2.0; Delgado → REVIEW_LABEL; dry-run de solo lectura (no ejecutado). Catálogos 2.0 como datos versionados **no sembrados** (las consultas no filtran por versión). |
| 5E Reglas semánticas | PARTIAL | Catálogo clasificado (VIGENTE / MODIFICADA / ELIMINADA / PENDIENTE) y motor posterior a AJV solo para 2.0; las pendientes solo advierten. COR-01/COR-03 fuera de alcance. |
| 5F Builders | PASS (FEX parcial) | FE v2, CCF v4, NC v4 y FSE v2 tras parámetro de perfil; salida 1.2 byte a byte igual (golden). FEX v3 igual en ambos perfiles; tipoRegimen/CAT-028 de bienes pendiente. |

## Decisiones técnicas relevantes

1. **Desplegable antes de M1.** Con el interruptor OFF no se seleccionan ni escriben columnas M1.
2. **Versión desde el documento (D3).** Los documentos firmados conservan su payload; nunca se regeneran por cambio de perfil. Si falta la versión y no hay perfil persistido, se usa la versión MH_1_2 (comportamiento previo exacto).
3. **Builders con perfil opcional.** El default es MH_1_2; las ramas 2.0 se derivan de las piezas 1.2 y aplican solo cambios confirmados.
4. **NC v4** con fórmulas de la Normativa 2.0 (campos 98–101, 143–153; holgura ±0.01).
5. **FSE v2** bloquea una retención IVA 1 % existente (ivaRete1 eliminado) en lugar de descartarla en silencio.
6. **Catálogos 2.0 sin sembrar**, para no exponer códigos 2.0 (p. ej. CAT-028 `cccc.ccc`, CAT-017 Bitcoin) en flujos 1.2.

## Cambios en archivos existentes (21 archivos, +770 / −139)

`prisma/schema.prisma`, `prisma/seeds/seed.dte-catalog-items.ts`, `platform/lib/seed-runners/dte-catalog-items-runner.ts`
(solo etiqueta CAT-024 código 2), `dte/services/{validate-dte-json-schema, transmit-dte-document, transmit-invalidation-event,
sign-dte-document, generate-fe-json, generate-ccfe-json, generate-nc-json, generate-fse-json, generate-fse-json-pipeline,
generate-fex-json, generate-fex-json-pipeline, dte-production-preflight}.service.ts`, `dte/types/fse-json.types.ts`,
`dte/utils/{fex11-schema-version, fex11-v3-territory}.ts`, `dte/utils/cat013-fex-v3-municipalities.test.ts`,
`dte/mh-test-runs/mh-test-scenarios.ts` (opciones pass-through), `dte/dev/verify-fex11-transmit-local.ts` (versión FEX 1 → 3).

## Archivos nuevos (45)

- `dte/spec/*` (7 módulos y 1 test), `dte/config/dte-mh20.flags.ts`, `dte/rules/*` (2)
- `dte/schemas/mh/v2_0/*` (8 JSON oficiales y `SHA256SUMS.md`)
- `dte/utils/{cat013-municipalities, dte-territory-projection, mh20-builder-helpers, nc-v4-formulas}.ts`
- `dte/services/__golden__/*` (fixtures, 2 tests, 8 golden JSON), `dte/services/dte-production-preflight.mh20.test.ts`
- `prisma/migrations/20261124000000_mh20_spec_profile/migration.sql`
- `prisma/seeds/data/dte-catalog-items-mh20.data(.test).ts`, `prisma/scripts/mh20-territory-dry-run(.test).ts`
- `docs/fiscal/mh-normativa-2.0/auditoria/05-*` (4)

## Compatibilidad MH 1.2

- Los golden de FE v1, CCF v3, FEX v3, FSE v1 y NC v3 se capturaron antes de modificar los builders y coinciden byte a byte.
- Todos los tests previos pasan salvo el fallo preexistente de la línea base (`dte-internal-certification.test.ts:905`), idéntico antes y después.
- Una sola expectativa de test cambió (aislamiento de CAT-013, intencional, D7).

## Bloqueos y decisiones pendientes

- CAT-INC-001 (Cabañas Este/Oeste intercambiados) → 2.0 falla cerrado para el dpto. 09.
- CAT20-297 (Ciudad Delgado) → requiere revisión manual; hoy solo se marca.
- CAT-INC-003/004/005/006 → FEX, invalidación y contingencia 2.0 pendientes o bloqueados en el registro.
- Equivalencia CAT-028 EX-n → `cccc.ccc` no confirmada; CAT-033 " TA-1" con espacio inicial.
- Decisión interna #4: uso de notas de venta/compra en `observaciones` (FE/CCF/NC envían null; FSE conserva purchase.notes igual que en v1).
- Filtro por `version` en `list-dte-catalog-items` y selectores, antes de sembrar catálogos 2.0.
- Acción administrativa para fijar `mh_spec_profile` (con permisos y auditoría) y el runbook de activación (IMP20-037).
- Observación ajena: NC v3 resta totalDescu de subTotalVentas y CCF v3 no; no se tocó (golden preservado).

## Protección de producción

No se consultaron ni modificaron bases productivas, remotas, del Control Plane ni de clientes. No se ejecutaron
migraciones ni seeds remotos. No hubo transmisiones a MH ni inserciones en MariaDB, y no se usaron correlativos
productivos. Certificados, firmadores y credenciales quedaron sin cambios. MH 2.0 sigue apagado globalmente
(`DTE_MH20_PROFILE_ENABLED` sin definir). No se hizo commit, push, merge ni deploy.
