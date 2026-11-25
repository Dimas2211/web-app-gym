# MH 2.0: Phase 9.0 local backup report (TrustmeDB)

- **Date:** 2026-11-25.
- **Target:** `localhost:5432` / `TrustmeDB` (PostgreSQL 18.3), schema `public`. This is the only persistent database touched in Phase 9.0.
- **Verdict:** backup **VERIFIED**, restore test **PASS**.

## 1. Connection check (no credentials exposed)

| Variable | File | Points to |
|---|---|---|
| `DATABASE_URL` | `.env` | `localhost:5432/TrustmeDB` |
| `DIRECT_URL` | `.env` | `localhost:5432/TrustmeDB` |
| `DATABASE_URL` / `DIRECT_URL` | `.env.local` | not defined |

Prisma CLI loads `.env` through `prisma.config.ts` (`dotenv/config`). The shell had neither variable set. The value was masked when printed.

## 2. Pre-migration integrity checks (read-only)

| Check | Result |
|---|---|
| Applied / failed / rolled back in `_prisma_migrations` | 60 / 0 / 0 |
| `scheduled_classes` with `booked_count > capacity` (guard in `20261020000000`) | 0 |
| `gym_reject_mutation()` present (needed by `20261021000000`) | yes |
| Referenced types (`DteEnvironment`, `DteInvalidationStatus`, `ExecutionStatus`, `DteOutgoingStatus`) | present |
| Collisions with new types, tables or columns | none |
| Duplicates against the new unique indexes (`client_weekly_plans`, `client_weekly_plan_days`) | 0 / 0 |
| Required parent tables | present (10/10) |

All nine migrations are additive. None of them contains `DROP`, `RENAME`, `ALTER COLUMN` or a backfill. The only conditional guard is the capacity guard, and the data satisfies it.

## 3. Backup

| Item | Value |
|---|---|
| Folder | `C:\Users\rodri\Documents\zolvi-backups\trustmedb-pre-fase9-0-20261125\` |
| Dump | `TrustmeDB-20261125-pre-fase9-0.dump` (`pg_dump 18.3 -Fc --no-owner --no-acl`) |
| Size | 840,843 bytes |
| SHA-256 | `aa26ae5c55cde743bcf72fadb907b8c2f69bc2528578c5baf9b1dca94c6b2850` |
| TOC (`pg_restore -l`) | 858 entries: 180 TABLE, 313 INDEX, 173 FK, 90 CONSTRAINT, 62 TYPE, 23 TRIGGER, 17 FUNCTION |
| Snapshots | `sql/migrations-before.txt` (60), `sql/rowcounts-before.txt` (90 tables, exact `count(*)`), `sql/schema-before.sql`, `sql/toc.txt`, `MANIFEST.txt` |

The folder is outside the repository and is not committed.

## 4. Restore test

The dump was restored into a scratch database, `zolvi_restore_trustme_9_0_20261125`, on the same local server.

| Check | Result |
|---|---|
| `pg_restore` exit code / errors | 0 / 0 |
| Row counts | identical in all 90 tables |
| Schema (`pg_dump -s`, normalized for line endings) | identical, apart from the random `\restrict` tokens of pg_dump 18 and parenthesis grouping in 2 CHECKs (`class_series_shape_chk`, `gym_booking_operations_shape_chk`). Both CHECKs are re-parsed and equivalent. |
| `_prisma_migrations` | 60 |

### Rehearsals on the restored copy

1. `prisma migrate deploy` with the 9 pending migrations: 9/9 applied. `migrate diff --from-url <copy> --to-schema-datamodel` was empty.
2. COR-01: the new migration `20261125000000_cor01_fiscal_year` was then applied to the same copy. Results:
   - 72 of 72 documents got a `fiscal_year` (2026); 0 were ambiguous.
   - There was no drift.
   - The md5 fingerprint of `control_number`, `json_document`, `signed_jws`, `reception_stamp` and `dte_status` is identical to TrustmeDB.

The scratch database was dropped at the end of the phase.

## 5. Recovery recipe

```bash
createdb <new_db>
pg_restore --no-owner --no-acl -d <new_db> "C:\Users\rodri\Documents\zolvi-backups\trustmedb-pre-fase9-0-20261125\TrustmeDB-20261125-pre-fase9-0.dump"
```

To roll TrustmeDB back:

1. Stop the local app.
2. `dropdb TrustmeDB`.
3. `createdb TrustmeDB`.
4. Run `pg_restore` as above.

This was **not** needed.
