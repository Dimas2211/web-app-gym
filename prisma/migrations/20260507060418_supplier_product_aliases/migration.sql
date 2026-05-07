-- CreateTable
CREATE TABLE "supplier_product_aliases" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "supplier_product_code" TEXT,
    "supplier_product_name" TEXT,
    "normalized_supplier_product_code" TEXT,
    "normalized_supplier_product_name" TEXT,
    "source" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "supplier_product_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_product_aliases_tenant_id_supplier_id_idx" ON "supplier_product_aliases"("tenant_id", "supplier_id");

-- CreateIndex
CREATE INDEX "supplier_product_aliases_tenant_id_product_id_idx" ON "supplier_product_aliases"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "supplier_product_aliases_tenant_id_supplier_id_normalized_s_idx" ON "supplier_product_aliases"("tenant_id", "supplier_id", "normalized_supplier_product_name");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_product_aliases_tenant_id_supplier_id_normalized_s_key" ON "supplier_product_aliases"("tenant_id", "supplier_id", "normalized_supplier_product_code");

-- AddForeignKey
ALTER TABLE "supplier_product_aliases" ADD CONSTRAINT "supplier_product_aliases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_aliases" ADD CONSTRAINT "supplier_product_aliases_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
