-- MH20 — M1b mh20_spec_profile_audit (runtime). Fase 5.1E.
-- Independiente de M1 (20261124000000_mh20_spec_profile), que no se modifica.
--
-- Solo aditiva: crea una tabla nueva e inmutable para auditar cambios de
-- DteIssuerConfig.mh_spec_profile (actor, fecha, valor anterior y nuevo).
-- No toca tablas existentes, documentos, eventos ni correlativos.
-- Reversión operativa: la tabla puede quedar vacía; DROP solo por decisión explícita.

-- CreateTable
CREATE TABLE "dte_spec_profile_audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "issuer_config_id" TEXT NOT NULL,
    "environment" "DteEnvironment" NOT NULL,
    "previous_profile" TEXT,
    "new_profile" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL,
    "changed_by_scope" TEXT,
    "reason" TEXT NOT NULL,
    "warnings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dte_spec_profile_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dte_spec_profile_audit_logs_tenant_id_location_id_idx" ON "dte_spec_profile_audit_logs"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "dte_spec_profile_audit_logs_issuer_config_id_created_at_idx" ON "dte_spec_profile_audit_logs"("issuer_config_id", "created_at");

-- AddForeignKey
ALTER TABLE "dte_spec_profile_audit_logs" ADD CONSTRAINT "dte_spec_profile_audit_logs_issuer_config_id_fkey" FOREIGN KEY ("issuer_config_id") REFERENCES "dte_issuer_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Valores admitidos (mismo dominio que M1)
ALTER TABLE "dte_spec_profile_audit_logs" ADD CONSTRAINT "dte_spec_profile_audit_logs_previous_profile_chk"
  CHECK ("previous_profile" IS NULL OR "previous_profile" IN ('MH_1_2', 'MH_2_0'));
ALTER TABLE "dte_spec_profile_audit_logs" ADD CONSTRAINT "dte_spec_profile_audit_logs_new_profile_chk"
  CHECK ("new_profile" IN ('MH_1_2', 'MH_2_0'));
ALTER TABLE "dte_spec_profile_audit_logs" ADD CONSTRAINT "dte_spec_profile_audit_logs_reason_chk"
  CHECK (length(btrim("reason")) >= 10);
