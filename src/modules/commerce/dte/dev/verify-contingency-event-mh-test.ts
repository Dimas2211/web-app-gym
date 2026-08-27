// ─────────────────────────────────────────────────────────────────
// commerce/dte — verify-contingency-event-mh-test.ts
//
// Bloque B (Evento de Contingencia MH) — PRIMERA PRUEBA REAL contra MH
// TEST. Ejecuta el flujo completo hasta obtener respuesta real de
// Hacienda para el Evento de Contingencia:
//
//   FE01 contingente (generado con servicios reales de Bloque A)
//   → createContingencyEvent (DRAFT)
//   → buildAndPersistContingencyEventJson (AJV → PENDING_SIGNATURE)
//   → signContingencyEvent (firmador real → SIGNED)
//   → transmitContingencyEvent (POST /fesv/contingencia TEST → ACCEPTED|REJECTED)
//
// Guard de seguridad: aborta si DTE_ENVIRONMENT !== "TEST" o si
// DATABASE_URL no apunta a localhost.
//
// NO transmite el FE01 asociado a /recepciondte — eso es Bloque C.
//
// Ejecutar (PowerShell):
//   $env:CONTINGENCY_MH_TEST_RUN="YES"
//   npx tsx src/modules/commerce/dte/dev/verify-contingency-event-mh-test.ts
// ─────────────────────────────────────────────────────────────────

import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { createPendingDteForSale }             from "../services/dte-outgoing.service";
import { generateFeJsonForDte }                from "../services/generate-fe-json.service";
import { validateDteJsonSchema }               from "../services/validate-dte-json-schema.service";
import { createContingencyEvent }              from "../services/create-contingency-event.service";
import { buildAndPersistContingencyEventJson } from "../services/persist-contingency-event-json.service";
import { signContingencyEvent }                from "../services/sign-contingency-event.service";
import { transmitContingencyEvent }            from "../services/transmit-contingency-event.service";

class AbortError extends Error {}
function abort(message: string): never {
  throw new AbortError(message);
}

// ── 1. Guardas de seguridad ─────────────────────────────────────────

const REMOTE_MARKERS = [
  "supabase", "pooler", "neon.tech", "railway", "render.com",
  "amazonaws", "aws", "azure", "digitalocean", "vercel",
];

