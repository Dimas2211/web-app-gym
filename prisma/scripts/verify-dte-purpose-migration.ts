/**
 * verify-dte-purpose-migration.ts — DTE-MH-TEST-RUNS
 *
 * Verificación READ-ONLY de la migración 20261116000000_dte_mh_test_runs en UNA
 * base (Control Plane o runtime de cliente). Es la compuerta previa a desplegar
 * el código: si alguna base que usará el código nuevo no pasa, NO desplegar.
 *
 * - Corre dentro de una transacción READ ONLY: no puede escribir.
 * - No lee .env: la URL se pasa explícitamente en VERIFY_DB_URL (evita apuntar
 *   por accidente a otra base). No imprime la URL ni secretos.
 * - Comprueba: migración registrada, enum, columnas (tipo/default/NOT NULL),
 *   CHECK/FK validadas, índices (incluido el parcial de corrida activa única),
 *   ausencia de NULL en purpose, filas de certificación bien formadas y
 *   conteos por propósito/ambiente.
 *
 * USO:
 *   VERIFY_DB_URL=postgresql://... npx tsx prisma/scripts/verify-dte-purpose-migration.ts
 * Sale con código 0 si todo pasa, 1 si alguna comprobación falla.
 */

import { PrismaClient } from "@prisma/client";

const MIGRATION = "20261116000000_dte_mh_test_runs";

const CONSTRAINTS = [
  "dte_outgoing_cert_shape_chk",
  "dte_outgoing_cert_key_chk",
  "platform_dte_mh_test_runs_env_chk",
  "platform_dte_mh_test_runs_organization_id_fkey",
  "platform_dte_mh_test_run_items_run_id_fkey",
];
const INDEXES = [
  "dte_outgoing_documents_certification_item_key_key",
  "dte_outgoing_documents_tenant_id_purpose_environment_idx",
  "platform_dte_mh_test_run_items_run_id_seq_key",
  "platform_dte_mh_test_run_items_run_id_step_idx",
  "platform_dte_mh_test_runs_status_idx",
  "platform_dte_mh_test_runs_organization_id_created_at_idx",
];
const ONE_ACTIVE = "platform_dte_mh_test_runs_one_active";

type Check = { name: string; ok: boolean; detail?: string };

