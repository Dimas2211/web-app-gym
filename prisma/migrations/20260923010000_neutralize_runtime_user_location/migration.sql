-- SHARED-PILOT-3B: neutralize Branch/User tenant identity.
-- Branch.tenant_id / User.tenant_id become the authoritative, required
-- ownership columns. Branch.gym_id / User.gym_id become optional —
-- Gym is now purely an optional vertical extension, never mandatory
-- for a Commerce-only RuntimeTenant.
--
-- Safe because 3A (20260923000000_add_runtime_tenant) already backfilled
-- branches.tenant_id and users.tenant_id from gym_id for every existing
-- row. This migration does not delete or recreate any row, and does not
-- change any existing id/uuid.

-- Backfill safety net (idempotent no-op if 3A already ran, but keeps this
-- migration self-sufficient if ever replayed against a DB where 3A's
-- backfill somehow didn't reach every row).
UPDATE "branches" SET "tenant_id" = "gym_id" WHERE "tenant_id" IS NULL;
UPDATE "users" SET "tenant_id" = "gym_id" WHERE "tenant_id" IS NULL;

-- AlterTable: branches.tenant_id becomes required.
ALTER TABLE "branches" ALTER COLUMN "tenant_id" SET NOT NULL;

-- AlterTable: branches.gym_id becomes optional.
ALTER TABLE "branches" ALTER COLUMN "gym_id" DROP NOT NULL;

-- AlterTable: users.tenant_id becomes required.
ALTER TABLE "users" ALTER COLUMN "tenant_id" SET NOT NULL;

-- AlterTable: users.gym_id becomes optional.
ALTER TABLE "users" ALTER COLUMN "gym_id" DROP NOT NULL;

-- Drop the FK that required every Branch to reference a Gym row, and
-- re-add it as optional (ON DELETE SET NULL instead of the implicit
-- RESTRICT of a required relation) plus the new FK to RuntimeTenant.
ALTER TABLE "branches" DROP CONSTRAINT "branches_gym_id_fkey";
ALTER TABLE "branches" ADD CONSTRAINT "branches_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "runtime_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same for users.gym_id -> gyms + new users.tenant_id -> runtime_tenants.
ALTER TABLE "users" DROP CONSTRAINT "users_gym_id_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "runtime_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Operational code uniqueness moves from gym_id to tenant_id — the
-- authoritative ownership column. Tenant A and Tenant B may each use
-- code "A100"; the same tenant may not reuse it.
DROP INDEX "users_gym_id_operational_code_key";
CREATE UNIQUE INDEX "users_tenant_id_operational_code_key" ON "users"("tenant_id", "operational_code");

-- Supporting indexes for the now-authoritative tenant_id ownership column.
CREATE INDEX "branches_tenant_id_idx" ON "branches"("tenant_id");
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");
