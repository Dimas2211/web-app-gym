-- SHARED-PILOT-3: neutral runtime tenant root.
-- Gym stops being the implicit tenant root; RuntimeTenant becomes the
-- neutral identity. For every existing tenant, runtime_tenants.id = gyms.id
-- (same UUID preserved), so no existing tenant_id changes value anywhere.

-- CreateTable
CREATE TABLE "runtime_tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runtime_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "runtime_tenants_slug_key" ON "runtime_tenants"("slug");

-- Backfill: one RuntimeTenant per existing Gym, same id/name/slug/status.
INSERT INTO "runtime_tenants" ("id", "name", "slug", "status", "created_at", "updated_at")
SELECT "id", "name", "slug", "status", "created_at", "updated_at"
FROM "gyms"
ON CONFLICT ("id") DO NOTHING;

-- AlterTable: Gym.tenant_id -> RuntimeTenant.id (optional so a future
-- Commerce-only RuntimeTenant is never forced to own a Gym row).
ALTER TABLE "gyms" ADD COLUMN "tenant_id" TEXT;

-- Backfill: existing gyms point at the RuntimeTenant created for them above.
UPDATE "gyms" SET "tenant_id" = "id" WHERE "tenant_id" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "gyms_tenant_id_key" ON "gyms"("tenant_id");

-- AddForeignKey
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "runtime_tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill shadow tenant_id columns that already exist on GYM-vertical
-- tables (added ahead of this phase as compatibility bridges), so they
-- reliably mirror gym_id instead of being unreliable/unset shadow columns.
-- gym_id/branch_id remain the authoritative, required, FK-backed columns
-- for the GYM vertical in this phase; tenant_id/location_id stay optional
-- mirrors until a later phase can safely make them required (see report).
UPDATE "branches" SET "tenant_id" = "gym_id" WHERE "tenant_id" IS NULL;
UPDATE "users" SET "tenant_id" = "gym_id" WHERE "tenant_id" IS NULL;
UPDATE "users" SET "location_id" = "branch_id" WHERE "location_id" IS NULL AND "branch_id" IS NOT NULL;
UPDATE "membership_plans" SET "tenant_id" = "gym_id" WHERE "tenant_id" IS NULL;
UPDATE "clients" SET "tenant_id" = "gym_id" WHERE "tenant_id" IS NULL;
UPDATE "client_memberships" SET "tenant_id" = "gym_id" WHERE "tenant_id" IS NULL;
UPDATE "trainers" SET "tenant_id" = "gym_id" WHERE "tenant_id" IS NULL;
UPDATE "trainer_availability" SET "tenant_id" = "gym_id" WHERE "tenant_id" IS NULL;
UPDATE "class_types" SET "tenant_id" = "gym_id" WHERE "tenant_id" IS NULL;
UPDATE "scheduled_classes" SET "tenant_id" = "gym_id" WHERE "tenant_id" IS NULL;
UPDATE "weekly_plan_templates" SET "tenant_id" = "gym_id" WHERE "tenant_id" IS NULL;
UPDATE "client_weekly_plans" SET "tenant_id" = "gym_id" WHERE "tenant_id" IS NULL;
UPDATE "gym_settings" SET "tenant_id" = "gym_id" WHERE "tenant_id" IS NULL;
