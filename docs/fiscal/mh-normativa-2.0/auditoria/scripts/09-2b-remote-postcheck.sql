-- MH 2.0 Fase 9.2B — POST-CHECK remoto (SOLO LECTURA), tras `prisma migrate deploy`.
-- Ejecutar con psql -X -q -v ON_ERROR_STOP=1 -f. Criterios en 09-2b-remote-migration-runbook.md §5.
SET client_encoding=UTF8;
\pset pager off
\t on
\a
BEGIN TRANSACTION READ ONLY;
SELECT 'transaction_read_only', current_setting('transaction_read_only');
SELECT 'mig_distinct_applied', count(DISTINCT migration_name) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) FROM _prisma_migrations;
SELECT 'mig_failed', count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;
-- Checksums esperados (blob LF del repo, 09-2a-migration-inventory.md §1).
SELECT 'checksum', m.name, CASE WHEN p.checksum = m.expected THEN 'OK' ELSE 'MISMATCH:' || coalesce(left(p.checksum, 8), 'ABSENT') END
  FROM (VALUES
    ('20261124000000_mh20_spec_profile',               'cbc9732f3f7bf507caa1e5eb0660f6b3c5ae908f01b1179cf470ebcdd20a4a9b'),
    ('20261124010000_mh20_spec_profile_audit',         '3c448b049da4a29780502f3fd1758e4024fc0249cc4e50ab16d3bfbbbb1b67ef'),
    ('20261124020000_mh20_return_events',              '353ba6dd8d1ec5fcd86e33b56e9523d1e6f54e614098826fff7d7d8aa3ed08ca'),
    ('20261124030000_mh20_mh_test_run_profiles',       '8a37aaa8f683bbf12a2c064b0c5540edfd62664094ed0f815067ee00815b9ba7'),
    ('20261125000000_cor01_fiscal_year',               '605939bf066f3d193b774cd52f259a523dc50675291fc93f29b03efa297d2d42'),
    ('20261125010000_mh20_mh_test_run_profile_org_fk', 'cf375e12fd595392e49042d7a3c7f808915c4e71dc68cb62b245806c1ad1dffc')
  ) AS m(name, expected)
  LEFT JOIN LATERAL (SELECT checksum FROM _prisma_migrations WHERE migration_name = m.name AND finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1) p ON true;
-- M1: columnas nullable; todos los emisores existentes quedan en NULL (= MH 1.2).
SELECT 'm1_issuers_profile_not_null', count(*) FROM dte_issuer_configs WHERE mh_spec_profile IS NOT NULL;
SELECT 'm1_docs_profile_not_null', count(*) FROM dte_outgoing_documents WHERE mh_spec_profile IS NOT NULL;
-- M1b / M2 / M4: tablas nuevas y vacías.
SELECT 'm1b_spec_profile_audit_rows', count(*) FROM dte_spec_profile_audit_logs;
SELECT 'm2_return_events_rows', count(*) FROM dte_return_events;
SELECT 'm4_run_profiles_rows', count(*) FROM platform_dte_mh_test_run_profiles;
-- M4/M5: integridad de organización (debe ser 0) y catálogo de constraints.
SELECT 'm5_incoherent_profiles', count(*) FROM platform_dte_mh_test_run_profiles p JOIN platform_dte_mh_test_runs r ON r.id = p.run_id WHERE p.organization_id <> r.organization_id;
SELECT 'm5_fk_present', count(*) FROM pg_constraint WHERE conname = 'platform_dte_mh_test_run_profiles_run_id_organization_id_fkey' AND convalidated;
SELECT 'm5_unique_present', to_regclass('public.platform_dte_mh_test_runs_id_organization_id_key') IS NOT NULL;
-- COR-01: backfill, ambiguos y unicidad.
SELECT 'cor01_docs_total', count(*) FROM dte_outgoing_documents;
SELECT 'cor01_fiscal_year_dist', coalesce(string_agg(coalesce(fiscal_year::text, 'NULL') || '=' || n, ',' ORDER BY fiscal_year), '') FROM (SELECT fiscal_year, count(*) n FROM dte_outgoing_documents WHERE control_number IS NOT NULL GROUP BY 1) x;
SELECT 'cor01_ambiguous', count(*) FROM dte_outgoing_documents WHERE fiscal_year IS NULL AND control_number IS NOT NULL;
SELECT 'cor01_old_unique_absent', to_regclass('public.dte_outgoing_documents_tenant_id_environment_control_number_key') IS NULL;
SELECT 'cor01_new_unique_present', to_regclass('public.dte_outgoing_documents_tenant_id_environment_fiscal_year_co_key') IS NOT NULL;
SELECT 'cor01_legacy_partial_present', to_regclass('public.dte_outgoing_documents_legacy_control_number_key') IS NOT NULL;
SELECT 'cor01_check_present', count(*) FROM pg_constraint WHERE conname = 'dte_outgoing_documents_fiscal_year_chk';
-- Huellas: docs_md5 y correlatives deben ser IDÉNTICOS al pre-check (fiscal_year y mh_spec_profile no entran en la huella).
SELECT 'docs_md5', md5(coalesce(string_agg(concat_ws('|',id,control_number,generation_code,md5(coalesce(json_document::text,'')),md5(coalesce(signed_jws::text,'')),reception_stamp,dte_status),',' ORDER BY id),'')) FROM dte_outgoing_documents;
SELECT 'correlatives', count(*)||':'||md5(coalesce(string_agg(concat_ws('|',id,year,last_sequence,updated_at),',' ORDER BY id),'')) FROM dte_correlatives;
SELECT 'issuers_by_env_active', string_agg(environment||'='||n, ',') FROM (SELECT environment::text, count(*) n FROM dte_issuer_configs WHERE is_active GROUP BY 1 ORDER BY 1) x;
ROLLBACK;
