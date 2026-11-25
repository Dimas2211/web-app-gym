-- MH20 — M1 mh20_spec_profile (runtime, común a todas las organizaciones)
-- Diseño: docs/fiscal/mh-normativa-2.0/auditoria/04-plan-migraciones.md §3 M1.
--
-- Solo aditiva:
--   * ADD COLUMN ... NULL sin DEFAULT (instantáneo en PostgreSQL, sin reescritura).
--   * Sin backfill: NULL = histórico / MH_1_2 (se infiere por identificacion.version).
--   * No toca json_document, signed_jws, mh_response, reception_stamp,
--     event_json ni mh_sello_recibido.
--   * No toca dte_correlatives ni control_number ni sus restricciones.
-- Reversión operativa: dejar las columnas en NULL (DROP COLUMN solo por decisión explícita).

-- AlterTable
ALTER TABLE "dte_issuer_configs" ADD COLUMN "mh_spec_profile" TEXT;
ALTER TABLE "dte_issuer_configs" ADD COLUMN "numbering_modality" TEXT;

-- AlterTable
ALTER TABLE "dte_outgoing_documents" ADD COLUMN "mh_spec_profile" TEXT;

-- AlterTable
ALTER TABLE "dte_invalidation_events" ADD COLUMN "mh_spec_profile" TEXT;

-- AlterTable
ALTER TABLE "dte_contingency_events" ADD COLUMN "mh_spec_profile" TEXT;

-- Valores admitidos (NULL = MH_1_2 / histórico)
ALTER TABLE "dte_issuer_configs" ADD CONSTRAINT "dte_issuer_configs_mh_spec_profile_chk"
  CHECK ("mh_spec_profile" IS NULL OR "mh_spec_profile" IN ('MH_1_2', 'MH_2_0'));
ALTER TABLE "dte_issuer_configs" ADD CONSTRAINT "dte_issuer_configs_numbering_modality_chk"
  CHECK ("numbering_modality" IS NULL OR "numbering_modality" IN ('CENTRALIZED', 'PER_ESTABLISHMENT'));
ALTER TABLE "dte_outgoing_documents" ADD CONSTRAINT "dte_outgoing_documents_mh_spec_profile_chk"
  CHECK ("mh_spec_profile" IS NULL OR "mh_spec_profile" IN ('MH_1_2', 'MH_2_0'));
ALTER TABLE "dte_invalidation_events" ADD CONSTRAINT "dte_invalidation_events_mh_spec_profile_chk"
  CHECK ("mh_spec_profile" IS NULL OR "mh_spec_profile" IN ('MH_1_2', 'MH_2_0'));
ALTER TABLE "dte_contingency_events" ADD CONSTRAINT "dte_contingency_events_mh_spec_profile_chk"
  CHECK ("mh_spec_profile" IS NULL OR "mh_spec_profile" IN ('MH_1_2', 'MH_2_0'));
