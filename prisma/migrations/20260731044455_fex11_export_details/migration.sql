-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "country_code" TEXT,
ADD COLUMN     "country_name" TEXT,
ADD COLUMN     "customer_person_type" TEXT,
ADD COLUMN     "is_foreign" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "units_of_measure" ADD COLUMN     "mh_unit_code" TEXT;

-- CreateTable
CREATE TABLE "sale_export_details" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "country_name" TEXT NOT NULL,
    "customer_person_type" TEXT,
    "item_type_export" INTEGER NOT NULL,
    "fiscal_precinct_code" TEXT,
    "fiscal_precinct_name" TEXT,
    "regime_code" TEXT,
    "regime_name" TEXT,
    "incoterm_code" TEXT,
    "incoterm_desc" TEXT,
    "insurance_amount" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "freight_amount" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "extra_export_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_export_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sale_export_details_sale_id_key" ON "sale_export_details"("sale_id");

-- CreateIndex
CREATE INDEX "sale_export_details_tenant_id_idx" ON "sale_export_details"("tenant_id");

-- CreateIndex
CREATE INDEX "sale_export_details_sale_id_idx" ON "sale_export_details"("sale_id");

-- AddForeignKey
ALTER TABLE "sale_export_details" ADD CONSTRAINT "sale_export_details_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
