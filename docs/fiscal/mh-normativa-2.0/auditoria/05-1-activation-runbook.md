# Runbook de activación MH 2.0 (motor fiscal base)

Fecha: 2026-11-24 · Estado: **documento, NO EJECUTADO**. Este runbook no autoriza su ejecución. Cada paso requiere una autorización explícita, por cliente y por ambiente.

## 0. Alcance

- Activa el perfil `MH_2_0` **por emisor y por ambiente**. El default sigue siendo `MH_1_2` (también cuando `mh_spec_profile` es NULL).
- Orden obligatorio: **TEST antes que PRODUCTION**, un cliente a la vez, cada base runtime por separado.
- PRODUCTION queda **bloqueado por código** mientras exista algún bloqueo P0 abierto (§8).

## 1. Precondiciones

| # | Condición | Cómo verificarla |
|---|---|---|
| P1 | El código de la rama está desplegado (el merge y el deploy los autoriza el dueño del producto) | Commit desplegado = commit revisado |
| P2 | Respaldo verificado de la base runtime del cliente (y del Control Plane si se toca) | `pg_dump` + restauración de prueba en una base desechable |
| P3 | `DTE_MH20_PROFILE_ENABLED` **OFF** mientras se aplican las migraciones y los seeds | Variable ausente o distinta de `"true"` |
| P4 | Emisor con `cod_estable_mh`/`cod_punto_venta_mh` asignados por la AT (patrón `^[MSBP][0-9]{3}$` / `^P[0-9]{3}$`) | Preflight de producción (IMP20-011) |
| P5 | No hay documentos pendientes (GENERATED, SCHEMA_VALIDATED, SIGNED) del emisor, o hay un plan para regenerarlos (política de transición) | Consulta de solo lectura en `dte_outgoing_documents` |
| P6 | Decisión interna COR-01 tomada y registrada (`05-1-correlatives-assessment.md` §10) | Acta |
| P7 | El emisor no está en Cabañas (departamento 09), o CAT-INC-001 está resuelta | El dry-run (§4) no lo reporta como `AMBIGUOUS` |

## 2. Migraciones (por cada base runtime, primero TEST)

| Orden | Migración | Contenido | Tipo |
|---|---|---|---|
| 1 | `20261124000000_mh20_spec_profile` (M1) | `mh_spec_profile`, `numbering_modality` (nullable, con CHECK) | Aditiva |
| 2 | `20261124010000_mh20_spec_profile_audit` (M1b) | Tabla `dte_spec_profile_audit_logs` + FK + CHECK | Aditiva |

Procedimiento:
1. `npx prisma migrate status` contra la base **objetivo**, confirmando explícitamente el host y el nombre (no confiar en `.env` local: `DATABASE_URL` y `DIRECT_URL` pueden apuntar a bases distintas).
2. `npx prisma migrate deploy` con `DIRECT_URL` apuntando a esa base.
3. `npx prisma migrate status` → al día. Comprobar las columnas y la tabla en `information_schema` (lo mismo que hace `checkSpecProfilePersistence`).
4. Registrar en el control de migraciones de qué base se trata, la fecha y el número de migraciones.

Verificado solo en una base desechable: 67/67 migraciones, sin deriva.

## 3. Seeds

| Seed | Comando | Efecto |
|---|---|---|
| Catálogos 1.2 (existente) | Onboarding / `db:seed:catalogs` | Sin cambios. La limpieza FEX11 ahora se limita a `version "1"` |
| **Catálogos 2.0** | `MH20_CATALOG_SEED_CONFIRM=<nombre exacto de la base> npx tsx prisma/seeds/seed.dte-catalog-items-mh20.ts` | Upsert de 122 filas `version "2.0"` (CAT-002/017/024/028/033). No toca `"1"` ni elimina nada |

- Ejecutarlo dos veces: la segunda debe dar `created 0 / updated 0 / unchanged 122` (idempotencia).
- No forma parte del seed por defecto ni del onboarding.

## 4. Dry-run territorial (solo lectura)

```
MH20_TERRITORY_DRY_RUN=YES npx tsx prisma/scripts/mh20-territory-dry-run.ts
```

