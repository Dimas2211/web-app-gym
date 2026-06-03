-- CreateEnum
CREATE TYPE "PlatformOrganizationStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlatformLicenseStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlatformBillingCycle" AS ENUM ('MONTHLY', 'ANNUAL', 'LIFETIME', 'NONE');

-- CreateEnum
CREATE TYPE "PlatformModuleCategory" AS ENUM ('CORE', 'COMMERCE', 'VERTICAL', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "PlatformModuleStatus" AS ENUM ('AVAILABLE', 'COMING_SOON', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "PlatformDeploymentStatus" AS ENUM ('SUCCESS', 'FAILED', 'ROLLBACK');

-- CreateTable
CREATE TABLE "platform_verticals" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_verticals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "billing_cycle" "PlatformBillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "price_monthly" DECIMAL(10,2),
    "price_annual" DECIMAL(10,2),
    "max_locations" INTEGER,
    "max_users" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_organizations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "nit" TEXT,
    "tenant_id" TEXT,
    "vertical_id" TEXT,
    "plan_id" TEXT,
    "status" "PlatformOrganizationStatus" NOT NULL DEFAULT 'PENDING',
    "license_status" "PlatformLicenseStatus" NOT NULL DEFAULT 'TRIAL',
    "billing_cycle" "PlatformBillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "trial_ends_at" TIMESTAMP(3),
    "license_expires_at" TIMESTAMP(3),
    "country_code" TEXT,
    "timezone" TEXT,
    "domain" TEXT,
    "logo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "platform_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_modules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "PlatformModuleCategory" NOT NULL,
    "status" "PlatformModuleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "version" TEXT NOT NULL DEFAULT '1.0',
    "is_core" BOOLEAN NOT NULL DEFAULT false,
    "vertical_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_organization_modules" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "platform_organization_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_branding" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "primary_color" TEXT,
    "secondary_color" TEXT,
    "logo_url" TEXT,
    "favicon_url" TEXT,
    "custom_domain" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "platform_branding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_deployment_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" "PlatformDeploymentStatus" NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "triggered_by" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_deployment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_verticals_code_key" ON "platform_verticals"("code");

-- CreateIndex
CREATE UNIQUE INDEX "platform_plans_code_key" ON "platform_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "platform_organizations_code_key" ON "platform_organizations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "platform_organizations_tenant_id_key" ON "platform_organizations"("tenant_id");

-- CreateIndex
CREATE INDEX "platform_organizations_tenant_id_idx" ON "platform_organizations"("tenant_id");

-- CreateIndex
CREATE INDEX "platform_organizations_status_idx" ON "platform_organizations"("status");

-- CreateIndex
CREATE INDEX "platform_organizations_license_status_idx" ON "platform_organizations"("license_status");

-- CreateIndex
CREATE INDEX "platform_organizations_vertical_id_idx" ON "platform_organizations"("vertical_id");

-- CreateIndex
CREATE INDEX "platform_organizations_plan_id_idx" ON "platform_organizations"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_modules_code_key" ON "platform_modules"("code");

-- CreateIndex
CREATE INDEX "platform_modules_category_idx" ON "platform_modules"("category");

-- CreateIndex
CREATE INDEX "platform_modules_status_idx" ON "platform_modules"("status");

-- CreateIndex
CREATE INDEX "platform_modules_vertical_id_idx" ON "platform_modules"("vertical_id");

-- CreateIndex
CREATE INDEX "platform_organization_modules_organization_id_idx" ON "platform_organization_modules"("organization_id");

-- CreateIndex
CREATE INDEX "platform_organization_modules_module_id_idx" ON "platform_organization_modules"("module_id");

-- CreateIndex
CREATE INDEX "platform_organization_modules_is_active_idx" ON "platform_organization_modules"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "platform_organization_modules_organization_id_module_id_key" ON "platform_organization_modules"("organization_id", "module_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_branding_organization_id_key" ON "platform_branding"("organization_id");

-- CreateIndex
CREATE INDEX "platform_deployment_logs_organization_id_idx" ON "platform_deployment_logs"("organization_id");

-- CreateIndex
CREATE INDEX "platform_deployment_logs_status_idx" ON "platform_deployment_logs"("status");

-- CreateIndex
CREATE INDEX "platform_deployment_logs_created_at_idx" ON "platform_deployment_logs"("created_at");

-- AddForeignKey
ALTER TABLE "platform_organizations" ADD CONSTRAINT "platform_organizations_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "platform_verticals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_organizations" ADD CONSTRAINT "platform_organizations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "platform_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_modules" ADD CONSTRAINT "platform_modules_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "platform_verticals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_organization_modules" ADD CONSTRAINT "platform_organization_modules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_organization_modules" ADD CONSTRAINT "platform_organization_modules_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "platform_modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_branding" ADD CONSTRAINT "platform_branding_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_deployment_logs" ADD CONSTRAINT "platform_deployment_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
