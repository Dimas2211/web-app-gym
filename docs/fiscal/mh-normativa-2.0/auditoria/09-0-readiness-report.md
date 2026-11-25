# MH 2.0: Phase 9.0 readiness report for MH TEST certification

- **Branch:** `feat/mh-normativa-2.0`. **Base HEAD:** `b682b70` (uncommitted).
- **Date:** 2026-11-25. This version reflects the closing run that cleared the technical items left open.
- **Verdict:** **FASE_9_0_PASS**. See §9.
- **Restrictions met:**
  - nothing was transmitted to Hacienda and no flag was turned on;
  - Supabase, the remote Control Plane, remote runtimes and MariaDB were not touched;
  - certificates, signers and production correlatives were not changed;
  - no commit, push, merge or deploy.
- **Only persistent database modified:** TrustmeDB local, with exactly the 9 authorized migrations, after a verified backup (`09-0-local-backup-report.md`).

## 1. Preservation

- Branch and HEAD were recorded.
- `git status -uall` lists 552 entries: 63 modified and 489 untracked. This includes Phase 9.0 and COR-01.
- The classification is in `09-0-commit-manifest.md`.
- No credentials, certificates or `.env` files are among the changes.
- The TrustmeDB backup lives outside the repository.

## 2. Runtime wiring (planner → port → runner → builders → validator → signer → MH adapter → CP audit)

### Per-run override

`MhTestRunSpecProfileOverride` (`spec/mh-test-run-profile-override.ts`):

- `source: "MH_TEST_RUN"` with `runId`, `issuerConfigId` and `profile`.
- Fail-closed: it is rejected outside `TEST` and rejected if the issuer differs from the run's issuer.
- When the override is present, `resolveIssuerSpecProfileForGeneration` uses it and skips the global switch, which **stays OFF**. `assertDteSpecGenerationAllowed` still applies.

### Services that receive the override

The DTE services accept `specProfileOverride` explicitly:

- `generate-nc-json`
- `create-invalidation-event`
- `sign-dte-document`
- `prepareMhTestCreditNote`

`generateMhTestDocumentJson` receives the run's `profile`. Without an override, behaviour is the historical one (MH_1_2 while the switch is OFF).

### Runtime port

- `createRuntimeMhTestPortForRun(run, runProfile)` takes the profile from the persisted M4 row (`platform_dte_mh_test_run_profiles`) and the issuer snapshot from that row. Without a row it uses MH_1_2.
- Contingency is blocked for MH_2_0.

### Control Plane gate (`evaluateMh20RunGate`)

All of the following are required:

- `DTE_MH_TEST_RUNS_ENABLED`
- `DTE_MH_TEST_RUNS_M4_APPLIED`
- the new `DTE_MH_TEST_RUNS_MH20_ENABLED`
- the new allowlist `DTE_MH_TEST_RUNS_MH20_ORGANIZATIONS`
- environment `TEST`
- a coherent M4 row with an issuer snapshot
- the explicit confirmation text **"INICIAR PRUEBAS TEST MH 2.0"**

The engine evaluates the gate in two steps: once before reading M4 and again with the row. If either fails, the run goes to `NEEDS_REVIEW` / `PREFLIGHT_FAILED` with no preflight and no materialization.

### MH 2.0 runtime preflight (`runMh20RuntimePreflight`)

- M1/M1b persisted
- M2 present
- 2.0 schemas available
- 2.0 catalogs seeded
- establishment and point-of-sale codes valid under 2.0 (`^[MSBP]\d{3}$`, `^P\d{3}$`)
- issuer unchanged against the snapshot

The same preflight runs when the run is created (`validatePlanAgainstRuntime`).

### What stays the same

- The runtime actor is `userId: null`, so no Control Plane users are needed in client databases.
- Leases, fencing and idempotency are unchanged.
- An `UNCERTAIN` result does not retransmit automatically.

### Wiring in the entry points

- The tick route and `mh-test-run.action.ts` use the new factory.
- The UI changes the confirmation text and the disabled state according to the profile and `mh20Gate`.

### Verification

Mocks only: 37 wiring tests, 3 tests of the real port with mocked services, and 3 document-generation tests.

## 3. Scenarios (canonical builders)

