# MH 2.0 — Fase 9.2B: sincronización de TrustmeDB local

- **Fecha:** 2026-11-25. **Rama:** `feat/mh-normativa-2.0` @ `0746c94`.
- **Única escritura persistente en bases de esta fase.** Ninguna base remota fue modificada.

## 1. Destino verificado

| Control | Resultado |
|---|---|
| `DATABASE_URL` (`.env`) | `localhost:5432/TrustmeDB` |
| `DIRECT_URL` (`.env`) | `localhost:5432/TrustmeDB` |
| `.env.local` | Solo `VERCEL_OIDC_TOKEN`; no redefine URLs de base |
| `prisma migrate status` antes | 72 en el repo; pendientes **exactamente** `20261119000000_gym_customer_links` y `20261125010000_mh20_mh_test_run_profile_org_fk` |

## 2. Precondiciones (lectura, `BEGIN READ ONLY`)

| Control | Resultado |
|---|---|
| `clients (id, tenant_id)` único, destino de la FK de `gym_customer_links` | Presente (`clients_id_tenant_id_key`) |
| Duplicados `customers (id, tenant_id)` / `tenant_id` NULL | 0 / 0 |
| Perfiles M4 incoherentes con su corrida (M5) | 0 (0 perfiles, 0 corridas) |
| Migraciones fallidas | 0 |
| Constraints `NOT VALID` | 2 preexistentes y ajenos: `trainers_branch_id_tenant_id_fkey`, `scheduled_classes_booked_count_capacity_chk`. No se tocaron |

## 3. Respaldo y restauración

| Control | Resultado |
|---|---|
| Respaldo | `C:\Users\rodri\Documents\zolvi-backups\trustmedb-pre-fase9-2b-20261125\TrustmeDB-20261125-pre-fase9-2b.dump` (fuera del repo), 903.871 bytes, SHA-256 `c0f296d69199d021308c7d9e4ae3137076054c69a5aa5f873921e4b0fd5198c1`; `pg_dump -Fc` con `default_transaction_read_only=on` |
| Restauración en `zolvi_scratch_restore_9_2b` | exit 0; huella **idéntica** a la base viva |

## 4. Ensayo sobre la copia desechable

`migrate deploy` 2/2, `migrate status` up to date, `migrate diff` (base → schema) exit 0. Diferencias de huella: solo `_prisma_migrations` 70 → 72 y la tabla nueva `gym_customer_links` (102 → 103 tablas). Checksums: `f24e6a20…` y `cf375e12…`, iguales al inventario 9.2A. Copia eliminada.

## 5. Aplicación real

`npx prisma migrate deploy` → 2 migraciones aplicadas. `migrate status`: *Database schema is up to date*. `npx prisma generate` OK (v6.19.2).

| Verificación | Resultado |
|---|---|
| Migraciones | **72/72**, 0 fallidas |
| Drift (`migrate diff --from-schema-datasource --to-schema-datamodel --exit-code`) | exit 0, sin drift |
| Checksums vs repo | 70 iguales al working tree + 2 solo por fin de línea (los mismos de 9.2A); 0 divergentes, 0 desconocidas |
| Documentos fiscales | 72; huella (número, código, JSON, firma, sello, estado, perfil, `fiscal_year`) **idéntica** antes/después (`51396d09…`) |
| `fiscal_year` | 72/72 = 2026, 0 NULL |
| `dte_correlatives` | 7 filas, hash idéntico (`cedefe63…`) |
| `customers` / `clients` / `client_memberships` | 11 / 1 / 0, hashes idénticos |
| Constraints nuevos | 2 FK de `gym_customer_links` + FK compuesta M5 presentes; RLS activo en `gym_customer_links` |
| Smoke de runtime (Prisma, solo lectura) | `gymCustomerLink`, `dteOutgoingDocument`, `customer`, `client`, `dteIssuerConfig`, `dteCorrelative`, corridas y perfiles M4: sin P2021/P2022 |

**No se aplicaron seeds 2.0.**

## Impacto en bases de datos y sincronización local/remota

- **Tocada:** TrustmeDB local (70 → 72). **No tocadas:** Control Plane `nygdq…` y runtime `vkoyw…` (siguen 66/72; solo lecturas `READ ONLY`).
- **Alineado:** TrustmeDB = repo (72/72, sin drift).
- **Pendiente:** 6 migraciones en cada remoto, según `09-2b-remote-migration-runbook.md`, con autorización propia.
- **Rollback local:** `pg_restore --clean` del respaldo §3.
