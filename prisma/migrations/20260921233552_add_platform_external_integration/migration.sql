-- CreateEnum
CREATE TYPE "PlatformExternalIntegrationType" AS ENUM ('DTE_MARIADB');

-- CreateTable
CREATE TABLE "platform_external_integrations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" "PlatformExternalIntegrationType" NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "encrypted_payload" TEXT NOT NULL,
    "last_tested_at" TIMESTAMP(3),
    "last_test_status" "PlatformDatabaseConnectionTestStatus" NOT NULL DEFAULT 'UNTESTED',
    "last_test_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "platform_external_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_external_integrations_organization_id_idx" ON "platform_external_integrations"("organization_id");

-- CreateIndex
CREATE INDEX "platform_external_integrations_type_idx" ON "platform_external_integrations"("type");

-- CreateIndex
CREATE INDEX "platform_external_integrations_is_active_idx" ON "platform_external_integrations"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "platform_external_integrations_organization_id_type_key" ON "platform_external_integrations"("organization_id", "type");

-- AddForeignKey
ALTER TABLE "platform_external_integrations" ADD CONSTRAINT "platform_external_integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