- Revisar `byStatus`. `INCOMPATIBLE` debe ser 0. Cada `AMBIGUOUS` (Cabañas) bloquea las operaciones 2.0 de ese registro. `REVIEW` (Ciudad Delgado `06|19`) es informativo.
- Revisar `cat028`. Cualquier `CAT028_PENDING_EQUIVALENCE` o `CAT028_NO_CANDIDATE` significa que la FEX de bienes sigue bloqueada.
- Conservar la salida como evidencia. Los receptores de los planes MH TEST del Control Plane no están cubiertos (IMP20-008).

## 5. Permisos y acción administrativa

- Acción: `setDteSpecProfileAction` (`src/modules/commerce/dte/actions/set-dte-spec-profile.action.ts`). Por ahora no tiene UI.
- Requiere **Platform Admin** (`requireSuperAdmin`) y un contexto operacional con escritura en `fiscal.dte`. El tenant y la location salen de la sesión, nunca del formulario.
- Campos: `issuer_config_id`, `target_profile`, `reason` (10–500 caracteres) y `confirm_text` = `"<PERFIL>:<AMBIENTE>"` (p. ej. `MH_2_0:TEST`), que debe coincidir con el ambiente real del emisor.
- Validaciones del servicio, en orden: interruptor → persistencia (M1 + M1b) → emisor del tenant y la location → schemas 2.0 (01/03/05/14) → catálogos 2.0 sembrados → territorio → bloqueos P0 (solo en PRODUCTION) → control de concurrencia (valor previo esperado).
- Auditoría: `dte_spec_profile_audit_logs` (actor, alcance, ambiente, perfil anterior y nuevo, motivo, advertencias, fecha).

## 6. Interruptor global

1. Con las migraciones y los seeds hechos y el dry-run revisado, activar `DTE_MH20_PROFILE_ENABLED=true` **solo** en el despliegue que atiende al cliente piloto.
2. Activar con la acción el perfil `MH_2_0` en el emisor **TEST**.
3. Sin el interruptor, la acción rechaza `MH_2_0` (`GLOBAL_SWITCH_OFF`) y la API de catálogos responde 409 a `spec_profile=MH_2_0`.

## 7. Verificaciones posteriores (TEST)

- Generar FE v2, CCF v4, NC v4 y FSE v2 en TEST y validar contra el AJV oficial y las reglas semánticas.
- Contingencia: debe fallar con `R20-PEND-01` (esperado).
- FEX: servicios v3 sin notas internas; bienes, bloqueados.
- `observaciones`: null salvo texto fiscal explícito. Ninguna nota interna en el JSON.
- Comprobar que los documentos persisten `mh_spec_profile = MH_2_0` y que los emisores sin cambiar siguen en 1.2.
- La certificación MH TEST (IMP20-036) requiere su propia autorización. No forma parte de este runbook.

## 8. Bloqueos P0 de PRODUCTION (en código: `spec/mh20-activation-blockers.ts`)

MH20-092/093 · MH20-094 · INC-004/INC-006 · INC-005 (contingencia) · MH20-090 · COR-03/MH20-004 (modalidad de numeración) · MARIADB-CONTRACT.

Solo se cierran con evidencia externa (MH, AT o el receptor MariaDB) **y** un cambio de código revisado. Mientras sigan abiertos, la acción responde `PRODUCTION_BLOCKED`.

## 9. Rollback

| Nivel | Acción | Efecto |
|---|---|---|
| Emisor | `setDteSpecProfileAction` con `target_profile = MH_1_2` (permitido **incluso con el interruptor OFF**; queda auditado) | Los documentos nuevos vuelven a 1.2. Los ya emitidos en 2.0 conservan su versión (TRANSMIT_AS_IS) |
| Global | `DTE_MH20_PROFILE_ENABLED` OFF | Toda resolución vuelve a `MH_1_2`, sin importar lo persistido |
| Catálogos | No hace falta eliminar las filas `"2.0"`: los flujos 1.2 nunca las leen | — |
| Migraciones | **No revertir** M1/M1b en bases con datos: son aditivas e inertes con NULL/MH_1_2. Revertir solo con un respaldo y una autorización | — |

Prohibido en cualquier rollback: renumerar correlativos o modificar documentos ya emitidos, sellos o el JSON firmado.
