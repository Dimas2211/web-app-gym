-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalePaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "DteOutgoingStatus" AS ENUM ('NOT_REQUIRED', 'PENDING_GENERATION', 'GENERATED', 'SCHEMA_VALIDATED', 'SIGNED', 'SENT', 'ACCEPTED', 'REJECTED', 'OBSERVED', 'CONTINGENCY_PENDING', 'INVALIDATION_PENDING', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "DteEnvironment" AS ENUM ('TEST', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "CustomerTaxpayerType" AS ENUM ('FINAL_CONSUMER', 'REGISTERED_TAXPAYER', 'EXCLUDED_SUBJECT');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "taxpayer_type" "CustomerTaxpayerType",
    "id_type_code" TEXT,
    "nit" TEXT,
    "nrc" TEXT,
    "dui" TEXT,
    "activity_code" TEXT,
    "activity_name" TEXT,
    "dept_code" TEXT,
    "municipality_code" TEXT,
    "address_complement" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" "Status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "sale_code" TEXT NOT NULL,
    "sale_year" INTEGER NOT NULL,
    "sale_month" INTEGER NOT NULL,
    "sale_sequence" INTEGER NOT NULL,
    "sale_date" TIMESTAMP(3) NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'DRAFT',
    "payment_status" "SalePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "payment_method_code" TEXT,
    "condition_operation_code" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "inventory_moved" BOOLEAN NOT NULL DEFAULT false,
    "cash_session_id" TEXT,
    "notes" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "product_code_snapshot" TEXT NOT NULL,
    "product_name_snapshot" TEXT NOT NULL,
    "product_type_snapshot" TEXT,
    "is_stockable_snapshot" BOOLEAN NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax_rate_snapshot" DECIMAL(5,2),
    "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "line_subtotal" DECIMAL(10,2) NOT NULL,
    "line_total" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payments" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "payment_method_code" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dte_issuer_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "environment" "DteEnvironment" NOT NULL,
    "nit" TEXT NOT NULL,
    "nrc" TEXT,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "activity_code" TEXT,
    "activity_name" TEXT,
    "establishment_code" TEXT,
    "establishment_type_code" TEXT,
    "point_of_sale_code" TEXT,
    "dept_code" TEXT,
    "municipality_code" TEXT,
    "address_complement" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "dte_issuer_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dte_credentials" (
    "id" TEXT NOT NULL,
    "issuer_config_id" TEXT NOT NULL,
    "credential_type" TEXT NOT NULL,
    "encrypted_payload" TEXT,
    "secret_ref" TEXT,
    "encryption_key_version" TEXT,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "dte_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dte_correlatives" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "environment" "DteEnvironment" NOT NULL,
    "dte_type_code" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dte_correlatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dte_outgoing_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "issuer_config_id" TEXT,
    "dte_type_code" TEXT NOT NULL,
    "generation_code" TEXT,
    "control_number" TEXT,
    "reception_stamp" TEXT,
    "environment" "DteEnvironment" NOT NULL,
    "dte_status" "DteOutgoingStatus" NOT NULL DEFAULT 'PENDING_GENERATION',
    "json_document" JSONB,
    "signed_jws" TEXT,
    "mh_response" JSONB,
    "observations" JSONB,
    "rejection_reason" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "issued_at" TIMESTAMP(3),
    "generated_at" TIMESTAMP(3),
    "schema_validated_at" TIMESTAMP(3),
    "signed_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "observed_at" TIMESTAMP(3),
    "invalidated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "dte_outgoing_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dte_transmission_logs" (
    "id" TEXT NOT NULL,
    "dte_document_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "operation_type" TEXT NOT NULL,
    "request_url" TEXT,
    "http_status" INTEGER,
    "response_body" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dte_transmission_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_tenant_id_idx" ON "customers"("tenant_id");

-- CreateIndex
CREATE INDEX "customers_tenant_id_nit_idx" ON "customers"("tenant_id", "nit");

-- CreateIndex
CREATE INDEX "customers_tenant_id_nrc_idx" ON "customers"("tenant_id", "nrc");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_customer_code_key" ON "customers"("tenant_id", "customer_code");

-- CreateIndex
CREATE INDEX "sales_tenant_id_location_id_status_idx" ON "sales"("tenant_id", "location_id", "status");

-- CreateIndex
CREATE INDEX "sales_tenant_id_location_id_sale_date_idx" ON "sales"("tenant_id", "location_id", "sale_date");

-- CreateIndex
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");

-- CreateIndex
CREATE INDEX "sales_created_by_idx" ON "sales"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "sales_tenant_id_location_id_sale_code_key" ON "sales"("tenant_id", "location_id", "sale_code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_tenant_id_location_id_sale_year_sale_month_sale_seque_key" ON "sales"("tenant_id", "location_id", "sale_year", "sale_month", "sale_sequence");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "sale_items_product_id_idx" ON "sale_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_sale_id_line_number_key" ON "sale_items"("sale_id", "line_number");

-- CreateIndex
CREATE INDEX "sale_payments_sale_id_idx" ON "sale_payments"("sale_id");

-- CreateIndex
CREATE INDEX "sale_payments_payment_method_code_idx" ON "sale_payments"("payment_method_code");

-- CreateIndex
CREATE INDEX "sale_payments_paid_at_idx" ON "sale_payments"("paid_at");

-- CreateIndex
CREATE INDEX "dte_issuer_configs_tenant_id_location_id_is_active_idx" ON "dte_issuer_configs"("tenant_id", "location_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "dte_issuer_configs_tenant_id_location_id_environment_key" ON "dte_issuer_configs"("tenant_id", "location_id", "environment");

-- CreateIndex
CREATE INDEX "dte_credentials_issuer_config_id_idx" ON "dte_credentials"("issuer_config_id");

-- CreateIndex
CREATE INDEX "dte_credentials_credential_type_idx" ON "dte_credentials"("credential_type");

-- CreateIndex
CREATE INDEX "dte_credentials_is_active_idx" ON "dte_credentials"("is_active");

-- CreateIndex
CREATE INDEX "dte_correlatives_tenant_id_location_id_idx" ON "dte_correlatives"("tenant_id", "location_id");

-- CreateIndex
CREATE UNIQUE INDEX "dte_correlatives_tenant_id_location_id_environment_dte_type_key" ON "dte_correlatives"("tenant_id", "location_id", "environment", "dte_type_code", "year");

-- CreateIndex
CREATE UNIQUE INDEX "dte_outgoing_documents_generation_code_key" ON "dte_outgoing_documents"("generation_code");

-- CreateIndex
CREATE INDEX "dte_outgoing_documents_tenant_id_location_id_dte_status_idx" ON "dte_outgoing_documents"("tenant_id", "location_id", "dte_status");

-- CreateIndex
CREATE INDEX "dte_outgoing_documents_sale_id_idx" ON "dte_outgoing_documents"("sale_id");

-- CreateIndex
CREATE INDEX "dte_outgoing_documents_dte_type_code_idx" ON "dte_outgoing_documents"("dte_type_code");

-- CreateIndex
CREATE INDEX "dte_outgoing_documents_control_number_idx" ON "dte_outgoing_documents"("control_number");

-- CreateIndex
CREATE INDEX "dte_outgoing_documents_reception_stamp_idx" ON "dte_outgoing_documents"("reception_stamp");

-- CreateIndex
CREATE INDEX "dte_transmission_logs_dte_document_id_idx" ON "dte_transmission_logs"("dte_document_id");

-- CreateIndex
CREATE INDEX "dte_transmission_logs_operation_type_idx" ON "dte_transmission_logs"("operation_type");

-- CreateIndex
CREATE INDEX "dte_transmission_logs_created_at_idx" ON "dte_transmission_logs"("created_at");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_issuer_configs" ADD CONSTRAINT "dte_issuer_configs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_issuer_configs" ADD CONSTRAINT "dte_issuer_configs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_credentials" ADD CONSTRAINT "dte_credentials_issuer_config_id_fkey" FOREIGN KEY ("issuer_config_id") REFERENCES "dte_issuer_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_credentials" ADD CONSTRAINT "dte_credentials_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_credentials" ADD CONSTRAINT "dte_credentials_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_outgoing_documents" ADD CONSTRAINT "dte_outgoing_documents_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_outgoing_documents" ADD CONSTRAINT "dte_outgoing_documents_issuer_config_id_fkey" FOREIGN KEY ("issuer_config_id") REFERENCES "dte_issuer_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_outgoing_documents" ADD CONSTRAINT "dte_outgoing_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_outgoing_documents" ADD CONSTRAINT "dte_outgoing_documents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_transmission_logs" ADD CONSTRAINT "dte_transmission_logs_dte_document_id_fkey" FOREIGN KEY ("dte_document_id") REFERENCES "dte_outgoing_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
