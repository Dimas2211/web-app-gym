-- AlterTable
ALTER TABLE "purchases" ALTER COLUMN "purchase_year" DROP DEFAULT,
ALTER COLUMN "purchase_month" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "purchases_location_id_purchase_year_purchase_month_purchase_cod" RENAME TO "purchases_location_id_purchase_year_purchase_month_purchase_key";
