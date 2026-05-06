-- CreateEnum
CREATE TYPE "PurchaseSourceType" AS ENUM ('MANUAL', 'DTE_IMPORT');

-- CreateEnum
CREATE TYPE "DteImportStatus" AS ENUM ('UPLOADED', 'PENDING_REVIEW', 'READY_TO_CREATE_PURCHASE', 'LINKED', 'REJECTED');

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "dte_environment_code" TEXT,
ADD COLUMN     "dte_processed_at" TIMESTAMP(3),
ADD COLUMN     "source_type" "PurchaseSourceType" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "tenant_fiscal_config" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "purchase_dte_imports" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "raw_json" JSONB NOT NULL,
    "dte_type" TEXT,
    "generation_code" TEXT,
    "control_number" TEXT,
    "reception_stamp" TEXT,
    "processed_at" TIMESTAMP(3),
    "environment_code" TEXT,
    "issuer_nit" TEXT,
    "issuer_nrc" TEXT,
    "issuer_name" TEXT,
    "issued_at" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2),
    "tax_amount" DECIMAL(12,2),
    "total_amount" DECIMAL(12,2),
    "item_count" INTEGER,
    "status" "DteImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "purchase_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,

    CONSTRAINT "purchase_dte_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_dte_imports_purchase_id_key" ON "purchase_dte_imports"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_dte_imports_tenant_id_location_id_idx" ON "purchase_dte_imports"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "purchase_dte_imports_tenant_id_location_id_status_idx" ON "purchase_dte_imports"("tenant_id", "location_id", "status");

-- CreateIndex
CREATE INDEX "purchase_dte_imports_tenant_id_location_id_generation_code_idx" ON "purchase_dte_imports"("tenant_id", "location_id", "generation_code");

-- AddForeignKey
ALTER TABLE "purchase_dte_imports" ADD CONSTRAINT "purchase_dte_imports_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