| Scenario | Version | Status |
|---|---|---|
| FE | v2 | Ready (schema validates) |
| CCF | v4 | Ready |
| NC on CCF | v4 | Ready (chained to the CCF code and control number) |
| FSE | v2 | Ready |
| FEX services | v3 | Ready |
| Invalidation | v3 | Ready (`buildInvalidationEventJsonV3`) |
| Contingency v4 | | **Blocked** (`SCENARIO_BLOCKED`, INC-005) |
| Return / Special Operations | | **Blocked** (no authorization or confirmed endpoint) |
| FEX goods | | **Blocked** (see §5) |

No endpoints were invented.

## 4. Invalidation date (visual check: N2.0 pp. 28, 123–124; MF printed pp. 11–12)

### Event date (campo 9)

| Document type | Rule | Source |
|---|---|---|
| Not FE/FEXE/FSEE | Same date as the generation of the invalidated document | núm. 4 |
| FE/FEXE/FSEE | Any date from generation up to 3 months later | núm. 5 |

Rule 13.1.1 ("mismo día hasta el día posterior") does not contradict núm. 4: using the same date satisfies both. Núm. 2 (5 days) applies only to Return.

### Transmission deadline

- FE/FEXE/FSEE: **3 months from the stamp** (núm. 6).

### Bugs fixed

1. The transmission deadline was measured from generation. It is now measured from the stamp, using the El Salvador date of `stampedAt`.
2. Month-end overflow. The new helper `addMonthsClampedIso` follows the MF example: 30-11-2025 + 3 months → 28-02-2026.

### Tests and what stays open

- 30 boundary tests: last day, following day, time zone at 23:59:59 SV, leap year, PRODUCTION → `INV_DEADLINE_UNSET`, MH_1_2 unchanged.
- **INC-004 (CCF/NC/Return) is not resolved by inference.** It stays a provisional warning in TEST, and PRODUCTION stays `UNSET`.

## 5. FEX goods

- `SaleExportDetails` has `regime_code` and `fiscal_precinct_code`.
- The UI lists CAT-028 1.2 codes.
- There is **no column for CAT-033**.
- N2.0 marks `tipoItemExpor` 3 and 4 as not used.
- The 2.0 `regimen` field has length 13, while CAT-028 2.0 codes have the form `cccc.ccc`. Whether to send the value as `1000.000` or with a prefix is an open fiscal decision.

**No code was changed.** Goods stay blocked until there is valid data. Services are not affected.

Capturing CAT-033 needs a migration: either a column or `extra_export_data`. That needs separate authorization.

## 6. COR-01: implemented locally (option B), not applied to persistent databases

Detail: `decisiones/COR-01-reinicio-anual.md`.

| Item | Status |
|---|---|
| `fiscal_year` on `dte_outgoing_documents` | Set at reservation time. Read-only backfill based on verifiable evidence: `fecEmi` plus `created_at`, with the year agreeing in both SV and UTC. |
| Fiscal year | `fiscalYearInElSalvador` (UTC−6) in reservation, floor, status and alignment. `getFullYear` removed (COR-02). |
| Uniqueness | `(tenant_id, environment, fiscal_year, control_number)`, plus a partial unique index for ambiguous legacy rows (`fiscal_year` NULL) |
| Atomic reservation | `createMany({skipDuplicates})`, then a lock UPDATE, then the increment. Fixes R-COR-3: 25 concurrent reservations at the year change produce no P2002. |
| Floor | per year, plus NULL rows (fail-safe) |
| Administrative alignment | per year (`fiscal_year` parameter, default is the current SV year) |
| Pending documents from earlier years | keep their number. Generation in a different year → `DTE_FISCAL_YEAR_MISMATCH`, with no renumbering. |
| TEST/PROD | separated |
| COR-03 | not modified |
| Migration | `20261125000000_cor01_fiscal_year`, independent of earlier migrations. Tested only on scratch databases: fixture, the restored copy of TrustmeDB (72/72, 0 ambiguous) and a 70/70 database for the PG tests. |
| Tests | 19 unit, 9 PG, 8 SQL cases. All pass. |

> This decision changes the readiness proposal in one point. A document pending from the previous year is **not regenerated** with the new year's correlative; that would amount to renumbering. Generation is rejected and the document keeps its number. The operator then cancels it and issues a new one. This follows `COR-01-reinicio-anual.md` §4 ("they keep their `control_number` and are not regenerated").

