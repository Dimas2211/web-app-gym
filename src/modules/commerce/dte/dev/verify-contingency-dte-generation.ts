// ─────────────────────────────────────────────────────────────────
// commerce/dte — verify-contingency-dte-generation.ts
//
// Bloque A (Evento de Contingencia MH) — verificador dev-only (tsx) con
// PrismaClient REAL contra la base local. Ejercita el flujo real de:
//
//   createPendingDteForSale (validación transmisión/contingencia)
//   → generateFeJsonForDte / generateCcfeJsonForDte
//   → validateDteJsonSchema (AJV, mismos schemas oficiales de hoy)
//
// Los 8 casos obligatorios del Bloque A (ver prompt de implementación):
//   1. FE01 normal                          → AJV PASS
//   2. FE01 contingencia causa 2             → AJV PASS
//   3. FE01 contingencia causa 5 (con motivo)→ AJV PASS
//   4. contingencia sin contingency_type_code→ rechazo server-side
//   5. causa 5 sin contingency_reason        → rechazo server-side
//   6. normal + contingency_type_code        → rechazo server-side
//   7. CCFE03 normal                         → AJV PASS
//   8. CCFE03 contingencia causa 2           → AJV PASS
//
// Este script NO firma, NO transmite a Hacienda, NO llama a MariaDB, y
// NO crea datos de venta desde cero: reutiliza ventas CONFIRMED reales
// ya existentes en la base local que no tengan un DTE activo del tipo
// que se necesita, para no reimplementar el pipeline completo de sales.
// Cada venta usada solo puede reutilizarse un máximo de veces limitado
// por su propio estado — el script las descubre dinámicamente y no
// muta nada fuera de los DteOutgoingDocument que crea.
//
// Ejecutar (PowerShell):
//   $env:CONTINGENCY_LOCAL_TEST="YES"
//   npx tsx src/modules/commerce/dte/dev/verify-contingency-dte-generation.ts
// ─────────────────────────────────────────────────────────────────

import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { createPendingDteForSale } from "../services/dte-outgoing.service";
import { generateFeJsonForDte } from "../services/generate-fe-json.service";
import { generateCcfeJsonForDte } from "../services/generate-ccfe-json.service";
import { validateDteJsonSchema } from "../services/validate-dte-json-schema.service";

class AbortError extends Error {}
function abort(message: string): never {
  throw new AbortError(message);
}

// ── 1. Guardas de ambiente local ──────────────────────────────────

const REMOTE_MARKERS = [
  "supabase", "pooler", "neon.tech", "railway", "render.com",
  "amazonaws", "aws", "azure", "digitalocean", "vercel",
];

