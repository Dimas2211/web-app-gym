-- MH 2.0 Fase 9.2B — Backfill COR-01 POSTERIOR AL DEPLOY (ESCRITURA; requiere autorización propia).
-- Asigna fiscal_year a los documentos insertados por el código viejo (fiscal_year NULL) entre
-- `migrate deploy` y la promoción del deployment nuevo. Misma regla que el paso 2 de
-- 20261125000000_cor01_fiscal_year; idempotente (solo filas con fiscal_year IS NULL).
--
-- Por defecto TERMINA EN ROLLBACK (ensayo). Para confirmar:  psql -v apply=true -f <este archivo>
-- No toca dte_correlatives, JSON, firmas, sellos ni estados.
SET client_encoding=UTF8;
\pset pager off
\t on
\a
\if :{?apply}
\else
  \set apply false
\endif
BEGIN;
SELECT 'before_null_with_number', count(*) FROM dte_outgoing_documents WHERE fiscal_year IS NULL AND control_number IS NOT NULL;
SELECT 'before_docs_md5', md5(coalesce(string_agg(concat_ws('|',id,control_number,generation_code,md5(coalesce(json_document::text,'')),md5(coalesce(signed_jws::text,'')),reception_stamp,dte_status),',' ORDER BY id),'')) FROM dte_outgoing_documents;

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
       AND "fiscal_year" IS NULL
  ) ev
 WHERE d.id = ev.id
   AND d."fiscal_year" IS NULL
   AND ev.reserved_year_sv = ev.reserved_year_utc
   AND (
         (ev.has_fec_emi IS NOT TRUE)
      OR (ev.fec_emi_year IS NOT NULL AND ev.fec_emi_year = ev.reserved_year_sv)
   );

SELECT 'after_null_with_number (ambiguous, keep NULL)', count(*) FROM dte_outgoing_documents WHERE fiscal_year IS NULL AND control_number IS NOT NULL;
SELECT 'after_docs_md5 (must equal before)', md5(coalesce(string_agg(concat_ws('|',id,control_number,generation_code,md5(coalesce(json_document::text,'')),md5(coalesce(signed_jws::text,'')),reception_stamp,dte_status),',' ORDER BY id),'')) FROM dte_outgoing_documents;
SELECT 'fiscal_year_dist', coalesce(string_agg(coalesce(fiscal_year::text,'NULL')||'='||n, ',' ORDER BY fiscal_year), '') FROM (SELECT fiscal_year, count(*) n FROM dte_outgoing_documents WHERE control_number IS NOT NULL GROUP BY 1) x;
\if :apply
  COMMIT;
  \echo COR01_POST_DEPLOY_BACKFILL=COMMITTED
\else
  ROLLBACK;
  \echo COR01_POST_DEPLOY_BACKFILL=ROLLED_BACK_DRY_RUN
\endif
