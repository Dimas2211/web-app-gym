-- CreateEnum
CREATE TYPE "DteRenderedDocumentStatus" AS ENUM ('PENDING', 'GENERATED', 'FAILED');

-- CreateEnum
CREATE TYPE "DteDeliveryType" AS ENUM ('CUSTOMER_EMAIL', 'INTERNAL_EMAIL', 'PRINT', 'DOWNLOAD');

-- CreateEnum
CREATE TYPE "DteDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DteDocumentRelationType" AS ENUM ('CREDIT_NOTE_OF', 'DEBIT_NOTE_OF', 'REPLACES', 'REFERENCES');

-- CreateEnum
CREATE TYPE "DteInvalidationStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'SENT', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "sale_payments" ADD COLUMN     "mh_payment_form_code" TEXT;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "payment_term_code" TEXT,
ADD COLUMN     "payment_term_value" INTEGER;

-- CreateTable
CREATE TABLE "dte_catalog_items" (
    "id" TEXT NOT NULL,
    "catalog_code" TEXT NOT NULL,
    "item_code" TEXT NOT NULL,
    "item_label" TEXT NOT NULL,
    "description" TEXT,
    "applies_to" TEXT,
    "version" TEXT NOT NULL DEFAULT '1',
    "sort_order" INTEGER,
    "metadata" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dte_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dte_rendered_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "dte_document_id" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "storage_key" TEXT,
    "public_url" TEXT,
    "file_name" TEXT,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "status" "DteRenderedDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "generated_at" TIMESTAMP(3),
    "generated_by" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dte_rendered_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dte_deliveries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "dte_document_id" TEXT NOT NULL,
    "rendered_document_id" TEXT,
    "delivery_type" "DteDeliveryType" NOT NULL,
    "recipient_email" TEXT,
    "cc" TEXT,
    "bcc" TEXT,
    "subject" TEXT,
    "provider" TEXT,
    "provider_message_id" TEXT,
    "status" "DteDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "attempted_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dte_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dte_document_relations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "source_dte_document_id" TEXT NOT NULL,
    "related_dte_document_id" TEXT NOT NULL,
    "relation_type" "DteDocumentRelationType" NOT NULL,
    "reason_code" TEXT,
    "reason_text" TEXT,
    "amount" DECIMAL(10,2),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dte_document_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dte_invalidation_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "dte_document_id" TEXT NOT NULL,
    "invalidation_type_code" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "event_json" JSONB,
    "signed_jws" TEXT,
    "mh_estado" TEXT,
    "mh_sello_recibido" TEXT,
    "mh_codigo_msg" TEXT,
    "mh_descripcion_msg" TEXT,
    "mh_observaciones" JSONB,
    "status" "DteInvalidationStatus" NOT NULL DEFAULT 'DRAFT',
    "requested_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "last_error" TEXT,
    "requested_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dte_invalidation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dte_catalog_items_catalog_code_idx" ON "dte_catalog_items"("catalog_code");

-- CreateIndex
CREATE INDEX "dte_catalog_items_catalog_code_is_active_idx" ON "dte_catalog_items"("catalog_code", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "dte_catalog_items_catalog_code_item_code_version_key" ON "dte_catalog_items"("catalog_code", "item_code", "version");

-- CreateIndex
CREATE INDEX "dte_rendered_documents_tenant_id_location_id_idx" ON "dte_rendered_documents"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "dte_rendered_documents_dte_document_id_idx" ON "dte_rendered_documents"("dte_document_id");

-- CreateIndex
CREATE INDEX "dte_rendered_documents_status_idx" ON "dte_rendered_documents"("status");

-- CreateIndex
CREATE INDEX "dte_deliveries_tenant_id_location_id_idx" ON "dte_deliveries"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "dte_deliveries_dte_document_id_idx" ON "dte_deliveries"("dte_document_id");

-- CreateIndex
CREATE INDEX "dte_deliveries_delivery_type_idx" ON "dte_deliveries"("delivery_type");

-- CreateIndex
CREATE INDEX "dte_deliveries_status_idx" ON "dte_deliveries"("status");

-- CreateIndex
CREATE INDEX "dte_document_relations_tenant_id_location_id_idx" ON "dte_document_relations"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "dte_document_relations_source_dte_document_id_idx" ON "dte_document_relations"("source_dte_document_id");

-- CreateIndex
CREATE INDEX "dte_document_relations_related_dte_document_id_idx" ON "dte_document_relations"("related_dte_document_id");

-- CreateIndex
CREATE INDEX "dte_invalidation_events_tenant_id_location_id_idx" ON "dte_invalidation_events"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "dte_invalidation_events_dte_document_id_idx" ON "dte_invalidation_events"("dte_document_id");

-- CreateIndex
CREATE INDEX "dte_invalidation_events_status_idx" ON "dte_invalidation_events"("status");

-- AddForeignKey
ALTER TABLE "dte_rendered_documents" ADD CONSTRAINT "dte_rendered_documents_dte_document_id_fkey" FOREIGN KEY ("dte_document_id") REFERENCES "dte_outgoing_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_rendered_documents" ADD CONSTRAINT "dte_rendered_documents_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_deliveries" ADD CONSTRAINT "dte_deliveries_dte_document_id_fkey" FOREIGN KEY ("dte_document_id") REFERENCES "dte_outgoing_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_deliveries" ADD CONSTRAINT "dte_deliveries_rendered_document_id_fkey" FOREIGN KEY ("rendered_document_id") REFERENCES "dte_rendered_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_deliveries" ADD CONSTRAINT "dte_deliveries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_document_relations" ADD CONSTRAINT "dte_document_relations_source_dte_document_id_fkey" FOREIGN KEY ("source_dte_document_id") REFERENCES "dte_outgoing_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_document_relations" ADD CONSTRAINT "dte_document_relations_related_dte_document_id_fkey" FOREIGN KEY ("related_dte_document_id") REFERENCES "dte_outgoing_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_document_relations" ADD CONSTRAINT "dte_document_relations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_invalidation_events" ADD CONSTRAINT "dte_invalidation_events_dte_document_id_fkey" FOREIGN KEY ("dte_document_id") REFERENCES "dte_outgoing_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_invalidation_events" ADD CONSTRAINT "dte_invalidation_events_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
