# MH 2.0: Phase 9.0 migration inventory

- **Date:** 2026-11-25 (updated after the closing run).
- **Source:** `npx prisma migrate status`, run by the user and repeated in this phase, plus `_prisma_migrations` on TrustmeDB. No remote database was queried.

## Repository: 70 migrations

| # | Migration | Domain | TrustmeDB (local) |
|---|---|---|---|
| 1–60 | up to `20261019000000_gym_bookings_foundation` | various | applied before 9.0 |
| 61 | `20261020000000_gym_bookings_capacity_check` | gym | **applied 2026-11-25** |
| 62 | `20261021000000_gym_training_executions` | gym | **applied 2026-11-25** |
| 63 | `20261110000000_dte_fiscal_onboarding_automation` | commerce/dte + platform | **applied 2026-11-25** |
| 64 | `20261112030000_cancel_pending_sale_dte` | commerce/dte | **applied 2026-11-25** |
| 65 | `20261116000000_dte_mh_test_runs` | platform (CP) | **applied 2026-11-25** |
| 66 | `20261124000000_mh20_spec_profile` (M1) | commerce/dte (runtime) | **applied 2026-11-25** |
| 67 | `20261124010000_mh20_spec_profile_audit` (M1b) | commerce/dte (runtime) | **applied 2026-11-25** |
| 68 | `20261124020000_mh20_return_events` (M2) | commerce/dte (runtime) | **applied 2026-11-25** |
| 69 | `20261124030000_mh20_mh_test_run_profiles` (M4) | platform (CP) | **applied 2026-11-25** |
| 70 | `20261125000000_cor01_fiscal_year` (**M-COR-01**, new) | commerce/dte (runtime) | **not applied**, by instruction |

The earlier hypothesis that the 5 unknown migrations were #61–#65 is now **confirmed**.

## The 9 migrations applied to TrustmeDB

- **Method:** read-only pre-checks, then a verified backup (`09-0-local-backup-report.md`), then a rehearsal on the restored copy, then `npx prisma migrate deploy`, `npx prisma migrate status` and `npx prisma generate`.
- **Result:** `migrate status` reported "Database schema is up to date!" with 69/69 applied.
- **Structural check:** `prisma migrate diff --from-url TrustmeDB --to-schema-datamodel` was empty against the schema at 69 migrations, before the COR-01 edit to `schema.prisma`.
- **Data:** row counts were identical in the 90 existing tables, apart from `_prisma_migrations` (60 → 69). There are 12 new tables, all empty. No backfill was done: `mh_spec_profile` stays NULL and `purpose` = `OPERATIONAL` (72/72).
- **Not run:** `migrate dev`, `migrate reset` and `db push`. No 2.0 seed was run on TrustmeDB.

## M-COR-01 (`20261125000000_cor01_fiscal_year`)

| Item | Value |
|---|---|
| Type | additive, plus a read-only backfill of the new column only, plus a replacement of the unique key |
| Column | `dte_outgoing_documents.fiscal_year INT NULL` with CHECK 2000–9999 |
| Backfill | from `identificacion.fecEmi` and `created_at`, only when both agree in SV and UTC time; ambiguous rows stay NULL |
| Unique | `(tenant_id, environment, control_number)` → `(tenant_id, environment, fiscal_year, control_number)`, plus a partial unique on `(tenant_id, environment, control_number) WHERE fiscal_year IS NULL` |
| Tested on | (a) a scratch database with 8 edge-case fixtures; (b) the restored copy of TrustmeDB (72/72 assigned, 0 ambiguous, no drift); (c) a scratch database migrated 70/70 for the PG tests |
| TrustmeDB | **not applied** |
| CP / runtimes | **not applied** |

> **Local runtime warning:** `schema.prisma` and the generated client already include `fiscal_year`, but TrustmeDB does not have the column yet. Until M-COR-01 is applied, the local app fails with P2022 on every query that reads `dte_outgoing_documents` without an explicit `select`. Either apply M-COR-01 with authorization, or do not run the local app against TrustmeDB.

## Runtime vs Control Plane

- There is one `schema.prisma` and one `migrations/` directory, and every target receives all 70 migrations. `migrate deploy` cannot apply migrations selectively.
- **Remote** state comes from memory notes; it was not verified in this phase. CP and runtime `vkoyw` were at 65/65 on 2026-11-16, so they are missing #66–#70.
- Remote migration needs separate authorization. Use the documented procedure for the CP and `prisma/scripts/run-runtime-migrations-runner.ts` for runtimes.

## Database impact and local/remote synchronization

| Item | Status |
|---|---|
| Database touched | **TrustmeDB local only**: +9 migrations (60 → 69) |
| Databases not touched | Supabase, the remote CP, remote runtimes, MariaDB |
| Scratch databases | created on localhost for rehearsals and tests (`zolvi_restore_trustme_*`, `zolvi_scratch_*`), all dropped at the end |
| Aligned | TrustmeDB = repository up to #69 |
| Pending, local | M-COR-01 (#70) on TrustmeDB, after review |
| Pending, remote | #66–#70 on the CP and TEST runtime, with separate authorization |

User commands, in the next phase and only with authorization:

```bash
# 1) Local, after reviewing COR-01: a new backup, then
npx prisma migrate deploy && npx prisma migrate status
# 2) Remote: the documented CP procedure; runtimes through
#    prisma/scripts/run-runtime-migrations-runner.ts
```