function assertSafeToRun(): { dbHostSafe: string } {
  if (process.env.NODE_ENV === "production") {
    abort("NODE_ENV=production. Este runner no puede ejecutarse en producción.");
  }
  if (process.env.CONTINGENCY_MH_TEST_RUN !== "YES") {
    abort('Falta confirmación explícita. Define CONTINGENCY_MH_TEST_RUN="YES" antes de ejecutar.');
  }

  const dteEnv = process.env.DTE_ENVIRONMENT;
  if (dteEnv !== "TEST") {
    abort(`DTE_ENVIRONMENT="${dteEnv}" — este runner SOLO puede ejecutarse con DTE_ENVIRONMENT="TEST". PROD queda fuera de alcance.`);
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
    abort("DATABASE_URL no es una URL válida.");
  }

  if (host !== "localhost" && host !== "127.0.0.1") {
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

// ── 2. Contexto (tenant/location/usuario/issuer) ────────────────────

async function resolveContext() {
  const anySale = await prisma.sale.findFirst({
    where: { status: "CONFIRMED", inventory_moved: true },
    select: { tenant_id: true, location_id: true },
    orderBy: { created_at: "desc" },
  });
  if (!anySale) abort("No se encontró ninguna venta CONFIRMED con inventario aplicado en la base local.");

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
  if (!issuer) abort(`No existe DteIssuerConfig activo (environment=TEST) para tenant_id="${tenant_id}" location_id="${location_id}".`);

  return { tenant_id, location_id, user_id: user.id, issuer_config_id: issuer.id };
}

// ── 3a. Reutilizar un FE01 contingente ya generado/AJV-validado ─────
// (SCHEMA_VALIDATED, transmission_type_code="2", contingency_type_code="2",
// sin pertenecer todavía a ningún Evento) antes de crear uno nuevo — evita
// depender de ventas CONFIRMED frescas que ya se agotaron en corridas
// previas de los verificadores locales de Bloque A/B.
async function findReusableContingentFe01(tenant_id: string, location_id: string): Promise<string | null> {
  const doc = await prisma.dteOutgoingDocument.findFirst({
    where: {
      tenant_id, location_id,
      dte_type_code:          "01",
      dte_status:             "SCHEMA_VALIDATED",
      transmission_type_code: "2",
      contingency_type_code:  "2",
      generation_code:        { not: null },
      contingency_event_items: { none: {} },
    },
    select: { id: true },
    orderBy: { created_at: "asc" },
  });
  return doc?.id ?? null;
}

// ── 3b. Seleccionar/crear un FE01 contingente válido ─────────────────

async function findEligibleFe01Sale(tenant_id: string, location_id: string): Promise<string> {
  const candidates = await prisma.sale.findMany({
    where: {
      tenant_id, location_id,
      status: "CONFIRMED", inventory_moved: true,
      dte_documents: {
        none: { dte_type_code: "01", dte_status: { notIn: ["NOT_REQUIRED", "INVALIDATED", "REJECTED"] } },
      },
    },
    select: {
      id: true,
      customer: { select: { dept_code: true, municipality_code: true, address_complement: true } },
    },
    orderBy: { created_at: "desc" },
    take: 20,
  });

  const eligible = candidates.filter((s) => {
    const c = s.customer;
    if (!c) return true;
    const parts = [c.dept_code, c.municipality_code, c.address_complement];
    return parts.every((p) => !!p) || parts.every((p) => !p);
  });

  if (eligible.length === 0) {
    abort("No se encontró ninguna venta CONFIRMED elegible para un nuevo FE01 contingente.");
  }
  return eligible[0].id;
}

function svDateTime(d: Date): { date: string; time: string } {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/El_Salvador" });
  const [date, time] = s.split(" ");
  return { date, time: time.slice(0, 8) };
}

const RESPONSABLE = {
  nombre:          "Responsable Contingencia Certificacion",
  tipoDocumento:   "36",
  numeroDocumento: "06140000000000",
};

// ── 4. main ──────────────────────────────────────────────────────

async function main() {
  const { dbHostSafe } = assertSafeToRun();
  console.log(`Ambiente verificado — DTE_ENVIRONMENT=TEST. DB: ${dbHostSafe}`);

  const ctx = await resolveContext();
  console.log(`Contexto: tenant/location resuelto, issuer_config_id=${ctx.issuer_config_id}`);

  // 1. FE01 contingente base (causa 2 — "falla en el sistema del contribuyente")
  //    — reutiliza uno ya generado/AJV-validado si existe; si no, crea uno nuevo.
  let dteDocumentId = await findReusableContingentFe01(ctx.tenant_id, ctx.location_id);

  if (dteDocumentId) {
    console.log(`Reutilizando FE01 contingente ya generado/AJV-validado: dte_document_id=${dteDocumentId}`);
  } else {
    const saleId = await findEligibleFe01Sale(ctx.tenant_id, ctx.location_id);
    const created = await createPendingDteForSale(ctx.tenant_id, ctx.location_id, ctx.user_id, {
      sale_id:                saleId,
      dte_type_code:          "01",
      issuer_config_id:       ctx.issuer_config_id,
      environment:            "TEST",
      transmission_type_code: "2",
      contingency_type_code:  "2",
    });
    if (!created.ok) abort(`createPendingDteForSale falló: ${created.error}`);
    dteDocumentId = created.dte_document_id;

    const generated = await generateFeJsonForDte(dteDocumentId, ctx.tenant_id, ctx.location_id, ctx.user_id);
    if (!generated.ok) abort(`generateFeJsonForDte falló: ${generated.error}`);

    const validated = await validateDteJsonSchema(dteDocumentId, ctx.tenant_id, ctx.location_id, ctx.user_id);
    if (!validated.ok) {
      const errs = (validated.validation_errors ?? []).map((e) => `${e.path}: ${e.message}`).join(" | ");
      abort(`AJV del FE01 contingente base falló: ${validated.error} ${errs}`);
    }
  }

  const doc = await prisma.dteOutgoingDocument.findFirst({
    where: { id: dteDocumentId },
    select: { generation_code: true, json_document: true },
  });
  const ident = (doc?.json_document as { identificacion?: { fecEmi?: string; horEmi?: string } } | null)?.identificacion;

  // 2. Período de contingencia — ventana amplia del día de emisión
  const { date: today } = svDateTime(new Date());
  const periodStartDate = new Date(`${today}T00:00:00.000Z`);
  const periodEndDate   = new Date(`${today}T23:59:59.000Z`);

  // 3. Crear Evento de Contingencia (DRAFT)
  const contingencyEvent = await createContingencyEvent({
    dteDocumentIds:      [dteDocumentId],
    contingencyTypeCode: "2",
    reason:              null,
    periodStartDate,     periodStartTime: "00:00:00",
    periodEndDate,       periodEndTime:   "23:59:59",
    responsable:         RESPONSABLE,
    userId:              ctx.user_id,
    tenantId:            ctx.tenant_id,
    locationId:          ctx.location_id,
  });
  if (!contingencyEvent.ok) abort(`createContingencyEvent falló: ${contingencyEvent.message}`);

  // ── Resumen sanitizado ANTES de firmar/transmitir ────────────────
  console.log("\n── Resumen sanitizado previo a firma/transmisión ──");
  console.log(`  tenant/location: resuelto (no se imprime el ID completo por sanitización mínima)`);
  console.log(`  tipo de evento: contingencyTypeCode=2 ("Falla en el sistema del contribuyente")`);
  console.log(`  período: ${today} 00:00:00 → ${today} 23:59:59`);
  console.log(`  cantidad de DTE reportados: 1`);
  console.log(`  generation_code(s): ${doc?.generation_code}`);
  console.log(`  tipo DTE: 01 (FE)`);
  console.log(`  ambiente: 00 (TEST)`);
  console.log(`  fecEmi/horEmi del DTE: ${ident?.fecEmi} ${ident?.horEmi}`);
  console.log(`  contingencyEventId: ${contingencyEvent.contingencyEventId}`);
  console.log(`  eventGenerationCode: ${contingencyEvent.eventGenerationCode}`);

  // 4. Construir JSON del Evento + AJV
  const built = await buildAndPersistContingencyEventJson({
    contingencyEventId: contingencyEvent.contingencyEventId,
    tenantId:            ctx.tenant_id,
    locationId:          ctx.location_id,
    responsable:         RESPONSABLE,
  });
  if (!built.ok) abort(`buildAndPersistContingencyEventJson (AJV) falló: ${built.error}`);
  console.log("\nAJV: PASS — event_json construido y persistido (PENDING_SIGNATURE).");

  // 5. Firmar
  const signed = await signContingencyEvent({
    contingencyEventId: contingencyEvent.contingencyEventId,
    tenantId:            ctx.tenant_id,
    locationId:          ctx.location_id,
  });
  if (!signed.ok) abort(`signContingencyEvent falló: ${signed.error}`);
  console.log(`Firma: OK — status=SIGNED signedAt=${signed.signedAt}`);

  // 6. Transmitir a MH TEST
  const transmitted = await transmitContingencyEvent({
    contingencyEventId: contingencyEvent.contingencyEventId,
    tenantId:            ctx.tenant_id,
    locationId:          ctx.location_id,
  });

  console.log("\n── Respuesta MH TEST (sanitizada) ──");
  if (!transmitted.ok) {
    console.log(`  ERROR TÉCNICO: ${transmitted.error}`);
  } else {
    console.log(`  eventStatus:    ${transmitted.eventStatus}`);
    console.log(`  mhEstado:       ${transmitted.mhEstado}`);
    console.log(`  mensaje:        ${transmitted.mensaje}`);
    console.log(`  selloRecibido:  ${transmitted.selloRecibido}`);
    console.log(`  observaciones:  ${JSON.stringify(transmitted.observaciones)}`);
  }

  const finalEvent = await prisma.dteContingencyEvent.findUnique({
    where:  { id: contingencyEvent.contingencyEventId },
    select: {
      status: true, generation_code: true, mh_estado: true, mh_sello_recibido: true,
      mh_descripcion_msg: true, mh_observaciones: true, accepted_at: true, rejected_at: true,
    },
  });

  console.log("\n── Estado final persistido ──");
  console.log(JSON.stringify(finalEvent, null, 2));

  console.log("\n── Confirmaciones de alcance ──");
  console.log("  El DTE FE01 asociado NO fue transmitido a /recepciondte (queda pendiente — Bloque C).");
  console.log("  Este runner se detiene aquí. No continúa con Bloque C.");
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
