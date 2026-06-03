-- CreateEnum
CREATE TYPE "PlatformProvisioningStatus" AS ENUM ('NOT_READY', 'READY', 'PROVISIONED', 'DEPLOYED', 'FAILED');

-- AlterTable
ALTER TABLE "platform_organizations" ADD COLUMN     "provisioning_status" "PlatformProvisioningStatus" NOT NULL DEFAULT 'NOT_READY';

-- CreateTable
CREATE TABLE "platform_provisioning_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "result" "PlatformProvisioningStatus" NOT NULL,
    "triggered_by" TEXT,
    "validation_errors" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_provisioning_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_provisioning_logs_organization_id_idx" ON "platform_provisioning_logs"("organization_id");

-- CreateIndex
CREATE INDEX "platform_provisioning_logs_result_idx" ON "platform_provisioning_logs"("result");

-- CreateIndex
CREATE INDEX "platform_provisioning_logs_created_at_idx" ON "platform_provisioning_logs"("created_at");

-- CreateIndex
CREATE INDEX "platform_organizations_provisioning_status_idx" ON "platform_organizations"("provisioning_status");

-- AddForeignKey
ALTER TABLE "platform_provisioning_logs" ADD CONSTRAINT "platform_provisioning_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
