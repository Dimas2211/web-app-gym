-- Optional bridge only; existing customers and gym clients are unchanged.
CREATE UNIQUE INDEX "customers_id_tenant_id_key" ON "customers"("id", "tenant_id");
CREATE TABLE "gym_customer_links" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gym_customer_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "gym_customer_links_customer_id_tenant_id_key" ON "gym_customer_links"("customer_id", "tenant_id");
CREATE UNIQUE INDEX "gym_customer_links_client_id_tenant_id_key" ON "gym_customer_links"("client_id", "tenant_id");
ALTER TABLE "gym_customer_links" ADD CONSTRAINT "gym_customer_links_customer_id_tenant_id_fkey" FOREIGN KEY ("customer_id", "tenant_id") REFERENCES "customers"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "gym_customer_links" ADD CONSTRAINT "gym_customer_links_client_id_tenant_id_fkey" FOREIGN KEY ("client_id", "tenant_id") REFERENCES "clients"("id", "tenant_id") ON DELETE CASCADE ON UPDATE RESTRICT;
-- Server-side Prisma access only; no direct Data API access for public roles.
ALTER TABLE "gym_customer_links" ENABLE ROW LEVEL SECURITY;
