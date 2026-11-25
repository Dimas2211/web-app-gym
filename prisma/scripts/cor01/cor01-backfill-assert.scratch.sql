-- COR-01 — aserciones del backfill de M-COR-01 (SOLO bases desechables).
-- Ver cor01-backfill-fixture.scratch.sql. Falla con RAISE EXCEPTION.

DO $$
DECLARE
  v_bad   INT;
  v_fp    INT;
  v_row   RECORD;
BEGIN
  IF current_database() !~ '_scratch_' THEN
    RAISE EXCEPTION 'COR01_ASSERT_REFUSED: database % is not a _scratch_ database', current_database();
  END IF;

  -- Resultado esperado por caso.
  SELECT COUNT(*) INTO v_bad FROM (VALUES
      ('cor01-A', 2026), ('cor01-B', 2026), ('cor01-C', NULL), ('cor01-D', NULL),
      ('cor01-E', NULL), ('cor01-F', NULL), ('cor01-G', 2026), ('cor01-H', 2025)
    ) AS e(id, fy)
    JOIN dte_outgoing_documents d ON d.id = e.id
   WHERE d.fiscal_year IS DISTINCT FROM e.fy;
  IF v_bad > 0 THEN
    FOR v_row IN SELECT id, fiscal_year FROM dte_outgoing_documents WHERE id LIKE 'cor01-%' ORDER BY id LOOP
      RAISE NOTICE '% → %', v_row.id, v_row.fiscal_year;
    END LOOP;
    RAISE EXCEPTION 'COR01_ASSERT: % fixture rows with unexpected fiscal_year', v_bad;
  END IF;

  -- Nada más cambió (número, JSON, estado, created_at).
  SELECT COUNT(*) INTO v_fp
    FROM cor01_fixture_fingerprint f
    JOIN dte_outgoing_documents d ON d.id = f.id
   WHERE f.fp <> md5(coalesce(d.control_number, '') || '|' || coalesce(d.json_document::text, '') || '|' || d.dte_status::text || '|' || d.created_at::text);
  IF v_fp > 0 THEN
    RAISE EXCEPTION 'COR01_ASSERT: % fixture rows changed beyond fiscal_year', v_fp;
  END IF;

  -- Índices esperados.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'dte_outgoing_documents_tenant_id_environment_fiscal_year_co_key') THEN
    RAISE EXCEPTION 'COR01_ASSERT: per-year unique index missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'dte_outgoing_documents_legacy_control_number_key' AND indexdef ILIKE '%WHERE (fiscal_year IS NULL)%') THEN
    RAISE EXCEPTION 'COR01_ASSERT: legacy partial unique index missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'dte_outgoing_documents_tenant_id_environment_control_number_key') THEN
    RAISE EXCEPTION 'COR01_ASSERT: old unique index still present';
  END IF;

  -- Guardián parcial: un segundo heredado NULL con el número de C debe fallar.
  BEGIN
    INSERT INTO dte_outgoing_documents (id, tenant_id, location_id, dte_type_code, environment, control_number, dte_status, retry_count, updated_at)
    VALUES ('cor01-dup', 'cor01-t', 'cor01-l', '01', 'TEST', 'DTE-01-M001P001-000000000000003', 'PENDING_GENERATION', 0, now());
    RAISE EXCEPTION 'COR01_ASSERT: legacy duplicate was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Reinicio: 2027 puede reutilizar el número de A; 2026 no.
  INSERT INTO dte_outgoing_documents (id, tenant_id, location_id, dte_type_code, environment, control_number, fiscal_year, dte_status, retry_count, updated_at)
  VALUES ('cor01-2027', 'cor01-t', 'cor01-l', '01', 'TEST', 'DTE-01-M001P001-000000000000001', 2027, 'PENDING_GENERATION', 0, now());
  BEGIN
    INSERT INTO dte_outgoing_documents (id, tenant_id, location_id, dte_type_code, environment, control_number, fiscal_year, dte_status, retry_count, updated_at)
    VALUES ('cor01-2026dup', 'cor01-t', 'cor01-l', '01', 'TEST', 'DTE-01-M001P001-000000000000001', 2026, 'PENDING_GENERATION', 0, now());
    RAISE EXCEPTION 'COR01_ASSERT: same-year duplicate was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Rango del CHECK.
  BEGIN
    UPDATE dte_outgoing_documents SET fiscal_year = 26 WHERE id = 'cor01-2027';
    RAISE EXCEPTION 'COR01_ASSERT: fiscal_year range check not enforced';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE 'COR01_ASSERT_PASS';
END;
$$;
