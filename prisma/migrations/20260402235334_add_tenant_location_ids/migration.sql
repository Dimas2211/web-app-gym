-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "class_types" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "client_memberships" ADD COLUMN     "location_id" TEXT,
ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "client_weekly_plans" ADD COLUMN     "location_id" TEXT,
ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "location_id" TEXT,
ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "gym_settings" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "membership_plans" ADD COLUMN     "location_id" TEXT,
ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "scheduled_classes" ADD COLUMN     "location_id" TEXT,
ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "trainer_availability" ADD COLUMN     "location_id" TEXT,
ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "trainers" ADD COLUMN     "location_id" TEXT,
ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "location_id" TEXT,
ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "weekly_plan_templates" ADD COLUMN     "location_id" TEXT,
ADD COLUMN     "tenant_id" TEXT;

-- ============================================================
-- BACKFILL: tenant_id = gym_id
-- Tablas sin branch_id
-- ============================================================
UPDATE "branches"           SET "tenant_id" = "gym_id";
UPDATE "class_types"        SET "tenant_id" = "gym_id";
UPDATE "gym_settings"       SET "tenant_id" = "gym_id";

-- ============================================================
-- BACKFILL: tenant_id = gym_id, location_id = branch_id
-- Tablas con ambos campos (branch_id puede ser NULL en algunas)
-- ============================================================
UPDATE "users"                  SET "tenant_id" = "gym_id", "location_id" = "branch_id";
UPDATE "trainers"               SET "tenant_id" = "gym_id", "location_id" = "branch_id";
UPDATE "clients"                SET "tenant_id" = "gym_id", "location_id" = "branch_id";
UPDATE "client_memberships"     SET "tenant_id" = "gym_id", "location_id" = "branch_id";
UPDATE "membership_plans"       SET "tenant_id" = "gym_id", "location_id" = "branch_id";
UPDATE "trainer_availability"   SET "tenant_id" = "gym_id", "location_id" = "branch_id";
UPDATE "scheduled_classes"      SET "tenant_id" = "gym_id", "location_id" = "branch_id";
UPDATE "weekly_plan_templates"  SET "tenant_id" = "gym_id", "location_id" = "branch_id";
UPDATE "client_weekly_plans"    SET "tenant_id" = "gym_id", "location_id" = "branch_id";
