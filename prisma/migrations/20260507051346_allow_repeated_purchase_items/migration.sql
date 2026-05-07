-- DropIndex
DROP INDEX "purchase_items_purchase_id_product_id_key";

-- AlterTable
ALTER TABLE "purchase_items" ADD COLUMN     "dte_line_number" INTEGER;

-- CreateIndex
CREATE INDEX "purchase_items_purchase_id_product_id_idx" ON "purchase_items"("purchase_id", "product_id");
