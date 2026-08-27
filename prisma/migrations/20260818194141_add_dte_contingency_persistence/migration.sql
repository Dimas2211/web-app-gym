-- CreateEnum
CREATE TYPE "DteContingencyStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'SENT', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "dte_outgoing_documents" ADD COLUMN     "contingency_reason" TEXT,
ADD COLUMN     "contingency_type_code" TEXT,
ADD COLUMN     "transmission_type_code" TEXT NOT NULL DEFAULT '1';

-- CreateTable
CREATE TABLE "dte_contingency_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "contingency_type_code" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "period_start_date" DATE,
    "period_start_time" TEXT,
    "period_end_date" DATE,
    "period_end_time" TEXT,
    "event_json" JSONB,
    "signed_jws" TEXT,
    "mh_estado" TEXT,
    "mh_sello_recibido" TEXT,
    "mh_codigo_msg" TEXT,
    "mh_descripcion_msg" TEXT,
    "mh_observaciones" JSONB,
    "status" "DteContingencyStatus" NOT NULL DEFAULT 'DRAFT',
    "requested_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "requested_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dte_contingency_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dte_contingency_event_items" (
    "id" TEXT NOT NULL,
    "contingency_event_id" TEXT NOT NULL,
    "dte_document_id" TEXT NOT NULL,
    "no_item" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dte_contingency_event_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dte_contingency_events_tenant_id_location_id_idx" ON "dte_contingency_events"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "dte_contingency_events_status_idx" ON "dte_contingency_events"("status");

-- CreateIndex
CREATE INDEX "dte_contingency_event_items_contingency_event_id_idx" ON "dte_contingency_event_items"("contingency_event_id");

-- CreateIndex
CREATE INDEX "dte_contingency_event_items_dte_document_id_idx" ON "dte_contingency_event_items"("dte_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "dte_contingency_event_items_contingency_event_id_dte_docume_key" ON "dte_contingency_event_items"("contingency_event_id", "dte_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "dte_contingency_event_items_contingency_event_id_no_item_key" ON "dte_contingency_event_items"("contingency_event_id", "no_item");

-- AddForeignKey
ALTER TABLE "dte_contingency_events" ADD CONSTRAINT "dte_contingency_events_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_contingency_event_items" ADD CONSTRAINT "dte_contingency_event_items_contingency_event_id_fkey" FOREIGN KEY ("contingency_event_id") REFERENCES "dte_contingency_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_contingency_event_items" ADD CONSTRAINT "dte_contingency_event_items_dte_document_id_fkey" FOREIGN KEY ("dte_document_id") REFERENCES "dte_outgoing_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "dte_outgoing_documents_tenant_id_environment_control_numb_key" RENAME TO "dte_outgoing_documents_tenant_id_environment_control_number_key";
