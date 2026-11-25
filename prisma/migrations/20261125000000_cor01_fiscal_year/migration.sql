-- ─────────────────────────────────────────────────────────────────
-- COR-01 (M-COR-01) — reinicio anual del numeroControl (runtime, común).
-- Decisión: docs/fiscal/mh-normativa-2.0/decisiones/COR-01-reinicio-anual.md
-- (opción B: fiscal_year persistido + backfill de solo lectura).
--
-- Independiente de las migraciones anteriores (no las modifica).
--
-- Qué hace:
--   1. ADD COLUMN dte_outgoing_documents.fiscal_year INT NULL (sin DEFAULT:
--      instantáneo, sin reescritura de tabla).
--   2. Backfill SOLO de esa columna, y solo cuando la evidencia original es
--      verificable y coincide (nunca la fecha actual):
--        a) identificacion.fecEmi del json_document (fecha fiscal original), y
--        b) created_at (instante de la reserva del número, misma transacción),
--           cuyo año debe ser el mismo en hora de El Salvador (UTC−6) y en UTC
--           (fuera de la ventana 31/12 18:00–23:59 SV, donde el año del
--           correlativo dependía de la zona del proceso: COR-02).
--      Si existe fecEmi, debe coincidir con el año de (b). Si fecEmi existe
--      pero está malformado, o los años no coinciden, el documento queda
--      AMBIGUO: fiscal_year NULL, sin modificar nada más (se informa con
--      RAISE NOTICE y se lista en la consulta de verificación).
--   3. Reemplaza unique (tenant_id, environment, control_number) por
--      unique (tenant_id, environment, fiscal_year, control_number) y agrega un
--      índice único PARCIAL para los heredados ambiguos (fiscal_year NULL),
--      de modo que ningún documento queda sin guardián en la base.
--
-- Qué NO hace:
--   * No toca control_number, json_document, signed_jws, reception_stamp,
--     mh_response ni ningún estado. No renumera ni reasigna nada.
--   * No toca dte_correlatives (su columna `year` ya existe) ni la modalidad
--     de numeración (COR-03).
--
-- Rollback (solo antes de emitir documentos del ejercicio nuevo con secuencia
-- repetida): DROP INDEX de los dos únicos nuevos; CREATE UNIQUE INDEX
-- "dte_outgoing_documents_tenant_id_environment_control_number_key" ON
-- "dte_outgoing_documents"("tenant_id","environment","control_number");
-- ALTER TABLE "dte_outgoing_documents" DROP COLUMN "fiscal_year".
-- ─────────────────────────────────────────────────────────────────

-- 1. Columna -----------------------------------------------------------------
ALTER TABLE "dte_outgoing_documents" ADD COLUMN "fiscal_year" INTEGER;

ALTER TABLE "dte_outgoing_documents" ADD CONSTRAINT "dte_outgoing_documents_fiscal_year_chk"
  CHECK ("fiscal_year" IS NULL OR "fiscal_year" BETWEEN 2000 AND 9999);

-- 2. Backfill de solo lectura (evidencia original) ----------------------------
UPDATE "dte_outgoing_documents" d
   SET "fiscal_year" = ev.reserved_year_sv
  FROM (
    SELECT id,
           EXTRACT(YEAR FROM "created_at" - INTERVAL '6 hours')::int AS reserved_year_sv,
           EXTRACT(YEAR FROM "created_at")::int                      AS reserved_year_utc,
           ("json_document" -> 'identificacion') ? 'fecEmi'          AS has_fec_emi,
           CASE WHEN ("json_document" -> 'identificacion' ->> 'fecEmi') ~ '^\d{4}-\d{2}-\d{2}$'
                THEN substr("json_document" -> 'identificacion' ->> 'fecEmi', 1, 4)::int
           END                                                       AS fec_emi_year
      FROM "dte_outgoing_documents"
     WHERE "control_number" IS NOT NULL
  ) ev
 WHERE d.id = ev.id
   AND d."fiscal_year" IS NULL
   AND ev.reserved_year_sv = ev.reserved_year_utc
   AND (
         (ev.has_fec_emi IS NOT TRUE)
      OR (ev.fec_emi_year IS NOT NULL AND ev.fec_emi_year = ev.reserved_year_sv)
   );

DO $$
DECLARE
  v_assigned  INT;
  v_ambiguous INT;
BEGIN
  SELECT COUNT(*)::int INTO v_assigned  FROM "dte_outgoing_documents" WHERE "fiscal_year" IS NOT NULL;
  SELECT COUNT(*)::int INTO v_ambiguous FROM "dte_outgoing_documents" WHERE "fiscal_year" IS NULL AND "control_number" IS NOT NULL;
  RAISE NOTICE 'COR01_BACKFILL: assigned=% ambiguous=% (ambiguous rows keep fiscal_year NULL and are protected by the legacy partial unique index)', v_assigned, v_ambiguous;
END;
$$;

-- 3. Unicidad por ejercicio -------------------------------------------------
DROP INDEX "dte_outgoing_documents_tenant_id_environment_control_number_key";

CREATE UNIQUE INDEX "dte_outgoing_documents_tenant_id_environment_fiscal_year_co_key"
  ON "dte_outgoing_documents"("tenant_id", "environment", "fiscal_year", "control_number");

-- Heredados ambiguos (no modelado por Prisma).
CREATE UNIQUE INDEX "dte_outgoing_documents_legacy_control_number_key"
  ON "dte_outgoing_documents"("tenant_id", "environment", "control_number")
  WHERE "fiscal_year" IS NULL;
