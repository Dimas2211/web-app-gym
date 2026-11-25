# MH 2.0: Phase 9.0 commit manifest (proposal, NOT EXECUTED)

- **Branch:** `feat/mh-normativa-2.0`. **HEAD:** `b682b70`.
- `git status --porcelain -uall`: **552 entries**, 63 modified and 489 untracked. This includes the Phase 9.0 deliverables and COR-01. Updated 2026-11-25 after the closing run.
- No `git add`, commit, push, merge, reset or clean was run.
- The TrustmeDB backup (`C:\Users\rodri\Documents\zolvi-backups\trustmedb-pre-fase9-0-20261125\`) is outside the repo and is **not** committed.

## Secrets scan

- 224 candidate files were checked for DSNs, tokens, private keys and passwords.
- No `.env`, `.pem`, `.p12`, `.key` or `.crt` files are among the changes.
- Only finding: a dummy DSN `postgresql://audit:audit@127.0.0.1:1/none` in `docs/audits/Auditoria_Onboarding_DTE_Shared_Dedicated.md`. It is safe, but you can redact it if you prefer.

## Commit A: schema and MH 2.0 migrations (Phases 6–8)

- `prisma/schema.prisma`
- `prisma/migrations/20261124000000_mh20_spec_profile/` (M1)
- `prisma/migrations/20261124010000_mh20_spec_profile_audit/` (M1b)
- `prisma/migrations/20261124020000_mh20_return_events/` (M2)
- `prisma/migrations/20261124030000_mh20_mh_test_run_profiles/` (M4)

## Commit B: 2.0 catalogs, seeds and scripts

- `prisma/seeds/seed.dte-catalog-items.ts`
- `prisma/seeds/seed.dte-catalog-items-mh20.ts`
- `prisma/seeds/data/dte-catalog-items-mh20.data(.test).ts`
- `prisma/scripts/mh20-territory-dry-run(.test).ts`
- `src/modules/platform/lib/seed-runners/dte-catalog-items-runner.ts`
- `src/modules/platform/lib/database-preflight.ts`

## Commit C: DTE engine for MH 2.0 profiles and builders

`src/modules/commerce/dte/**`, 126 entries:

- `spec/` (including the new `mh-test-run-profile-override.ts` and the invalidation deadlines)
- `config/`
- `services/` (generators v2/v3/v4, validator, signer, transmission, invalidation, contingency)
- `queries/`
- `utils/`
- `certification/`
- `dev/`
- golden and fixture files
- the 2.0 JSON schemas inside the module

## Commit D: MH TEST runs with the run's profile (Phase 9.0)

- `src/modules/commerce/dte/mh-test-runs/**` (service, scenarios, `mh-test-documents.mh20.test.ts`)
- `src/modules/platform/dte-onboarding/mh-test-runs/**` (engine, flags, repository, runtime port, `mh20-*-wiring.test.ts`)
- `src/modules/platform/actions/mh-test-run.action.ts`
- `src/modules/platform/components/platform-mh-test-runs-section.tsx`
- `src/modules/platform/components/platform-mh-test-profile-panel.tsx`
- `src/app/api/platform/dte-mh-test-runs/tick/route(.test).ts`

## Commit E: commerce consumers adjusted

- `src/app/api/dte/catalogs/route.ts`
- `src/app/api/dte/outgoing/[id]/json/route.ts`
- `src/app/api/dte/outgoing/[id]/representation/route.ts`
- `src/modules/commerce/purchases/services/purchase-dte-import.service.ts`
- `src/modules/commerce/purchases/utils/inspect-received-dte-spec.ts`
- `src/modules/commerce/sales/export/services/export-sale.service.ts`
- `src/modules/commerce/customers/components/customer-detail-tabs.tsx`
- `src/modules/commerce/suppliers/components/supplier-detail-tabs.tsx`
- `src/modules/platform/actions/get-support-sale-form-data.action.ts`

## Commit G: COR-01 annual restart (closing run of Phase 9.0)

Commit it **after** A–E. It depends on M1–M4 being in the history and touches the same generators.

- `prisma/schema.prisma`: hunk `fiscal_year` + `@@unique([tenant_id, environment, fiscal_year, control_number])`. If it is committed together with A, it becomes part of A.
- `prisma/migrations/20261125000000_cor01_fiscal_year/` (**M-COR-01**, not applied)
- `prisma/scripts/cor01/cor01-backfill-fixture.scratch.sql`
- `prisma/scripts/cor01/cor01-backfill-assert.scratch.sql`
- `src/modules/commerce/dte/utils/dte-fiscal-year.ts`
- `src/modules/commerce/dte/services/dte-correlative.service.ts`
- `src/modules/commerce/dte/services/dte-correlative.cor01-characterization.test.ts` (rewritten: 19 tests)
- `src/modules/commerce/dte/services/dte-correlative.cor01.pg.test.ts` (new: 9 PG tests)
- Fiscal-year guard in the generators:
  - `generate-fe-json.service.ts`
  - `generate-ccfe-json.service.ts`
  - `generate-nc-json.service.ts`
  - `generate-fex-json.service.ts`
  - `generate-fse-json.service.ts`
  - `mh-test-runs/mh-test-documents.service.ts`
- `fiscal_year` written at reservation:
  - `dte-outgoing.service.ts`
  - `create-credit-note-dte.service.ts`
  - `commerce/sales/export/services/export-sale.service.ts`
  - `platform/lib/support-session/dte/support-dte-create-pending-runner.ts`
  - `dte/dev/verify-fex11-preview-local.ts`
- Mocks updated from `upsert` to `createMany`:
  - `dte-outgoing.service.create-pending-dte-for-sale.runtime-write.test.ts`
  - `dte-outgoing.service.create-pending-dte-for-purchase.runtime-write.test.ts`
  - `mh20-phase6-services.test.ts`
- `docs/fiscal/mh-normativa-2.0/decisiones/COR-01-reinicio-anual.md`

Some of these files already carry diffs from Phases 6–9.0, such as the MH 2.0 profile in the generators. If you want strictly separate commits, use `git add -p`. Otherwise merge G into C.

**Deploy requirement:** the code from G reads and writes `fiscal_year`. Every database must have M-COR-01 **before** the deploy.

## Commit F: active fiscal documentation

- `docs/fiscal/mh-normativa-2.0/README.md`
- `docs/fiscal/mh-normativa-2.0/indice-schemas.json`
- `docs/fiscal/mh-normativa-2.0/indice-catalogos.json`
- `docs/fiscal/mh-normativa-2.0/decisiones/`
- `docs/fiscal/mh-normativa-2.0/markdown/`
- `docs/fiscal/mh-normativa-2.0/auditoria/`:
  - reports for Phases 06 through 09-0
  - `consultas-mh-verificadas.md`
  - `_fase0_*.json`
  - `ocr-recovery-report.json`
  - `scripts/`
- `docs/fiscal/mh-normativa-1.2/README.md`
- `docs/fiscal/mh-normativa-1.2/markdown/`
- `docs/audits/Auditoria_Onboarding_DTE_Shared_Dedicated.md`

## Leave out, or decide separately (heavy or duplicated)

| Path | Size | Recommendation |
|---|---|---|
| `docs/fiscal/mh-normativa-1.2/ocr/raw/` | 112 files, about 463K | Exclude (raw OCR) |
| `docs/fiscal/mh-normativa-2.0/auditoria/ocr-recovery/raw/` | 102 files | Exclude (raw OCR) |
| `docs/fiscal/mh-normativa-2.0/auditoria/ocr-recovery/curated/` | 53 files | Optional. Keep it only if it serves as evidence. |
| `docs/dte-actualizacion-dic26/` | about 22M | Exclude: **duplicate** of `originales/` |
| `docs/fiscal/mh-normativa-2.0/originales/` (official PDF/XLSX) | about 22M | Decide: Git LFS, or outside the repo with a reference |
| `docs/fiscal/mh-normativa-1.2/*.pdf` | PDF | Same as above |

## Suggested commit messages

1. `feat(dte): MH 2.0 schema + migrations M1/M1b/M2/M4 (unapplied)`
2. `feat(dte): MH 2.0 catalogs seed + territory dry-run`
3. `feat(dte): MH 2.0 builders, validator and spec profile (flag OFF)`
4. `feat(dte): MH TEST runs with persisted MH 2.0 profile and CP gate`
5. `fix(dte): consumers adjusted for MH 2.0 versions`
6. `docs(fiscal): MH 2.0 audit through Phase 9.0`
7. `feat(dte): COR-01 annual control-number restart by SV fiscal year (M-COR-01, unapplied)`
