# MH 2.0: Phase 9.0 test results

- **Date:** 2026-11-25. This version reflects the closing run.
- **Execution:** local only. There was no network, no MH transmission, no signer, no MariaDB and no remote database.
- **PostgreSQL tests:** run only on scratch databases on localhost whose names contain `_scratch_`. They were never run on TrustmeDB.

## Summary

| Suite | Result |
|---|---|
| **PG: the 26 fiscal tests that were skipped**, on a scratch database with 69 migrations | **26/26 PASS** |
| **PG: the same 26**, repeated on a scratch database with 70 migrations (with M-COR-01) | **26/26 PASS** |
| **PG: COR-01** (`dte-correlative.cor01.pg`), with 70 migrations | **9/9 PASS** |
| **SQL: M-COR-01 backfill** (fixture + migration + assertions, `prisma/scripts/cor01/`) | **PASS** (8 cases) |
| **M-COR-01 on the restored copy of TrustmeDB** | 72/72 assigned, 0 ambiguous, no drift, fingerprint identical |
| COR-01 unit tests (`dte-correlative.cor01-characterization`) | **19/19** |
| Fiscal scope: `commerce/dte`, `platform/dte-onboarding`, `platform/actions`, `app/api/dte`, `app/api/platform/dte-mh-test-runs` | 1507 tests: **1472 pass, 0 fail**, 35 skipped. The 35 skipped are the PG tests above, which only run with a scratch URL and all pass there. |
| Wide scope: `src/modules/commerce`, `src/modules/platform`, `src/app/api` | 250 files: 244 pass, 5 skipped, 1 fails (CAT-022, pre-existing). 2626 tests: **2575 pass, 0 fail**, 51 skipped. |
| MH 1.2 golden (`__golden__/mh12-golden`) | 8/8 |
| Internal certification (`dte-internal-certification`) | 77/77 |
| MariaDB exclusion (`mariadb-certification-exclusion`) | 8/8 |
| Onboarding 2.0 (`mh20-onboarding`, `mh20-runner-wiring`, `mh20-runtime-port-wiring`, `mh-test-run.engine`, `mh-test-run.planner`) | 24 + 37 + 3 + 19 + 7 = **90/90** |
| MH 2.0 goldens (`mh20-fixtures`, `phase6`, `phase61`, `phase7`, `fex-v3`, `fiscal-observations`) | 18 + 28 + 17 + 20 + 8 + 11 = 102/102 |
| `npx tsc --noEmit` | **0 errors** |
| ESLint on the 18 files touched in this run | **0 errors**, 22 warnings (`no-explicit-any` in tests) |
| `npm run build` (`prisma generate && next build`) | **OK** (exit 0) |

**Total in this run:** 2575 + 35 PG + 8 SQL cases passed, 0 failed. Omitted: 51 by design. These are the 35 fiscal PG tests, which pass in their own run, and 16 non-fiscal PG suites from gym and onboarding, outside the scope of this phase. The one pre-existing suite failure, CAT-022, was not touched.

## B. The 26 PostgreSQL tests

The fixture is a template database built with `prisma migrate deploy`, cloned once per suite so that files running in parallel do not interfere. For `mh-test-runs.pg`, the issuer `ISS-T` was added (tenant `t1`, location `L1`, `M001`/`P001`).

The process also set `DATABASE_URL`/`DIRECT_URL` to the scratch database. Any accidental use of the global Prisma client could therefore never reach TrustmeDB.

