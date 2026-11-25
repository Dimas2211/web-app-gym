# MH 2.0 — Fase 6 — Estado de migraciones

Fecha: 2026-11-24 · Rama `feat/mh-normativa-2.0` · HEAD `b682b70` · sin commit.

## 1. Migraciones de la fase

| Id | Carpeta | Estado | Tipo |
|---|---|---|---|
| M1 | `20261124000000_mh20_spec_profile` | Sin cambios (Fase 5) | aditiva |
| M1b | `20261124010000_mh20_spec_profile_audit` | Sin cambios (Fase 5.1) | aditiva |
| **M2** | `20261124020000_mh20_return_events` | **Nueva (Fase 6)** | aditiva |
| M3 | — | **No creada** | — |

M1 y M1b no se modificaron.

## 2. M2 — Evento de Retorno

Crea:

- el enum `DteReturnStatus` (DRAFT, PENDING_SIGNATURE, SIGNED, SENT, ACCEPTED, REJECTED, CANCELLED);
- `dte_return_events`;
- `dte_return_event_items`;
- `dte_return_invalidation_events`.

Las FK usan `ON DELETE RESTRICT`. Añade índices por tenant/location/estado y por documento. También añade 9 restricciones CHECK que Prisma no modela:

- origen ∈ {01, 11, 14};
- `mh_spec_profile = 'MH_2_0'`;
- ambiente ∈ {TEST, PRODUCTION};
- `transmission_type_code` ∈ {1, 2};
- `total_returned ≥ 0`;
- `no_item` entre 1 y 2000;
- cantidad > 0 e importes ≥ 0;
- en la invalidación de Retorno, perfil `MH_2_0` y tipo `'2'`.

### Decisión de nulabilidad (6C)

Se evaluó relajar `dte_invalidation_events.dte_document_id NOT NULL` y **se descartó**. Un Retorno referencia hasta 50 DTE, y todos los consumidores actuales de `dte_invalidation_events` asumen un único DTE: listados, entrega MariaDB, transición `INVALIDATED` y ledger. La alternativa aditiva y más segura es una tabla propia, `dte_return_invalidation_events`, con `return_event_id NOT NULL`. `dte_contingency_event_items` tampoco se modificó: la contingencia de un Retorno queda pendiente.

### Cambio en `schema.prisma`

El diff es de +205 líneas y 0 eliminaciones: los hunks de M1/M1b de Fase 5 más los de M2. No se ejecutó `prisma format`, porque reordena modelos GYM ajenos. Se ejecutó `npx prisma validate` y `npx prisma generate`.

## 3. M3 — Operaciones Especiales

No es necesaria. Sin un modelo de autorización AT por emisor (FVS/CCI) no existe persistencia legítima de un Evento 17. El builder es puro y está bloqueado (ver `06-pending-activation-blockers.md`). No se ejecutó M3 en ninguna base.

## 4. Verificación en base desechable

| Paso | Resultado |
|---|---|
| Bases | `zolvi_mh20_f6_scratch_20261124222607` y `zolvi_mh20_f6_shadow_scratch_20261124222607` en `localhost:5432`. El guard exige host local y nombre `_scratch_`. |
| `prisma migrate deploy` | **68/68** aplicadas |
| `prisma migrate status` | "Database schema is up to date!" |
| `migrate diff --from-migrations … --to-schema-datamodel … --exit-code` | **exit 0**, "No difference detected" (sin deriva) |
| `migrate diff --from-url <scratch> --to-schema-datamodel --exit-code` | exit 0 |
| Tablas / CHECK | 3 tablas `dte_return_*` y 9 CHECK presentes |
| CHECK negativos | origen `03` → 23514; perfil `MH_1_2` → 23514. La fila válida solo falla por FK (23503, emisor no sembrado), lo que confirma que los CHECK la aceptan. |
| Eliminación | Ambas bases eliminadas. `pg_database LIKE '%scratch%'` → 0. |

Incidencia de procedimiento, ya corregida: `prisma db execute` con dos sentencias `CREATE/DROP DATABASE` en una misma llamada corre en un bloque implícito. Solo se creó la primera base. El primer `migrate diff` salió con exit 1 por falta de la base sombra, no por deriva. Se repitió con una sentencia por llamada.

## Impacto en bases de datos y sincronización local/remota

- **Base tocada:** solo las dos bases desechables locales, creadas y eliminadas.
- **Base no tocada:** `TrustmeDB` (`DATABASE_URL` y `DIRECT_URL` de `.env`, ambas apuntan a `localhost/TrustmeDB`). Solo se leyó: **60** migraciones, ninguna `20261124*` (sin M1, M1b ni M2). Ninguna base remota (Control Plane, runtimes) fue consultada ni modificada. No se aplicaron seeds.
- **Alineado:** migraciones ↔ `schema.prisma`, sin deriva.
- **Pendiente:**
  - M1, M1b y M2 sin aplicar en TrustmeDB, en el Control Plane y en cada runtime.
  - Con el interruptor OFF el runtime no lee las columnas M1. Las tablas M2 solo se usan desde los servicios de Retorno, que exigen el perfil MH_2_0, es decir, el interruptor ON y M1 aplicada.
  - Aplicar M2 antes de activar MH 2.0 en una base es prerrequisito, como M1.
- **Acción del usuario (cuando se autorice):** aplicar en orden M1 → M1b → M2 por base, según `05-1-activation-runbook.md` (`npx prisma migrate deploy` con la URL de cada base) y verificar con `npx prisma migrate status`. En local: `npx prisma migrate deploy` sobre TrustmeDB. No hace falta un script nuevo de sincronización.
