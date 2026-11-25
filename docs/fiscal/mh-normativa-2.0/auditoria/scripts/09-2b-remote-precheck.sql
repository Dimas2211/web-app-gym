-- MH 2.0 Fase 9.2B — PRE-CHECK remoto (SOLO LECTURA). Ejecutar con psql -X -q -v ON_ERROR_STOP=1 -f.
-- Debe imprimir transaction_read_only|on. Criterios de paso en 09-2b-remote-migration-runbook.md §3.
SET client_encoding=UTF8;
\pset pager off
\t on
\a
BEGIN TRANSACTION READ ONLY;
SELECT 'transaction_read_only', current_setting('transaction_read_only');
SELECT 'db_name', current_database();
SELECT 'mig_rows', count(*) FROM _prisma_migrations;
SELECT 'mig_distinct_applied', count(DISTINCT migration_name) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) FROM _prisma_migrations;
SELECT 'mig_failed', count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;
SELECT 'mig_latest', string_agg(migration_name, ',' ORDER BY migration_name) FROM (SELECT DISTINCT migration_name FROM _prisma_migrations WHERE migration_name >= '20261116' ) x;
SELECT 'checksum_gcl', string_agg(DISTINCT checksum, ',') FROM _prisma_migrations WHERE migration_name='20261119000000_gym_customer_links';
SELECT 'col_fiscal_year', count(*) FROM information_schema.columns WHERE table_name='dte_outgoing_documents' AND column_name='fiscal_year';
SELECT 'col_mh_spec_profile', count(*) FROM information_schema.columns WHERE table_name='dte_issuer_configs' AND column_name='mh_spec_profile';
SELECT 'tbl_m4_profiles', to_regclass('public.platform_dte_mh_test_run_profiles') IS NOT NULL;
SELECT 'tbl_mh_test_runs', to_regclass('public.platform_dte_mh_test_runs') IS NOT NULL;
SELECT 'docs_total', count(*) FROM dte_outgoing_documents;
SELECT 'docs_with_number', count(*) FROM dte_outgoing_documents WHERE control_number IS NOT NULL;
-- COR-01 pre-check: same classification as migration step 2, computed read-only.
SELECT 'cor01_would_assign', count(*) FILTER (WHERE ok), 'cor01_ambiguous', count(*) FILTER (WHERE NOT ok)
  FROM (SELECT (EXTRACT(YEAR FROM created_at - INTERVAL '6 hours') = EXTRACT(YEAR FROM created_at))
           AND ( NOT coalesce((json_document -> 'identificacion') ? 'fecEmi', false)
              OR ( (json_document->'identificacion'->>'fecEmi') ~ '^\d{4}-\d{2}-\d{2}$'
                   AND substr(json_document->'identificacion'->>'fecEmi',1,4)::int = EXTRACT(YEAR FROM created_at - INTERVAL '6 hours')::int)) AS ok
          FROM dte_outgoing_documents WHERE control_number IS NOT NULL) e;
SELECT 'dup_tenant_env_control', count(*) FROM (SELECT tenant_id, environment, control_number FROM dte_outgoing_documents WHERE control_number IS NOT NULL GROUP BY 1,2,3 HAVING count(*)>1) d;
SELECT 'docs_md5', md5(coalesce(string_agg(concat_ws('|',id,control_number,generation_code,md5(coalesce(json_document::text,'')),md5(coalesce(signed_jws::text,'')),reception_stamp,dte_status),',' ORDER BY id),'')) FROM dte_outgoing_documents;
SELECT 'correlatives', count(*)||':'||md5(coalesce(string_agg(concat_ws('|',id,year,last_sequence,updated_at),',' ORDER BY id),'')) FROM dte_correlatives;
SELECT 'issuers_by_env_active', string_agg(environment||'='||n, ',') FROM (SELECT environment::text, count(*) n FROM dte_issuer_configs WHERE is_active GROUP BY 1 ORDER BY 1) x;
SELECT 'idx_old_unique', to_regclass('public.dte_outgoing_documents_tenant_id_environment_control_number_key') IS NOT NULL;
ROLLBACK;
