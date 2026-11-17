-- DTE-MH-TEST-RUNS (2026-11-16)
-- Aditiva. Pruebas de Hacienda (MH TEST) desde el onboarding fiscal del Control Plane.
--   * dte_outgoing_documents: purpose (DEFAULT 'OPERATIONAL') + certification_item_key (NULL).
--     ADD COLUMN con DEFAULT constante es solo metadata en PostgreSQL >= 11: no reescribe la tabla.
--     Todas las filas existentes quedan OPERATIONAL; los CHECK solo restringen filas de certificación.
--   * 2 tablas nuevas de Control Plane (vacías). Por ser schema único también se crean, vacías,
--     en las bases runtime (igual que platform_dte_external_delivery_jobs).
-- Requisito de despliegue: TODAS las bases que use el código nuevo deben tener esta migración
-- ANTES de desplegarlo (el cliente Prisma nuevo pide "purpose" en create/update/find sin select).
-- Ver docs/modules/dte-mh-test-runs.md §Despliegue. NO aplicar a bases remotas sin aprobación.

-- CreateEnum
CREATE TYPE "DteDocumentPurpose" AS ENUM ('OPERATIONAL', 'MH_TEST_CERTIFICATION');

-- AlterTable
ALTER TABLE "dte_outgoing_documents" ADD COLUMN     "certification_item_key" TEXT,
ADD COLUMN     "purpose" "DteDocumentPurpose" NOT NULL DEFAULT 'OPERATIONAL';

-- CreateTable
CREATE TABLE "platform_dte_mh_test_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "issuer_config_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'TEST',
    "status" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "authorized_by" TEXT,
    "authorized_at" TIMESTAMP(3),
    "lease_owner" TEXT,
    "lease_epoch" INTEGER NOT NULL DEFAULT 0,
    "lease_expires_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_by" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_dte_mh_test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_dte_mh_test_run_items" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "dte_type_code" TEXT,
    "scenario_code" TEXT NOT NULL,
    "depends_on_item_id" TEXT,
    "planned_sequence" INTEGER,
    "control_number" TEXT,
    "generation_code" TEXT,
    "runtime_dte_document_id" TEXT,
    "runtime_invalidation_event_id" TEXT,
    "runtime_contingency_event_id" TEXT,
    "step" TEXT NOT NULL,
    "claim_epoch" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "query_attempts" INTEGER NOT NULL DEFAULT 0,
    "mh_estado" TEXT,
    "mh_codigo_msg" TEXT,
    "mh_descripcion" TEXT,
    "reception_stamp" TEXT,
    "evidence" JSONB,
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "operator_decision" TEXT,
    "operator_note" TEXT,
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_dte_mh_test_run_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_dte_mh_test_runs_organization_id_created_at_idx" ON "platform_dte_mh_test_runs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_dte_mh_test_runs_status_idx" ON "platform_dte_mh_test_runs"("status");

-- CreateIndex
CREATE INDEX "platform_dte_mh_test_run_items_run_id_step_idx" ON "platform_dte_mh_test_run_items"("run_id", "step");

-- CreateIndex
CREATE UNIQUE INDEX "platform_dte_mh_test_run_items_run_id_seq_key" ON "platform_dte_mh_test_run_items"("run_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "dte_outgoing_documents_certification_item_key_key" ON "dte_outgoing_documents"("certification_item_key");

-- CreateIndex
CREATE INDEX "dte_outgoing_documents_tenant_id_purpose_environment_idx" ON "dte_outgoing_documents"("tenant_id", "purpose", "environment");

-- AddForeignKey
ALTER TABLE "platform_dte_mh_test_runs" ADD CONSTRAINT "platform_dte_mh_test_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_dte_mh_test_run_items" ADD CONSTRAINT "platform_dte_mh_test_run_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "platform_dte_mh_test_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- DTE-MH-TEST-RUNS — invariantes de forma (fail-closed a nivel de base)
-- Un documento de certificación: solo TEST y sin venta ni compra.
ALTER TABLE "dte_outgoing_documents" ADD CONSTRAINT "dte_outgoing_cert_shape_chk"
  CHECK ("purpose" <> 'MH_TEST_CERTIFICATION'
         OR ("environment" = 'TEST' AND "sale_id" IS NULL AND "purchase_id" IS NULL));

-- La clave de ítem solo existe en documentos de certificación.
ALTER TABLE "dte_outgoing_documents" ADD CONSTRAINT "dte_outgoing_cert_key_chk"
  CHECK ("certification_item_key" IS NULL OR "purpose" = 'MH_TEST_CERTIFICATION');

-- Las ejecuciones de pruebas MH solo existen en TEST.
ALTER TABLE "platform_dte_mh_test_runs" ADD CONSTRAINT "platform_dte_mh_test_runs_env_chk"
  CHECK ("environment" = 'TEST');

-- Una sola ejecución activa por organización + ambiente (protección de doble inicio).
CREATE UNIQUE INDEX "platform_dte_mh_test_runs_one_active"
  ON "platform_dte_mh_test_runs" ("organization_id", "environment")
  WHERE "status" IN ('QUEUED', 'RUNNING', 'PAUSED', 'NEEDS_REVIEW');
