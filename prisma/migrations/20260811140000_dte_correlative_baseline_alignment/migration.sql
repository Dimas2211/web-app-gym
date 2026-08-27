-- F3-C24 — Alineación inicial de correlativos DTE
--
-- 1. Agrega issuer_config_id / cod_estable_mh / cod_punto_venta_mh a
--    dte_correlatives (nullable primero para permitir backfill seguro).
-- 2. Agrega campos de baseline externo (punto de partida traído de un
--    sistema de facturación anterior), todos opcionales.
-- 3. Backfilla issuer_config_id + códigos MH desde dte_issuer_configs,
--    haciendo match por (tenant_id, location_id, environment) — hoy
--    DteIssuerConfig es único por esa combinación, así que el backfill
--    es determinístico y no ambiguo.
-- 4. Deja issuer_config_id como NOT NULL y agrega su FK.
-- 5. Reemplaza el unique constraint anterior por uno que incluye
--    issuer_config_id explícitamente en la clave de partición.

-- ── 1. Columnas nuevas (nullable) ──────────────────────────────────
ALTER TABLE "dte_correlatives"
  ADD COLUMN "issuer_config_id" TEXT,
  ADD COLUMN "cod_estable_mh" TEXT,
  ADD COLUMN "cod_punto_venta_mh" TEXT,
  ADD COLUMN "external_baseline_last_used_sequence" INTEGER,
  ADD COLUMN "external_baseline_source" TEXT,
  ADD COLUMN "external_baseline_notes" TEXT,
  ADD COLUMN "external_baseline_evidence_ref" TEXT,
  ADD COLUMN "external_baseline_set_by" TEXT,
  ADD COLUMN "external_baseline_set_at" TIMESTAMP(3);

-- ── 2. Backfill desde dte_issuer_configs (match único garantizado hoy
--       por el unique constraint tenant_id+location_id+environment) ──
UPDATE "dte_correlatives" AS c
SET
  "issuer_config_id"   = i."id",
  "cod_estable_mh"     = i."cod_estable_mh",
  "cod_punto_venta_mh" = i."cod_punto_venta_mh"
FROM "dte_issuer_configs" AS i
WHERE i."tenant_id" = c."tenant_id"
  AND i."location_id" = c."location_id"
  AND i."environment" = c."environment";

-- Filas de dte_correlatives sin DteIssuerConfig correspondiente (no
-- deberían existir en la práctica, ya que numeroControl requiere un
-- emisor configurado) quedarían con issuer_config_id NULL y romperían
-- el paso 3. Si esto ocurre, es una inconsistencia de datos real que
-- debe resolverse manualmente antes de continuar.
DO $$
DECLARE orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM "dte_correlatives" WHERE "issuer_config_id" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'dte_correlatives tiene % fila(s) sin DteIssuerConfig correspondiente (tenant_id/location_id/environment). Resuelva manualmente antes de aplicar esta migración.', orphan_count;
  END IF;
END $$;

-- ── 3. issuer_config_id pasa a ser obligatorio ─────────────────────
ALTER TABLE "dte_correlatives" ALTER COLUMN "issuer_config_id" SET NOT NULL;

-- ── 4. Reemplazar unique constraint anterior ───────────────────────
DROP INDEX "dte_correlatives_tenant_id_location_id_environment_dte_type_key";

CREATE UNIQUE INDEX "dte_correlatives_tenant_id_location_id_issuer_config_id_e_key"
  ON "dte_correlatives"("tenant_id", "location_id", "issuer_config_id", "environment", "dte_type_code", "year");

CREATE INDEX "dte_correlatives_issuer_config_id_idx" ON "dte_correlatives"("issuer_config_id");

-- ── 5. Foreign keys ─────────────────────────────────────────────────
ALTER TABLE "dte_correlatives"
  ADD CONSTRAINT "dte_correlatives_issuer_config_id_fkey"
  FOREIGN KEY ("issuer_config_id") REFERENCES "dte_issuer_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dte_correlatives"
  ADD CONSTRAINT "dte_correlatives_external_baseline_set_by_fkey"
  FOREIGN KEY ("external_baseline_set_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
