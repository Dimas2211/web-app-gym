-- CreateTable
CREATE TABLE "dte_environment_audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "previous_environment" "DteEnvironment",
    "new_environment" "DteEnvironment" NOT NULL,
    "new_issuer_config_id" TEXT NOT NULL,
    "changed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dte_environment_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dte_environment_audit_logs_tenant_id_location_id_idx" ON "dte_environment_audit_logs"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "dte_environment_audit_logs_created_at_idx" ON "dte_environment_audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "dte_environment_audit_logs" ADD CONSTRAINT "dte_environment_audit_logs_new_issuer_config_id_fkey" FOREIGN KEY ("new_issuer_config_id") REFERENCES "dte_issuer_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_environment_audit_logs" ADD CONSTRAINT "dte_environment_audit_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