| Suite | Tests | What it verifies |
|---|---|---|
| `dte-catalog-version.integration` | 9 | Versioned catalogs: 2.0 rows coexist with 1.2. A later 1.2 seed does not delete 2.0 rows. The 2.0 seed is idempotent and has no effect on 1.2. The 1.2 onboarding still sees the 2.0 rows as missing (**normative isolation**). |
| `dte-spec-profile-admin.integration` | 11 | Per-issuer profile behind the switch. PRODUCTION blocked. Immutable audit log. **Isolation by organization and tenant** (another tenant's issuer is rejected). Cabañas/territory checks. |
| `mh-test-runs.pg` | 6 | Concurrent materialization of the same run gives a single set of documents (**idempotency**). A concurrent block and operational reservations give no duplicates. Concurrent blocks with no existing row give no P2002. The first correlative already used is rejected. One active run per organization (partial index). 10 workers compete for the lease: exactly one wins, with a monotonic epoch and fencing (**concurrency**). |

### Coverage of the checklist

| Item | Where it is verified |
|---|---|
| Normative isolation | `dte-catalog-version` (PG). `mh20-runner-wiring` (MH_1_2 default, override only in TEST). |
| Isolation by organization | `dte-spec-profile-admin` (PG). `mh20-runner-wiring` (between organizations and issuers). |
| Concurrency | `mh-test-runs.pg` (lease, block). `dte-correlative.cor01.pg` (25 simultaneous reservations at the year change). |
| Idempotency | `mh-test-runs.pg` (re-materialization recovered by key). `mh20-runner-wiring` (repeated tick). |
| Chained runs | `mh20-onboarding` / `mh20-runner-wiring`, with mocks: segments up to 200 items, `chain_index`/`chain_total`, NC chained to the CCF. On PG, the M4 table with `chain_chk` and the unique `(org, chain_id, chain_index)` is created by the migration (applied without errors), but **no PG test exercises it**. That is a gap. |
| Versioned catalogs | `dte-catalog-version` (PG) |
| Idempotent seeds | `dte-catalog-version` (PG): `seed 2.0 idempotente` |
| MariaDB exclusion | `mariadb-certification-exclusion` 8/8. It is a mock; nothing is inserted into MariaDB. |

## C. COR-01 tests

### Unit tests (19), `services/dte-correlative.cor01-characterization.test.ts`

This test previously characterized the old behaviour. It was updated on purpose, as its own header asked.

| Case | Result |
|---|---|
| Midnight in El Salvador: 23:59:59.999 SV → 2026; 00:00 SV → 2027. 18:30 SV on 31/12 → 2026, even with the process in UTC. | ✓ |
| Independent of the process time zone (computed from the UTC instant) | ✓ |
| 2026 → 2027 transition: the first DTE of 2027 gets sequence 1 | ✓ |
| 31/12 at 23:59 SV continues the 2026 sequence | ✓ |
| Row created with `createMany(skipDuplicates)` and locked by UPDATE, never `upsert` (R-COR-3) | ✓ |
| Legacy documents with NULL `fiscal_year` count towards the floor of every year (fail-safe) | ✓ |
| Floor filtered by year (`OR fiscal_year / NULL`) | ✓ |
| Block in 2027 starting at 1; in 2026 it still rejects used numbers | ✓ |
| Status and administrative alignment per year. The baseline cannot go below what the same year has used. Invalid year rejected. | ✓ |
| Generation guard: same year OK. A document pending from 2026 and generated in 2027 → `DTE_FISCAL_YEAR_MISMATCH`, with no renumbering. A legacy document compares the SV year of `created_at`. | ✓ |

### PostgreSQL (9), `services/dte-correlative.cor01.pg.test.ts`

| Case | Result |
|---|---|
| 2026 → 2027 transition and annual restart (the same `control_number` exists in both years; `dte_correlatives` rows 2026 = 2 and 2027 = 1) | ✓ |
| Uniqueness: the same year with the same number → P2002 | ✓ |
| **25 simultaneous reservations at the year change with no row yet** → 1..25, contiguous, no duplicates, no P2002 | ✓ |
| MH TEST block plus 10 concurrent operational reservations → no duplicates | ✓ |
| TEST/PRODUCTION separated (independent sequences) | ✓ |
| Pending from the previous year: keeps its `control_number` and `fiscal_year`; generation in 2027 is rejected; 2027 starts at 1 | ✓ |
| Ambiguous legacy row (NULL): the partial index blocks a duplicate, and its number counts towards the floor | ✓ |
| Alignment by year: a 2027 baseline of 300 → the next number is 301; 2026 is not affected | ✓ |
| Historical compatibility: the 2026 status keeps its real floor after issuing in 2027 | ✓ |

### Migration backfill (SQL), `prisma/scripts/cor01/`

| Fixture | Expected | Result |
|---|---|---|
| A: `fecEmi` 2026, created 2026 | 2026 | ✓ |
| B: pending, no JSON, created 2026 | 2026 | ✓ |
| C: created 31/12 21:00 SV (= 01/01 UTC) | NULL (ambiguous) | ✓ |
| D: `fecEmi` 2027, reserved 2026 | NULL (ambiguous) | ✓ |
| E: malformed `fecEmi` | NULL (ambiguous) | ✓ |
| F: no `control_number` | NULL | ✓ |
| G: same number as A, in PRODUCTION | 2026 | ✓ |
| H: `fecEmi` 2025 | 2025 | ✓ |

In all eight cases, the md5 of number, JSON, status and `created_at` is unchanged.

The indexes behave as intended:

- the old unique was removed;
- the per-year unique exists;
- the partial index blocks a legacy duplicate;
- a 2027 row can repeat a 2026 number, but a second 2026 row cannot;
- the range CHECK is active.

## Regressions found and fixed in this run

Three test mocks still modelled `dteCorrelative.upsert` and `findUniqueOrThrow`. Reservation now uses `createMany` and a lock UPDATE. The mocks were updated; runtime code did not change in this respect.

- `dte-outgoing.service.create-pending-dte-for-sale.runtime-write.test.ts`
- `dte-outgoing.service.create-pending-dte-for-purchase.runtime-write.test.ts`
- `mh20-phase6-services.test.ts`. This includes `expect(createMany).not.toHaveBeenCalled()`: the rejection still happens before the correlative.

## Pre-existing failure (not touched)

`src/modules/commerce/shared/cat-022-identification-types.test.ts` fails with `Cannot find module '…/node_modules/next/server'`. This is Vitest module resolution. That directory has no diff, and the Vitest configuration was not modified.
