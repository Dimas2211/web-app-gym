-- CreateEnum
CREATE TYPE "PlatformEntitlementValueType" AS ENUM ('COUNT', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "PlatformEntitlementPeriodType" AS ENUM ('NONE', 'MONTHLY');

-- CreateTable
CREATE TABLE "platform_plan_modules" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_plan_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_entitlement_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "value_type" "PlatformEntitlementValueType" NOT NULL DEFAULT 'COUNT',
    "period_type" "PlatformEntitlementPeriodType" NOT NULL DEFAULT 'NONE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_entitlement_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_plan_entitlements" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "entitlement_definition_id" TEXT NOT NULL,
    "numeric_value" INTEGER,
    "is_unlimited" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_plan_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_organization_entitlement_overrides" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "entitlement_definition_id" TEXT NOT NULL,
    "numeric_value" INTEGER,
    "is_unlimited" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "platform_organization_entitlement_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_plan_modules_plan_id_idx" ON "platform_plan_modules"("plan_id");

-- CreateIndex
CREATE INDEX "platform_plan_modules_module_id_idx" ON "platform_plan_modules"("module_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_plan_modules_plan_id_module_id_key" ON "platform_plan_modules"("plan_id", "module_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_entitlement_definitions_code_key" ON "platform_entitlement_definitions"("code");

-- CreateIndex
CREATE INDEX "platform_entitlement_definitions_category_idx" ON "platform_entitlement_definitions"("category");

-- CreateIndex
CREATE INDEX "platform_entitlement_definitions_is_active_idx" ON "platform_entitlement_definitions"("is_active");

-- CreateIndex
CREATE INDEX "platform_plan_entitlements_plan_id_idx" ON "platform_plan_entitlements"("plan_id");

-- CreateIndex
CREATE INDEX "platform_plan_entitlements_entitlement_definition_id_idx" ON "platform_plan_entitlements"("entitlement_definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_plan_entitlements_plan_id_entitlement_definition_i_key" ON "platform_plan_entitlements"("plan_id", "entitlement_definition_id");

-- CreateIndex
CREATE INDEX "platform_organization_entitlement_overrides_organization_id_idx" ON "platform_organization_entitlement_overrides"("organization_id");

-- CreateIndex
CREATE INDEX "platform_organization_entitlement_overrides_entitlement_def_idx" ON "platform_organization_entitlement_overrides"("entitlement_definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_organization_entitlement_overrides_organization_id_key" ON "platform_organization_entitlement_overrides"("organization_id", "entitlement_definition_id");

-- AddForeignKey
ALTER TABLE "platform_plan_modules" ADD CONSTRAINT "platform_plan_modules_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "platform_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_plan_modules" ADD CONSTRAINT "platform_plan_modules_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "platform_modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_plan_entitlements" ADD CONSTRAINT "platform_plan_entitlements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "platform_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_plan_entitlements" ADD CONSTRAINT "platform_plan_entitlements_entitlement_definition_id_fkey" FOREIGN KEY ("entitlement_definition_id") REFERENCES "platform_entitlement_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_organization_entitlement_overrides" ADD CONSTRAINT "platform_organization_entitlement_overrides_organization_i_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_organization_entitlement_overrides" ADD CONSTRAINT "platform_organization_entitlement_overrides_entitlement_de_fkey" FOREIGN KEY ("entitlement_definition_id") REFERENCES "platform_entitlement_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
