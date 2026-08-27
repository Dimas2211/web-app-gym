// ─────────────────────────────────────────────────────────────────
// commerce/dte — verify-contingency-event-local.ts
//
// Bloque B (Evento de Contingencia MH) — verificador dev-only (tsx) con
// PrismaClient REAL contra la base local. Ejercita el flujo:
//
//   DteOutgoingDocument contingente (generado vía servicios reales de
//   Bloque A: createPendingDteForSale → generateFeJsonForDte /
//   generateCcfeJsonForDte → validateDteJsonSchema)
//   → createContingencyEvent
//   → buildAndPersistContingencyEventJson (AJV contra contingencia-schema-v3)
//
// Casos obligatorios de la sección 7 del prompt de implementación:
//   1. Evento válido con FE01 contingente (causa 2)   → AJV PASS
//   2. Evento válido con CCFE03 contingente (causa 2) → AJV PASS  (cubre
//      también "causa 2 válida → AJV PASS")
//   3. Evento sin DTE                                  → rechazo
//   4. DTE normal (transmission_type_code "1") dentro del evento → rechazo
//   5. DTE de otro tenant/location                     → rechazo
//   6. DTE fuera del período                            → rechazo
//   7. causa 5 sin motivo (del EVENTO, no del DTE)      → rechazo
//
// Este script NO firma (no importa sign-contingency-event.service ni
// MhHttpDteSignerAdapter) y NO transmite a MH (no importa
// transmit-contingency-event.service ni el adapter de contingencia).
//
// Ejecutar (PowerShell):
//   $env:CONTINGENCY_EVENT_LOCAL_TEST="YES"
//   npx tsx src/modules/commerce/dte/dev/verify-contingency-event-local.ts
// ─────────────────────────────────────────────────────────────────

import "dotenv/config";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { createPendingDteForSale }              from "../services/dte-outgoing.service";
import { generateFeJsonForDte }                 from "../services/generate-fe-json.service";
import { generateCcfeJsonForDte }               from "../services/generate-ccfe-json.service";
import { validateDteJsonSchema }                from "../services/validate-dte-json-schema.service";
import { createContingencyEvent }               from "../services/create-contingency-event.service";
import { buildAndPersistContingencyEventJson }  from "../services/persist-contingency-event-json.service";

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
  if (process.env.CONTINGENCY_EVENT_LOCAL_TEST !== "YES") {
    abort('Falta confirmación explícita. Define CONTINGENCY_EVENT_LOCAL_TEST="YES" antes de ejecutar.');
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
    abort("No se encontró ninguna venta CONFIRMED con inventario aplicado en la base local.");
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
    select: { id: true },
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
}): Promise<string> {
  const { tenant_id, location_id, dte_type_code } = params;

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
      ...(dte_type_code === "03"
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

  // Igual que en verify-contingency-dte-generation.ts (Bloque A): el receptor
  // solo es válido contra el schema si dept_code/municipality_code/
  // address_complement están completos los tres o ausentes los tres.
  const eligible = dte_type_code === "03"
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
    abort(`No se encontró ninguna venta CONFIRMED elegible para un nuevo DTE tipo "${dte_type_code}".`);
  }

  const sale = eligible[0];
  usedSaleIds.add(sale.id);
  return sale.id;
}

// ── 4. Crear un DTE contingente (o normal) generado y AJV-validado ─

interface Ctx { tenant_id: string; location_id: string; user_id: string; issuer_config_id: string }

async function createValidatedDte(params: {
  ctx: Ctx;
  dte_type_code: "01" | "03";
  transmission_type_code?: "1" | "2";
  contingency_type_code?: "1" | "2" | "3" | "4" | "5" | null;
  contingency_reason?: string | null;
}): Promise<string> {
  const { ctx, dte_type_code } = params;

  const saleId = await findEligibleSale({ tenant_id: ctx.tenant_id, location_id: ctx.location_id, dte_type_code });

  const created = await createPendingDteForSale(ctx.tenant_id, ctx.location_id, ctx.user_id, {
    sale_id:                saleId,
    dte_type_code,
    issuer_config_id:       ctx.issuer_config_id,
    environment:            "TEST",
    transmission_type_code: params.transmission_type_code,
    contingency_type_code:  params.contingency_type_code,
    contingency_reason:     params.contingency_reason,
  });
  if (!created.ok) abort(`createPendingDteForSale falló: ${created.error}`);

  const generated = dte_type_code === "01"
    ? await generateFeJsonForDte(created.dte_document_id, ctx.tenant_id, ctx.location_id, ctx.user_id)
    : await generateCcfeJsonForDte(created.dte_document_id, ctx.tenant_id, ctx.location_id, ctx.user_id);
  if (!generated.ok) abort(`Generación de JSON falló: ${generated.error}`);

  const validated = await validateDteJsonSchema(created.dte_document_id, ctx.tenant_id, ctx.location_id, ctx.user_id);
  if (!validated.ok) {
    const errs = (validated.validation_errors ?? []).map((e) => `${e.path}: ${e.message}`).join(" | ");
    abort(`AJV del DTE contingente base falló: ${validated.error} ${errs}`);
  }

  return created.dte_document_id;
}

