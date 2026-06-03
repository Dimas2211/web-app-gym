-- CreateTable
CREATE TABLE "platform_deployment_export_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "export_type" TEXT NOT NULL,
    "bundle_version" TEXT NOT NULL,
    "exported_by" TEXT,
    "result" TEXT NOT NULL,
    "error_message" TEXT,
    "bundle_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_deployment_export_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_deployment_export_logs_organization_id_idx" ON "platform_deployment_export_logs"("organization_id");

-- CreateIndex
CREATE INDEX "platform_deployment_export_logs_export_type_idx" ON "platform_deployment_export_logs"("export_type");

-- CreateIndex
CREATE INDEX "platform_deployment_export_logs_created_at_idx" ON "platform_deployment_export_logs"("created_at");

-- AddForeignKey
ALTER TABLE "platform_deployment_export_logs" ADD CONSTRAINT "platform_deployment_export_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
