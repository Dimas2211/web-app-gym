-- COR-01 — fixture de backfill para M-COR-01 (SOLO bases desechables).
-- Requiere una base con las migraciones hasta 20261124030000 y SIN
-- 20261125000000_cor01_fiscal_year. Luego aplicar la migración y correr
-- cor01-backfill-assert.scratch.sql.
--
--   psql -v ON_ERROR_STOP=1 -d <scratch> -f cor01-backfill-fixture.scratch.sql
--   psql -1 -v ON_ERROR_STOP=1 -d <scratch> -f ../../migrations/20261125000000_cor01_fiscal_year/migration.sql
--   psql -v ON_ERROR_STOP=1 -d <scratch> -f cor01-backfill-assert.scratch.sql

DO $$
BEGIN
  IF current_database() !~ '_scratch_' THEN
    RAISE EXCEPTION 'COR01_FIXTURE_REFUSED: database % is not a _scratch_ database', current_database();
  END IF;
END;
$$;

INSERT INTO dte_outgoing_documents (id, tenant_id, location_id, dte_type_code, environment, control_number, dte_status, retry_count, json_document, created_at, updated_at) VALUES
-- A: fecEmi 2026 y created_at 2026 (SV = UTC) → 2026
('cor01-A', 'cor01-t', 'cor01-l', '01', 'TEST', 'DTE-01-M001P001-000000000000001', 'ACCEPTED', 0, '{"identificacion":{"fecEmi":"2026-05-10"}}', '2026-05-10 15:00:00', now()),
-- B: pendiente sin JSON, created_at 2026 sin ambigüedad → 2026 (año de la reserva)
('cor01-B', 'cor01-t', 'cor01-l', '01', 'TEST', 'DTE-01-M001P001-000000000000002', 'PENDING_GENERATION', 0, NULL, '2026-06-01 12:00:00', now()),
-- C: created_at 2027-01-01 03:00 UTC = 2026-12-31 21:00 SV (ventana COR-02) → AMBIGUO
('cor01-C', 'cor01-t', 'cor01-l', '01', 'TEST', 'DTE-01-M001P001-000000000000003', 'PENDING_GENERATION', 0, NULL, '2027-01-01 03:00:00', now()),
-- D: fecEmi 2027 pero reservado en 2026 (12:00 UTC) → AMBIGUO (años distintos)
('cor01-D', 'cor01-t', 'cor01-l', '01', 'TEST', 'DTE-01-M001P001-000000000000004', 'ACCEPTED', 0, '{"identificacion":{"fecEmi":"2027-01-01"}}', '2026-12-31 12:00:00', now()),
-- E: fecEmi malformado → AMBIGUO
('cor01-E', 'cor01-t', 'cor01-l', '01', 'TEST', 'DTE-01-M001P001-000000000000005', 'GENERATED', 0, '{"identificacion":{"fecEmi":"31/12/2026"}}', '2026-07-01 12:00:00', now()),
-- F: sin numeroControl → NULL (no aplica)
('cor01-F', 'cor01-t', 'cor01-l', '01', 'TEST', NULL, 'NOT_REQUIRED', 0, NULL, '2026-07-01 12:00:00', now()),
-- G: mismo número que A en PRODUCTION → 2026, sin colisión (ambientes separados)
('cor01-G', 'cor01-t', 'cor01-l', '01', 'PRODUCTION', 'DTE-01-M001P001-000000000000001', 'ACCEPTED', 0, '{"identificacion":{"fecEmi":"2026-05-10"}}', '2026-05-10 15:00:00', now()),
-- H: fecEmi 2025 y created_at 2025 → 2025 (ejercicio anterior se conserva)
('cor01-H', 'cor01-t', 'cor01-l', '03', 'TEST', 'DTE-03-M001P001-000000000000009', 'ACCEPTED', 0, '{"identificacion":{"fecEmi":"2025-11-30"}}', '2025-11-30 20:00:00', now());

-- Huella del contenido que la migración NO debe tocar.
CREATE TABLE cor01_fixture_fingerprint AS
SELECT id, md5(coalesce(control_number, '') || '|' || coalesce(json_document::text, '') || '|' || dte_status::text || '|' || created_at::text) AS fp
  FROM dte_outgoing_documents WHERE id LIKE 'cor01-%';
