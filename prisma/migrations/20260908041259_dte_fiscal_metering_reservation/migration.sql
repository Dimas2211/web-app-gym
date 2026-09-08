-- CreateEnum
CREATE TYPE "DteFiscalMeteringStatus" AS ENUM ('PENDING', 'CONSUMED', 'RELEASED');

-- CreateTable
CREATE TABLE "dte_fiscal_metering_reservations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "dte_document_id" TEXT NOT NULL,
    "entitlement_code" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "status" "DteFiscalMeteringStatus" NOT NULL DEFAULT 'PENDING',
    "reserved_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dte_fiscal_metering_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dte_fiscal_metering_reservations_dte_document_id_key" ON "dte_fiscal_metering_reservations"("dte_document_id");

-- CreateIndex
CREATE INDEX "dte_fiscal_metering_reservations_tenant_id_entitlement_code_idx" ON "dte_fiscal_metering_reservations"("tenant_id", "entitlement_code", "period_key", "status");

-- CreateIndex
CREATE INDEX "dte_fiscal_metering_reservations_tenant_id_period_key_idx" ON "dte_fiscal_metering_reservations"("tenant_id", "period_key");

-- AddForeignKey
ALTER TABLE "dte_fiscal_metering_reservations" ADD CONSTRAINT "dte_fiscal_metering_reservations_dte_document_id_fkey" FOREIGN KEY ("dte_document_id") REFERENCES "dte_outgoing_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
