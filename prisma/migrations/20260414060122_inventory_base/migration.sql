-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('INITIAL_LOAD', 'MANUAL_IN', 'MANUAL_OUT', 'ADJUSTMENT_UP', 'ADJUSTMENT_DOWN', 'PURCHASE_IN', 'SALE_OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN_IN', 'RETURN_OUT');

-- CreateTable
CREATE TABLE "product_locations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "current_stock" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "min_stock" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "reorder_quantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "warehouse" TEXT,
    "shelf" TEXT,
    "position" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "product_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_location_id" TEXT NOT NULL,
    "movement_type" "MovementType" NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit_cost" DECIMAL(10,2),
    "stock_before" DECIMAL(12,4) NOT NULL,
    "resulting_stock" DECIMAL(12,4) NOT NULL,
    "reference_entity" TEXT,
    "reference_id" TEXT,
    "reference_code" TEXT,
    "notes" TEXT,
    "performed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_locations_tenant_id_idx" ON "product_locations"("tenant_id");

-- CreateIndex
CREATE INDEX "product_locations_location_id_idx" ON "product_locations"("location_id");

-- CreateIndex
CREATE INDEX "product_locations_product_id_idx" ON "product_locations"("product_id");

-- CreateIndex
CREATE INDEX "product_locations_tenant_id_location_id_idx" ON "product_locations"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "product_locations_is_active_idx" ON "product_locations"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "product_locations_tenant_id_location_id_product_id_key" ON "product_locations"("tenant_id", "location_id", "product_id");

-- CreateIndex
CREATE INDEX "inventory_movements_tenant_id_idx" ON "inventory_movements"("tenant_id");

-- CreateIndex
CREATE INDEX "inventory_movements_location_id_idx" ON "inventory_movements"("location_id");

-- CreateIndex
CREATE INDEX "inventory_movements_product_id_idx" ON "inventory_movements"("product_id");

-- CreateIndex
CREATE INDEX "inventory_movements_product_location_id_idx" ON "inventory_movements"("product_location_id");

-- CreateIndex
CREATE INDEX "inventory_movements_movement_type_idx" ON "inventory_movements"("movement_type");

-- CreateIndex
CREATE INDEX "inventory_movements_tenant_id_location_id_created_at_idx" ON "inventory_movements"("tenant_id", "location_id", "created_at");

-- AddForeignKey
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_location_id_fkey" FOREIGN KEY ("product_location_id") REFERENCES "product_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