async function main() {
  const url = process.env.VERIFY_DB_URL;
  if (!url) {
    console.error("Falta VERIFY_DB_URL (la URL de la base a verificar). No se usa .env a propósito.");
    process.exit(2);
  }
  const db = new PrismaClient({ datasources: { db: { url } } });
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");

      const mig = await tx.$queryRaw<Array<{ finished: boolean; rolled_back: boolean }>>`
        SELECT finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
          FROM _prisma_migrations WHERE migration_name = ${MIGRATION}`;
      add("migración registrada y terminada", mig.length === 1 && mig[0].finished && !mig[0].rolled_back,
        mig.length ? JSON.stringify(mig[0]) : "no registrada");

      const en = await tx.$queryRaw<Array<{ v: string }>>`
        SELECT e.enumlabel AS v FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
         WHERE t.typname = 'DteDocumentPurpose' ORDER BY e.enumsortorder`;
      const labels = en.map((r) => r.v).join(",");
      add("enum DteDocumentPurpose", labels === "OPERATIONAL,MH_TEST_CERTIFICATION", labels || "ausente");

      const cols = await tx.$queryRaw<Array<{ column_name: string; udt_name: string; is_nullable: string; column_default: string | null }>>`
        SELECT column_name, udt_name, is_nullable, column_default FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'dte_outgoing_documents'
           AND column_name IN ('purpose', 'certification_item_key')`;
      const purpose = cols.find((c) => c.column_name === "purpose");
      add("columna purpose NOT NULL DEFAULT 'OPERATIONAL'",
        !!purpose && purpose.is_nullable === "NO" && (purpose.column_default ?? "").includes("OPERATIONAL"),
        purpose ? `${purpose.udt_name} nullable=${purpose.is_nullable} default=${purpose.column_default}` : "ausente");
      const key = cols.find((c) => c.column_name === "certification_item_key");
      add("columna certification_item_key TEXT NULL", !!key && key.udt_name === "text" && key.is_nullable === "YES");

      const cons = await tx.$queryRaw<Array<{ conname: string }>>`
        SELECT conname FROM pg_constraint WHERE convalidated AND conname = ANY(${CONSTRAINTS})`;
      for (const c of CONSTRAINTS) add(`constraint ${c} (validada)`, cons.some((r) => r.conname === c));

      const idx = await tx.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
        SELECT indexname, indexdef FROM pg_indexes
         WHERE schemaname = current_schema() AND indexname = ANY(${[...INDEXES, ONE_ACTIVE]})`;
      for (const i of INDEXES) add(`índice ${i}`, idx.some((r) => r.indexname === i));
      const oneActive = idx.find((r) => r.indexname === ONE_ACTIVE);
      add("índice parcial único de corrida activa",
        !!oneActive && /UNIQUE/i.test(oneActive.indexdef) && /WHERE/i.test(oneActive.indexdef)
          && ["QUEUED", "RUNNING", "PAUSED", "NEEDS_REVIEW"].every((s) => oneActive.indexdef.includes(s)));

      const invalid = await tx.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*)::bigint AS n FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
         WHERE c.relname = ANY(${[...INDEXES, ONE_ACTIVE]}) AND NOT i.indisvalid`;
      add("índices válidos (indisvalid)", Number(invalid[0].n) === 0);

      const nulls = await tx.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*)::bigint AS n FROM dte_outgoing_documents WHERE purpose IS NULL`;
      add("sin purpose NULL", Number(nulls[0].n) === 0);

      const bad = await tx.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*)::bigint AS n FROM dte_outgoing_documents
         WHERE purpose = 'MH_TEST_CERTIFICATION'
           AND (environment::text <> 'TEST' OR sale_id IS NOT NULL OR purchase_id IS NOT NULL OR certification_item_key IS NULL)`;
      add("certificación bien formada (TEST, sin venta/compra, con clave)", Number(bad[0].n) === 0, `${bad[0].n} inválidos`);

      const counts = await tx.$queryRaw<Array<{ purpose: string; environment: string; n: bigint }>>`
        SELECT purpose::text AS purpose, environment::text AS environment, count(*)::bigint AS n
          FROM dte_outgoing_documents GROUP BY 1, 2 ORDER BY 1, 2`;
      console.log("Conteo dte_outgoing_documents por propósito/ambiente:");
      for (const c of counts) console.log(`  ${c.purpose.padEnd(22)} ${c.environment.padEnd(11)} ${c.n}`);
      const runs = await tx.$queryRaw<Array<{ status: string; n: bigint }>>`
        SELECT status, count(*)::bigint AS n FROM platform_dte_mh_test_runs GROUP BY 1 ORDER BY 1`;
      console.log(`Corridas MH TEST: ${runs.length ? runs.map((r) => `${r.status}=${r.n}`).join(", ") : "ninguna"}\n`);
    });
  } finally {
    await db.$disconnect();
  }

  for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail && !c.ok ? ` — ${c.detail}` : ""}`);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(failed === 0 ? `\nRESULTADO: PASS (${checks.length} comprobaciones)` : `\nRESULTADO: FAIL (${failed} de ${checks.length})`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  // Solo la primera línea del mensaje: los errores de consulta de Prisma no incluyen la cadena de conexión.
  const line = e instanceof Error ? e.message.split("\n").map((l) => l.trim()).filter(Boolean).pop() : undefined;
  console.error("RESULTADO: FAIL — error de verificación (¿migración no aplicada?):", line ?? "desconocido");
  process.exit(1);
});
