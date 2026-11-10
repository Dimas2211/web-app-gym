-- FISCAL-ONBOARDING (2026-11-10)
-- Aditiva: 3 tablas Control Plane nuevas + columnas auto_delivery_enabled (default false)
-- y auto_delivery_enabled_at en platform_external_integrations.
-- No modifica datos existentes; TrustMe/MetaTraining conservan entrega manual.
-- NO aplicar a bases remotas sin aprobación explícita.

-- CreateEnum
CREATE TYPE "PlatformDteSignerProvisioningStatus" AS ENUM ('DRAFT', 'PLANNED', 'APPLYING', 'INFRA_READY', 'SIGNER_READY', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "PlatformDteExternalDeliveryStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DELIVERED', 'FAILED_RETRYABLE', 'UNCERTAIN', 'RECONCILED_DELIVERED', 'CANCELLED');

-- AlterTable
ALTER TABLE "platform_external_integrations" ADD COLUMN     "auto_delivery_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "auto_delivery_enabled_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "platform_dte_signer_provisionings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "container_name" TEXT NOT NULL,
    "cpanel_user" TEXT,
    "issuer_config_id" TEXT,
    "signer_nit" TEXT,
    "fiscal_profile" TEXT,
    "encrypted_api_key" TEXT,
    "api_key_fingerprint" TEXT,
    "status" "PlatformDteSignerProvisioningStatus" NOT NULL DEFAULT 'DRAFT',
    "template_version" TEXT,
    "observed_state" JSONB,
    "last_error" TEXT,
    "credential_registered_at" TIMESTAMP(3),
    "mh_authorization_confirmed_at" TIMESTAMP(3),
    "mh_authorization_confirmed_by" TEXT,
    "mh_authorization_reference" TEXT,
    "lock_run_id" TEXT,
    "lock_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "platform_dte_signer_provisionings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_dte_signer_provisioning_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provisioning_id" TEXT,
    "environment" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "steps" JSONB,
    "error_message" TEXT,
    "triggered_by" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "platform_dte_signer_provisioning_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_dte_external_delivery_jobs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "document_kind" TEXT NOT NULL DEFAULT 'DTE',
    "dte_document_id" TEXT NOT NULL,
    "generation_code" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "integration_id" TEXT,
    "target_host" TEXT,
    "target_database" TEXT,
    "target_table" TEXT,
    "status" "PlatformDteExternalDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "trigger" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_attempt_at" TIMESTAMP(3),
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "insert_id" TEXT,
    "affected_rows" INTEGER,
    "delivered_at" TIMESTAMP(3),
    "reconciled_by" TEXT,
    "reconciled_at" TIMESTAMP(3),
    "reconciliation_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "platform_dte_external_delivery_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_dte_signer_provisionings_hostname_key" ON "platform_dte_signer_provisionings"("hostname");

-- CreateIndex
CREATE UNIQUE INDEX "platform_dte_signer_provisionings_container_name_key" ON "platform_dte_signer_provisionings"("container_name");

-- CreateIndex
CREATE INDEX "platform_dte_signer_provisionings_organization_id_idx" ON "platform_dte_signer_provisionings"("organization_id");

-- CreateIndex
CREATE INDEX "platform_dte_signer_provisionings_status_idx" ON "platform_dte_signer_provisionings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "platform_dte_signer_provisionings_organization_id_environme_key" ON "platform_dte_signer_provisionings"("organization_id", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "platform_dte_signer_provisionings_port_key" ON "platform_dte_signer_provisionings"("port");

-- CreateIndex
CREATE INDEX "platform_dte_signer_provisioning_runs_organization_id_envir_idx" ON "platform_dte_signer_provisioning_runs"("organization_id", "environment");

-- CreateIndex
CREATE INDEX "platform_dte_signer_provisioning_runs_provisioning_id_idx" ON "platform_dte_signer_provisioning_runs"("provisioning_id");

-- CreateIndex
CREATE INDEX "platform_dte_signer_provisioning_runs_started_at_idx" ON "platform_dte_signer_provisioning_runs"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "platform_dte_external_delivery_jobs_idempotency_key_key" ON "platform_dte_external_delivery_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "platform_dte_external_delivery_jobs_status_next_attempt_at_idx" ON "platform_dte_external_delivery_jobs"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "platform_dte_external_delivery_jobs_organization_id_status_idx" ON "platform_dte_external_delivery_jobs"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "platform_dte_external_delivery_jobs_organization_id_environ_key" ON "platform_dte_external_delivery_jobs"("organization_id", "environment", "document_kind", "dte_document_id");

-- AddForeignKey
ALTER TABLE "platform_dte_signer_provisionings" ADD CONSTRAINT "platform_dte_signer_provisionings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_dte_signer_provisioning_runs" ADD CONSTRAINT "platform_dte_signer_provisioning_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_dte_external_delivery_jobs" ADD CONSTRAINT "platform_dte_external_delivery_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
