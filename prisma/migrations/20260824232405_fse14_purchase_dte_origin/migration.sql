-- AlterEnum
ALTER TYPE "TaxpayerType" ADD VALUE 'EXCLUDED_SUBJECT';

-- DropForeignKey
ALTER TABLE "dte_outgoing_documents" DROP CONSTRAINT "dte_outgoing_documents_sale_id_fkey";

-- AlterTable
ALTER TABLE "dte_outgoing_documents" ADD COLUMN     "purchase_id" TEXT,
ALTER COLUMN "sale_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "income_tax_withholding_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "income_tax_withholding_applies" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "income_tax_withholding_rate" DECIMAL(5,2);

-- CreateIndex
CREATE INDEX "dte_outgoing_documents_purchase_id_idx" ON "dte_outgoing_documents"("purchase_id");

-- AddForeignKey
ALTER TABLE "dte_outgoing_documents" ADD CONSTRAINT "dte_outgoing_documents_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_outgoing_documents" ADD CONSTRAINT "dte_outgoing_documents_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
