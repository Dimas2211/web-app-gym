-- ─────────────────────────────────────────────────────────────────
-- MH20 (Fase 6) — M2 mh20_return_events (runtime, común).
--
-- SOLO ADITIVA: 1 enum + 3 tablas nuevas + índices + FK + CHECK.
-- No altera ninguna tabla ni fila existente. En particular NO relaja
-- dte_invalidation_events.dte_document_id ni dte_contingency_event_items
-- .dte_document_id (alternativa más segura que la de 04-plan-migraciones.md
-- §M2; justificación en docs/fiscal/mh-normativa-2.0/auditoria/06-migration-status.md):
-- la invalidación de un Retorno vive en dte_return_invalidation_events,
-- con FK NOT NULL al Retorno.
--
-- Sin backfill. Sin seeds. Sin cambios de correlativos. Rollback operativo:
-- tablas vacías (interruptor DTE_MH20_PROFILE_ENABLED OFF). DROP solo con
-- decisión explícita y si no hay filas.
-- ─────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "DteReturnStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'SENT', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "dte_return_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "issuer_config_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "generation_code" TEXT NOT NULL,
    "origin_dte_type_code" TEXT NOT NULL,
    "reason" TEXT,
    "event_json" JSONB,
    "signed_jws" TEXT,
    "mh_estado" TEXT,
    "mh_sello_recibido" TEXT,
    "mh_codigo_msg" TEXT,
    "mh_descripcion_msg" TEXT,
    "mh_observaciones" JSONB,
    "status" "DteReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "transmission_type_code" TEXT NOT NULL DEFAULT '1',
    "mh_spec_profile" TEXT NOT NULL DEFAULT 'MH_2_0',
    "total_returned" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "requested_at" TIMESTAMP(3),
    "signed_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "last_error" TEXT,
    "requested_by" TEXT,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dte_return_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dte_return_event_items" (
    "id" TEXT NOT NULL,
    "return_event_id" TEXT NOT NULL,
    "dte_document_id" TEXT NOT NULL,
    "no_item" INTEGER NOT NULL,
    "source_item_no" INTEGER NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL,
    "returned_amount" DECIMAL(14,2) NOT NULL,
    "returned_tax" DECIMAL(14,2) NOT NULL,
    "line_detail" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dte_return_event_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dte_return_invalidation_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "return_event_id" TEXT NOT NULL,
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
    "mh_spec_profile" TEXT NOT NULL DEFAULT 'MH_2_0',
    "requested_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "last_error" TEXT,
    "requested_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dte_return_invalidation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dte_return_events_tenant_id_location_id_idx" ON "dte_return_events"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "dte_return_events_issuer_config_id_idx" ON "dte_return_events"("issuer_config_id");

-- CreateIndex
CREATE INDEX "dte_return_events_status_idx" ON "dte_return_events"("status");

-- CreateIndex
CREATE UNIQUE INDEX "dte_return_events_tenant_id_environment_generation_code_key" ON "dte_return_events"("tenant_id", "environment", "generation_code");

-- CreateIndex
CREATE INDEX "dte_return_event_items_dte_document_id_idx" ON "dte_return_event_items"("dte_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "dte_return_event_items_return_event_id_no_item_key" ON "dte_return_event_items"("return_event_id", "no_item");

-- CreateIndex
CREATE UNIQUE INDEX "dte_return_event_items_return_event_id_dte_document_id_sour_key" ON "dte_return_event_items"("return_event_id", "dte_document_id", "source_item_no");

-- CreateIndex
CREATE INDEX "dte_return_invalidation_events_tenant_id_location_id_idx" ON "dte_return_invalidation_events"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "dte_return_invalidation_events_return_event_id_idx" ON "dte_return_invalidation_events"("return_event_id");

-- CreateIndex
CREATE INDEX "dte_return_invalidation_events_status_idx" ON "dte_return_invalidation_events"("status");

-- AddForeignKey
ALTER TABLE "dte_return_events" ADD CONSTRAINT "dte_return_events_issuer_config_id_fkey" FOREIGN KEY ("issuer_config_id") REFERENCES "dte_issuer_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_return_event_items" ADD CONSTRAINT "dte_return_event_items_return_event_id_fkey" FOREIGN KEY ("return_event_id") REFERENCES "dte_return_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_return_event_items" ADD CONSTRAINT "dte_return_event_items_dte_document_id_fkey" FOREIGN KEY ("dte_document_id") REFERENCES "dte_outgoing_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dte_return_invalidation_events" ADD CONSTRAINT "dte_return_invalidation_events_return_event_id_fkey" FOREIGN KEY ("return_event_id") REFERENCES "dte_return_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── CHECK (reglas de integridad; la regla acumulada MH20-059 vive en el
--    servicio con lock de fila sobre dte_outgoing_documents) ─────────
ALTER TABLE "dte_return_events" ADD CONSTRAINT "dte_return_events_origin_type_chk"
  CHECK ("origin_dte_type_code" IN ('01', '11', '14'));
ALTER TABLE "dte_return_events" ADD CONSTRAINT "dte_return_events_mh_spec_profile_chk"
  CHECK ("mh_spec_profile" = 'MH_2_0');
ALTER TABLE "dte_return_events" ADD CONSTRAINT "dte_return_events_environment_chk"
  CHECK ("environment" IN ('TEST', 'PRODUCTION'));
ALTER TABLE "dte_return_events" ADD CONSTRAINT "dte_return_events_transmission_type_chk"
  CHECK ("transmission_type_code" IN ('1', '2'));
ALTER TABLE "dte_return_events" ADD CONSTRAINT "dte_return_events_total_returned_chk"
  CHECK ("total_returned" >= 0);

ALTER TABLE "dte_return_event_items" ADD CONSTRAINT "dte_return_event_items_no_item_chk"
  CHECK ("no_item" BETWEEN 1 AND 2000);
ALTER TABLE "dte_return_event_items" ADD CONSTRAINT "dte_return_event_items_amounts_chk"
  CHECK ("quantity" > 0 AND "returned_amount" >= 0 AND "returned_tax" >= 0);

ALTER TABLE "dte_return_invalidation_events" ADD CONSTRAINT "dte_return_invalidation_events_mh_spec_profile_chk"
  CHECK ("mh_spec_profile" = 'MH_2_0');
ALTER TABLE "dte_return_invalidation_events" ADD CONSTRAINT "dte_return_invalidation_events_type_chk"
  CHECK ("invalidation_type_code" = '2');
