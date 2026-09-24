-- SHARED-PILOT-4B — idempotencia distribuida del provisioning runtime.
-- Additive: 1 enum + 2 tablas nuevas. No toca columnas ni datos existentes.
--   platform_runtime_provisioning_operations → coordinación (Control Plane)
--   runtime_provisioning_receipts            → prueba de aplicación (Runtime DB)

-- CreateEnum
CREATE TYPE "PlatformRuntimeProvisioningOperationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "runtime_provisioning_receipts" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "gym_id" TEXT,
    "location_id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runtime_provisioning_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_runtime_provisioning_operations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "PlatformRuntimeProvisioningOperationStatus" NOT NULL DEFAULT 'PENDING',
    "runtime_target_kind" TEXT,
    "runtime_target_id" TEXT,
    "result_tenant_id" TEXT,
    "result_gym_id" TEXT,
    "result_location_id" TEXT,
    "result_admin_user_id" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "platform_runtime_provisioning_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "runtime_provisioning_receipts_idempotency_key_key" ON "runtime_provisioning_receipts"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "runtime_provisioning_receipts_tenant_id_key" ON "runtime_provisioning_receipts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "runtime_provisioning_receipts_location_id_key" ON "runtime_provisioning_receipts"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "runtime_provisioning_receipts_admin_user_id_key" ON "runtime_provisioning_receipts"("admin_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_runtime_provisioning_operations_organization_id_key" ON "platform_runtime_provisioning_operations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_runtime_provisioning_operations_idempotency_key_key" ON "platform_runtime_provisioning_operations"("idempotency_key");

-- CreateIndex
CREATE INDEX "platform_runtime_provisioning_operations_status_idx" ON "platform_runtime_provisioning_operations"("status");

-- AddForeignKey
ALTER TABLE "runtime_provisioning_receipts" ADD CONSTRAINT "runtime_provisioning_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "runtime_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_provisioning_receipts" ADD CONSTRAINT "runtime_provisioning_receipts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_provisioning_receipts" ADD CONSTRAINT "runtime_provisioning_receipts_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_runtime_provisioning_operations" ADD CONSTRAINT "platform_runtime_provisioning_operations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