// ── 5. main ──────────────────────────────────────────────────────

interface CaseResult { label: string; pass: boolean; detail: string }
const results: CaseResult[] = [];

function record(label: string, pass: boolean, detail: string) {
  results.push({ label, pass, detail });
  console.log(`[${pass ? "OK   " : "FALLA"}] ${label}`);
  console.log(`        ${detail}`);
}

const RESPONSABLE = {
  nombre:          "Juan Responsable de Prueba",
  tipoDocumento:   "36",
  numeroDocumento: "06140000000000",
};

// Período amplio que cubre "ahora" en hora fiscal El Salvador (America/El_Salvador).
function svDateTime(d: Date): { date: string; time: string } {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/El_Salvador" });
  const [date, time] = s.split(" ");
  return { date, time: time.slice(0, 8) };
}

async function main() {
  const { dbHostSafe } = assertLocalEnvironment();
  console.log(`Ambiente local verificado. DB: ${dbHostSafe}`);

  const ctx = await resolveContext();
  console.log(`Contexto: tenant_id=${ctx.tenant_id} location_id=${ctx.location_id} user_id=${ctx.user_id} issuer_config_id=${ctx.issuer_config_id}`);

  const { date: today } = svDateTime(new Date());
  const wideStart = new Date(`${today}T00:00:00.000Z`);
  const wideEnd    = new Date(`${today}T23:59:59.000Z`);
  const yesterday  = new Date(wideStart.getTime() - 24 * 60 * 60 * 1000);

  // ── CASO 1 — FE01 contingencia causa 2 → AJV PASS ────────────────
  {
    const dteId = await createValidatedDte({
      ctx, dte_type_code: "01",
      transmission_type_code: "2", contingency_type_code: "2",
    });
    const created = await createContingencyEvent({
      dteDocumentIds: [dteId],
      contingencyTypeCode: "2",
      reason: null,
      periodStartDate: wideStart, periodStartTime: "00:00:00",
      periodEndDate:   wideEnd,   periodEndTime:   "23:59:59",
      responsable: RESPONSABLE,
      userId: ctx.user_id, tenantId: ctx.tenant_id, locationId: ctx.location_id,
    });
    if (!created.ok) {
      record("CASO 1 — FE01 contingencia causa 2 (evento)", false, `createContingencyEvent falló: ${created.message}`);
    } else {
      const built = await buildAndPersistContingencyEventJson({
        contingencyEventId: created.contingencyEventId, tenantId: ctx.tenant_id, locationId: ctx.location_id,
        responsable: RESPONSABLE,
      });
      record(
        "CASO 1 — FE01 contingencia causa 2 → AJV PASS (cubre también 'causa 2 válida')",
        built.ok, built.ok
          ? `OK — contingencyEventId=${created.contingencyEventId} eventGenerationCode=${created.eventGenerationCode}`
          : `AJV FALLÓ: ${built.error}`,
      );
    }
  }

  // ── CASO 2 — CCFE03 contingencia causa 2 → AJV PASS ──────────────
  {
    const dteId = await createValidatedDte({
      ctx, dte_type_code: "03",
      transmission_type_code: "2", contingency_type_code: "2",
    });
    const created = await createContingencyEvent({
      dteDocumentIds: [dteId],
      contingencyTypeCode: "2",
      reason: null,
      periodStartDate: wideStart, periodStartTime: "00:00:00",
      periodEndDate:   wideEnd,   periodEndTime:   "23:59:59",
      responsable: RESPONSABLE,
      userId: ctx.user_id, tenantId: ctx.tenant_id, locationId: ctx.location_id,
    });
    if (!created.ok) {
      record("CASO 2 — CCFE03 contingencia causa 2 (evento)", false, `createContingencyEvent falló: ${created.message}`);
    } else {
      const built = await buildAndPersistContingencyEventJson({
        contingencyEventId: created.contingencyEventId, tenantId: ctx.tenant_id, locationId: ctx.location_id,
        responsable: RESPONSABLE,
      });
      record(
        "CASO 2 — CCFE03 contingencia causa 2 → AJV PASS",
        built.ok, built.ok
          ? `OK — contingencyEventId=${created.contingencyEventId} eventGenerationCode=${created.eventGenerationCode}`
          : `AJV FALLÓ: ${built.error}`,
      );
    }
  }

  // ── CASO 3 — Evento sin DTE → rechazo ────────────────────────────
  {
    const created = await createContingencyEvent({
      dteDocumentIds: [],
      contingencyTypeCode: "2",
      reason: null,
      periodStartDate: wideStart, periodStartTime: "00:00:00",
      periodEndDate:   wideEnd,   periodEndTime:   "23:59:59",
      responsable: RESPONSABLE,
      userId: ctx.user_id, tenantId: ctx.tenant_id, locationId: ctx.location_id,
    });
    record("CASO 3 — Evento sin DTE → rechazo", !created.ok, created.ok
      ? "FALLA: se esperaba rechazo pero el evento se creó."
      : `OK — rechazado: "${created.message}"`);
  }

  // ── CASO 4 — DTE normal dentro del evento → rechazo ──────────────
  {
    const dteId = await createValidatedDte({ ctx, dte_type_code: "01" }); // normal, sin transmission_type_code
    const created = await createContingencyEvent({
      dteDocumentIds: [dteId],
      contingencyTypeCode: "2",
      reason: null,
      periodStartDate: wideStart, periodStartTime: "00:00:00",
      periodEndDate:   wideEnd,   periodEndTime:   "23:59:59",
      responsable: RESPONSABLE,
      userId: ctx.user_id, tenantId: ctx.tenant_id, locationId: ctx.location_id,
    });
    record("CASO 4 — DTE normal dentro del evento → rechazo", !created.ok, created.ok
      ? "FALLA: se esperaba rechazo pero el evento se creó."
      : `OK — rechazado: "${created.message}"`);
  }

  // ── CASO 5 — DTE de otro tenant/location → rechazo ───────────────
  {
    const dteId = await createValidatedDte({
      ctx, dte_type_code: "01",
      transmission_type_code: "2", contingency_type_code: "2",
    });
    const otherTenantId = randomUUID(); // tenant inexistente — simula scope ajeno
    const created = await createContingencyEvent({
      dteDocumentIds: [dteId],
      contingencyTypeCode: "2",
      reason: null,
      periodStartDate: wideStart, periodStartTime: "00:00:00",
      periodEndDate:   wideEnd,   periodEndTime:   "23:59:59",
      responsable: RESPONSABLE,
      userId: ctx.user_id, tenantId: otherTenantId, locationId: ctx.location_id,
    });
    record("CASO 5 — DTE de otro tenant/location → rechazo", !created.ok, created.ok
      ? "FALLA: se esperaba rechazo pero el evento se creó."
      : `OK — rechazado: "${created.message}"`);
  }

  // ── CASO 6 — DTE fuera del período → rechazo ─────────────────────
  {
    const dteId = await createValidatedDte({
      ctx, dte_type_code: "01",
      transmission_type_code: "2", contingency_type_code: "2",
    });
    const narrowStart = yesterday;
    const narrowEnd   = new Date(yesterday.getTime() + 23 * 60 * 60 * 1000);
    const created = await createContingencyEvent({
      dteDocumentIds: [dteId],
      contingencyTypeCode: "2",
      reason: null,
      periodStartDate: narrowStart, periodStartTime: "00:00:00",
      periodEndDate:   narrowEnd,   periodEndTime:   "23:00:00",
      responsable: RESPONSABLE,
      userId: ctx.user_id, tenantId: ctx.tenant_id, locationId: ctx.location_id,
    });
    record("CASO 6 — DTE fuera del período → rechazo", !created.ok, created.ok
      ? "FALLA: se esperaba rechazo pero el evento se creó."
      : `OK — rechazado: "${created.message}"`);
  }

  // ── CASO 7 — causa 5 sin motivo (del EVENTO) → rechazo ───────────
  {
    const dteId = await createValidatedDte({
      ctx, dte_type_code: "01",
      transmission_type_code: "2", contingency_type_code: "5",
      contingency_reason: "Falla eléctrica prolongada en el establecimiento",
    });
    const created = await createContingencyEvent({
      dteDocumentIds: [dteId],
      contingencyTypeCode: "5",
      reason: null, // motivo del EVENTO vacío — debe rechazarse
      periodStartDate: wideStart, periodStartTime: "00:00:00",
      periodEndDate:   wideEnd,   periodEndTime:   "23:59:59",
      responsable: RESPONSABLE,
      userId: ctx.user_id, tenantId: ctx.tenant_id, locationId: ctx.location_id,
    });
    record("CASO 7 — causa 5 sin motivo del Evento → rechazo", !created.ok, created.ok
      ? "FALLA: se esperaba rechazo pero el evento se creó."
      : `OK — rechazado: "${created.message}"`);
  }

  console.log("\n── Resultados ──");
  let allPass = true;
  for (const r of results) {
    if (!r.pass) allPass = false;
  }

  console.log("\n── Confirmaciones de alcance ──");
  console.log("  Firma: NO ejecutada (este script no importa sign-contingency-event.service).");
  console.log("  Transmisión: NO ejecutada (este script no importa transmit-contingency-event.service).");

  if (!allPass) {
    abort("Uno o más casos del Bloque B (local) fallaron. Ver detalle arriba.");
  }

  console.log("\nVERIFICACIÓN LOCAL BLOQUE B (EVENTO DE CONTINGENCIA MH) OK");
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