function assertLocalEnvironment(): { dbHostSafe: string } {
  if (process.env.NODE_ENV === "production") {
    abort("NODE_ENV=production. Este script no puede ejecutarse en producción.");
  }
  if (process.env.CONTINGENCY_LOCAL_TEST !== "YES") {
    abort('Falta confirmación explícita. Define CONTINGENCY_LOCAL_TEST="YES" antes de ejecutar.');
  }

  const rawUrl = process.env.DATABASE_URL ?? "";
  if (!rawUrl) abort("DATABASE_URL no está definida.");

  let host = "";
  let dbName = "";
  try {
    const parsed = new URL(rawUrl);
    host = parsed.hostname.toLowerCase();
    dbName = parsed.pathname.replace(/^\//, "");
  } catch {
    abort("DATABASE_URL no es una URL válida. No se puede verificar que sea local.");
  }

  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  if (!isLocalHost) {
    abort(`DATABASE_URL apunta a host "${host}", no a localhost/127.0.0.1. Abortado por seguridad.`);
  }

  const lowerUrl = rawUrl.toLowerCase();
  for (const marker of REMOTE_MARKERS) {
    if (lowerUrl.includes(marker)) {
      abort(`DATABASE_URL contiene el indicador remoto "${marker}". Abortado por seguridad.`);
    }
  }

  return { dbHostSafe: `${host}/${dbName}` };
}

// ── 2. Descubrir contexto (tenant/location/usuario/issuer) ─────────

async function resolveContext() {
  const anySale = await prisma.sale.findFirst({
    where: { status: "CONFIRMED", inventory_moved: true },
    select: { tenant_id: true, location_id: true },
    orderBy: { created_at: "desc" },
  });
  if (!anySale) {
    abort("No se encontró ninguna venta CONFIRMED con inventario aplicado en la base local. Necesaria para reutilizar como fixture.");
  }

  const { tenant_id, location_id } = anySale;

  const user = await prisma.user.findFirst({
    where: { tenant_id },
    select: { id: true },
    orderBy: { created_at: "asc" },
  });
  if (!user) abort(`No se encontró ningún User para tenant_id="${tenant_id}".`);

  const issuer = await prisma.dteIssuerConfig.findFirst({
    where: { tenant_id, location_id, environment: "TEST", is_active: true },
    select: { id: true, cod_estable_mh: true, cod_punto_venta_mh: true },
  });
  if (!issuer) {
    abort(`No existe DteIssuerConfig activo (environment=TEST) para tenant_id="${tenant_id}" location_id="${location_id}".`);
  }

  return { tenant_id, location_id, user_id: user.id, issuer_config_id: issuer.id };
}

// ── 3. Buscar una venta elegible (no usada aún en este run) ────────

const usedSaleIds = new Set<string>();

async function findEligibleSale(params: {
  tenant_id: string;
  location_id: string;
  dte_type_code: "01" | "03";
  requireCcfeFiscal: boolean;
}): Promise<string> {
  const { tenant_id, location_id, dte_type_code, requireCcfeFiscal } = params;

  const candidates = await prisma.sale.findMany({
    where: {
      tenant_id,
      location_id,
      status: "CONFIRMED",
      inventory_moved: true,
      id: { notIn: Array.from(usedSaleIds) },
      dte_documents: {
        none: { dte_type_code, dte_status: { notIn: ["NOT_REQUIRED", "INVALIDATED", "REJECTED"] } },
      },
      ...(requireCcfeFiscal
        ? {
            customer: {
              taxpayer_type:      "REGISTERED_TAXPAYER",
              nit:                { not: null },
              nrc:                { not: null },
              activity_code:      { not: null },
              activity_name:      { not: null },
              dept_code:          { not: null },
              municipality_code:  { not: null },
              address_complement: { not: null },
            },
          }
        : {}),
    },
    select: {
      id: true,
      customer: { select: { dept_code: true, municipality_code: true, address_complement: true } },
    },
    orderBy: { created_at: "desc" },
    take: 20,
  });

  // Filtro adicional (no expresable limpio en Prisma): el receptor solo es
  // válido contra el schema si dept_code/municipality_code/address_complement
  // están completos los tres o ausentes los tres — un dato parcial es un
  // problema de calidad de datos preexistente en el fixture, no algo que este
  // script deba "arreglar". No aplica a CCFE (requireCcfeFiscal ya lo exige).
  const eligible = requireCcfeFiscal
    ? candidates
    : candidates.filter((s) => {
        const c = s.customer;
        if (!c) return true;
        const parts = [c.dept_code, c.municipality_code, c.address_complement];
        const allPresent = parts.every((p) => !!p);
        const allAbsent  = parts.every((p) => !p);
        return allPresent || allAbsent;
      });

  if (eligible.length === 0) {
    abort(
      `No se encontró ninguna venta CONFIRMED elegible para un nuevo DTE tipo "${dte_type_code}"` +
      (requireCcfeFiscal ? " con cliente fiscalmente completo para CCFE" : " con dirección de cliente consistente") +
      ` (tenant_id="${tenant_id}", location_id="${location_id}").`,
    );
  }

  const sale = eligible[0];
  usedSaleIds.add(sale.id);
  return sale.id;
}

// ── 4. Caso positivo: crear + generar + validar AJV ─────────────────

interface PositiveCaseResult {
  label: string;
  pass: boolean;
  detail: string;
  dte_document_id?: string;
}

async function runPositiveCase(params: {
  label: string;
  ctx: { tenant_id: string; location_id: string; user_id: string; issuer_config_id: string };
  dte_type_code: "01" | "03";
  transmission_type_code?: "1" | "2";
  contingency_type_code?: "1" | "2" | "3" | "4" | "5" | null;
  contingency_reason?: string | null;
  expected: { tipoOperacion: number; tipoContingencia: number | null; motivoContin: string | null };
}): Promise<PositiveCaseResult> {
  const { label, ctx, dte_type_code, expected } = params;

  const saleId = await findEligibleSale({
    tenant_id:         ctx.tenant_id,
    location_id:       ctx.location_id,
    dte_type_code,
    requireCcfeFiscal: dte_type_code === "03",
  });

  const created = await createPendingDteForSale(ctx.tenant_id, ctx.location_id, ctx.user_id, {
    sale_id:                saleId,
    dte_type_code,
    issuer_config_id:       ctx.issuer_config_id,
    environment:            "TEST",
    transmission_type_code: params.transmission_type_code,
    contingency_type_code:  params.contingency_type_code,
    contingency_reason:     params.contingency_reason,
  });

  if (!created.ok) {
    return { label, pass: false, detail: `createPendingDteForSale falló: ${created.error}` };
  }

  const dte_document_id = created.dte_document_id;

  const generated = dte_type_code === "01"
    ? await generateFeJsonForDte(dte_document_id, ctx.tenant_id, ctx.location_id, ctx.user_id)
    : await generateCcfeJsonForDte(dte_document_id, ctx.tenant_id, ctx.location_id, ctx.user_id);

  if (!generated.ok) {
    return { label, pass: false, detail: `generación de JSON falló: ${generated.error}`, dte_document_id };
  }

  const validated = await validateDteJsonSchema(dte_document_id, ctx.tenant_id, ctx.location_id, ctx.user_id);
  if (!validated.ok) {
    const errs = (validated.validation_errors ?? []).map((e) => `${e.path}: ${e.message}`).join(" | ");
    return { label, pass: false, detail: `AJV FALLÓ: ${validated.error} ${errs}`, dte_document_id };
  }

  const doc = await prisma.dteOutgoingDocument.findFirst({
    where: { id: dte_document_id },
    select: { json_document: true, dte_status: true },
  });
  const ident = (doc?.json_document as { identificacion?: Record<string, unknown> } | null)?.identificacion;

  const checks: string[] = [];
  if (ident?.tipoOperacion !== expected.tipoOperacion) {
    checks.push(`tipoOperacion=${ident?.tipoOperacion} (esperado ${expected.tipoOperacion})`);
  }
  if ((ident?.tipoContingencia ?? null) !== expected.tipoContingencia) {
    checks.push(`tipoContingencia=${ident?.tipoContingencia} (esperado ${expected.tipoContingencia})`);
  }
  if ((ident?.motivoContin ?? null) !== expected.motivoContin) {
    checks.push(`motivoContin="${ident?.motivoContin}" (esperado "${expected.motivoContin}")`);
  }
  if (doc?.dte_status !== "SCHEMA_VALIDATED") {
    checks.push(`dte_status=${doc?.dte_status} (esperado SCHEMA_VALIDATED)`);
  }

  if (checks.length > 0) {
    return { label, pass: false, detail: `Verificación de identificacion falló: ${checks.join("; ")}`, dte_document_id };
  }

  return {
    label,
    pass:    true,
    detail:  `OK — sale_id=${saleId} dte_document_id=${dte_document_id} tipoOperacion=${ident?.tipoOperacion} tipoContingencia=${ident?.tipoContingencia} motivoContin=${JSON.stringify(ident?.motivoContin)}`,
    dte_document_id,
  };
}

// ── 5. Caso negativo: debe rechazarse server-side, sin persistir ────

async function runNegativeCase(params: {
  label: string;
  ctx: { tenant_id: string; location_id: string; user_id: string; issuer_config_id: string };
  dte_type_code: "01" | "03";
  transmission_type_code?: "1" | "2";
  contingency_type_code?: "1" | "2" | "3" | "4" | "5" | null;
  contingency_reason?: string | null;
}): Promise<PositiveCaseResult> {
  const { label, ctx, dte_type_code } = params;

  const saleId = await findEligibleSale({
    tenant_id:         ctx.tenant_id,
    location_id:       ctx.location_id,
    dte_type_code,
    requireCcfeFiscal: false,
  });

  const before = await prisma.dteOutgoingDocument.count({ where: { sale_id: saleId } });

  const created = await createPendingDteForSale(ctx.tenant_id, ctx.location_id, ctx.user_id, {
    sale_id:                saleId,
    dte_type_code,
    issuer_config_id:       ctx.issuer_config_id,
    environment:            "TEST",
    transmission_type_code: params.transmission_type_code,
    contingency_type_code:  params.contingency_type_code,
    contingency_reason:     params.contingency_reason,
  });

  const after = await prisma.dteOutgoingDocument.count({ where: { sale_id: saleId } });

  if (created.ok) {
    return { label, pass: false, detail: `Se esperaba rechazo server-side, pero createPendingDteForSale tuvo éxito (dte_document_id=${created.dte_document_id}).` };
  }
  if (after !== before) {
    return { label, pass: false, detail: `Se esperaba que NO se persistiera ningún DteOutgoingDocument, pero el conteo pasó de ${before} a ${after}.` };
  }

  return { label, pass: true, detail: `OK — rechazado server-side sin persistir: "${created.error}"` };
}

// ── 6. main ──────────────────────────────────────────────────────

async function main() {
  const { dbHostSafe } = assertLocalEnvironment();
  console.log(`Ambiente local verificado. DB: ${dbHostSafe}`);

  const ctx = await resolveContext();
  console.log(`Contexto: tenant_id=${ctx.tenant_id} location_id=${ctx.location_id} user_id=${ctx.user_id} issuer_config_id=${ctx.issuer_config_id}`);

  const results: PositiveCaseResult[] = [];

  // CASO 1 — FE01 normal
  results.push(await runPositiveCase({
    label: "CASO 1 — FE01 normal",
    ctx, dte_type_code: "01",
    expected: { tipoOperacion: 1, tipoContingencia: null, motivoContin: null },
  }));

  // CASO 2 — FE01 contingencia causa 2
  results.push(await runPositiveCase({
    label: "CASO 2 — FE01 contingencia causa 2",
    ctx, dte_type_code: "01",
    transmission_type_code: "2",
    contingency_type_code:  "2",
    expected: { tipoOperacion: 2, tipoContingencia: 2, motivoContin: null },
  }));

  // CASO 3 — FE01 contingencia causa 5
  const CASE3_REASON = "Prueba controlada de certificación MH";
  results.push(await runPositiveCase({
    label: "CASO 3 — FE01 contingencia causa 5",
    ctx, dte_type_code: "01",
    transmission_type_code: "2",
    contingency_type_code:  "5",
    contingency_reason:     CASE3_REASON,
    expected: { tipoOperacion: 2, tipoContingencia: 5, motivoContin: CASE3_REASON },
  }));

  // CASO 4 — contingencia sin tipo → rechazo
  results.push(await runNegativeCase({
    label: "CASO 4 — contingencia inválida (sin contingency_type_code)",
    ctx, dte_type_code: "01",
    transmission_type_code: "2",
    contingency_type_code:  null,
  }));

  // CASO 5 — causa 5 sin motivo → rechazo
  results.push(await runNegativeCase({
    label: "CASO 5 — causa 5 sin motivo",
    ctx, dte_type_code: "01",
    transmission_type_code: "2",
    contingency_type_code:  "5",
    contingency_reason:     null,
  }));

  // CASO 6 — normal con causa de contingencia → rechazo
  results.push(await runNegativeCase({
    label: "CASO 6 — normal con contingency_type_code",
    ctx, dte_type_code: "01",
    transmission_type_code: "1",
    contingency_type_code:  "2",
  }));

  // CASO 7 — CCFE03 normal
  results.push(await runPositiveCase({
    label: "CASO 7 — CCFE03 normal",
    ctx, dte_type_code: "03",
    expected: { tipoOperacion: 1, tipoContingencia: null, motivoContin: null },
  }));

  // CASO 8 — CCFE03 contingencia causa 2
  results.push(await runPositiveCase({
    label: "CASO 8 — CCFE03 contingencia causa 2",
    ctx, dte_type_code: "03",
    transmission_type_code: "2",
    contingency_type_code:  "2",
    expected: { tipoOperacion: 2, tipoContingencia: 2, motivoContin: null },
  }));

  console.log("\n── Resultados ──");
  let allPass = true;
  for (const r of results) {
    const mark = r.pass ? "OK   " : "FALLA";
    console.log(`[${mark}] ${r.label}`);
    console.log(`        ${r.detail}`);
    if (!r.pass) allPass = false;
  }

  console.log("\n── Confirmaciones de alcance ──");
  console.log("  Firma: NO ejecutada (este script no importa DteSignerAdapter).");
  console.log("  Transmisión: NO ejecutada (este script no importa MhDteTransmissionAdapter).");
  console.log("  MariaDB: NO ejecutado (este script no importa deliver-dte-to-external-db ni external-dte-mariadb.adapter).");

  if (!allPass) {
    abort("Uno o más casos del Bloque A fallaron. Ver detalle arriba.");
  }

  console.log("\nVERIFICACIÓN LOCAL BLOQUE A (CONTINGENCIA MH — FE01/CCFE03) OK");
}

main()
  .catch((err) => {
    if (err instanceof AbortError) {
      console.error(`\nABORTADO: ${err.message}`);
    } else {
      console.error("\nERROR INESPERADO:");
      console.error(err instanceof Error ? err.message : err);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