## 7. Updated blockers

### Technical items closed in this run

| ID | Status |
|---|---|
| Unidentified migrations (5 of 9) | **Closed.** They were #61–#65; `migrate status` confirmed it. |
| M1/M1b/M2/M4 not applied locally | **Closed in TrustmeDB local** (69/69). Remote databases are still pending; see §8. |
| PG integration tests not run (26) | **Closed.** 26/26 with 69 migrations and 26/26 with 70. |
| COR-01 (implementation) | **Closed locally.** Application to databases is still pending. |
| R-COR-3 (`upsert` race) | **Closed** |

### Still open

| ID | Status |
|---|---|
| INC-003 | Resolved in the documents. Pending MH TEST certification. |
| Normative transition (MH 1.2 → 2.0 date per issuer) | Open, external (Hacienda) |
| Issuer recertification under 2.0 | Open, external |
| INC-004 (invalidation date for CCF/NC/Return) | Open, external |
| INC-005 (contingency v4) | Open, external |
| MT-GAP-001 | Open |
| INC-013 | Open |
| COR-03 (numbering modality) | Open. P0 for PRODUCTION 2.0. |
| Special Operations authorization | Open, external |
| MariaDB compatibility with 2.0 versions | Open. Delivery stays excluded in TEST. |
| CAT-028 2.0 format | Open. **Blocks FEX goods only.** It does not block FEX services or certification. |
| M-COR-01 applied to TrustmeDB, CP and runtimes | Pending authorization. Must be deployed before 2026-12-31 18:00 SV. |
| M1–M4 on CP and TEST runtime | Pending authorization |

## 8. Database impact and local/remote synchronization

| Question | Answer |
|---|---|
| `schema.prisma` changes | **Yes.** COR-01: `DteOutgoingDocument.fiscal_year Int?` and the unique key now includes `fiscal_year`. |
| New migration | **Yes:** `20261125000000_cor01_fiscal_year` |
| Databases touched | **TrustmeDB local:** `migrate deploy` with the 9 pending migrations (60 → 69). `migrate status` = up to date. `generate` OK. No drift. Data intact. |
| Scratch databases | Created on localhost for the restore, the rehearsals and the PG tests. All dropped. |
| Databases not touched | Supabase, remote CP, remote runtimes, MariaDB |
| `DATABASE_URL` / `DIRECT_URL` | both point to `localhost:5432/TrustmeDB` (`.env`) |
| Pending in TrustmeDB | M-COR-01 (#70), not applied by instruction |
| Can local and remote drift | Yes. Remote databases (65/65 according to notes) are missing #66–#70. |
| Local runtime | **The generated Prisma client already includes `fiscal_year`.** Until M-COR-01 is applied to TrustmeDB, the local app fails (P2022) when it reads `dte_outgoing_documents`. |
| 2.0 seeds | not applied to TrustmeDB |

Next steps for the user, with authorization, in Phase 9.1 or later:

```bash
# Local: a new pg_dump of TrustmeDB (same recipe as 09-0-local-backup-report.md), then
npx prisma migrate deploy && npx prisma migrate status   # applies M-COR-01 only
# Remote CP / TEST runtime: documented procedure + run-runtime-migrations-runner.ts
# Before M-COR-01 on each database: the ambiguous-row query in COR-01 §3
```

## 9. Closing verdict: FASE_9_0_PASS

Every item in the Phase 9.0 closing scope is done and verified:

1. **Backup.** Verified (SHA-256, TOC, restore with identical row counts and schema).
2. **TrustmeDB local.** 69/69 with no drift and data intact.
3. **PG integration tests.** The 26 that were skipped now pass on scratch databases.
4. **COR-01.** Implemented locally with its own migration, tested on scratch databases and a copy of real data, with no ambiguous rows.
5. **Consolidated verification.**
   - 0 failures in the fiscal and wide suites (apart from the pre-existing CAT-022 failure);
   - goldens, internal certification, MariaDB exclusion and onboarding 2.0 green;
   - tsc 0 errors, ESLint 0 errors, build OK.

**What PASS does not mean:**

- MH has not certified anything;
- M-COR-01 has not been applied to any persistent database;
- M1–M4 are not in the remote databases.

The external blockers (§7) stay open, as instructed.

**Stopped before Phase 9.1.**
