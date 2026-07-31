// ─────────────────────────────────────────────────────────────────
// commerce/dte — verify-fex11-generate-persist-local.ts
//
// Microfase F3-C10B — verificador dev-only (tsx) con PrismaClient REAL
// contra la base local, para el flujo de F3-C10:
//
//   DteOutgoingDocument (11, real, creado por F3-C8)
//   → generateAndPersistFexJsonForDte
//   → persistir json_document
//   → validateDteJsonSchema (AJV)
//   → dte_status SCHEMA_VALIDATED
//   → schema_validated_at seteado
//
// Este script NO firma, NO transmite a Hacienda, NO toca MariaDB y NO
// habilita el tipo 11 en el pipeline real (create-pending-dte-for-sale,
// transmit-dte-document, UI). No importa MhAuthAdapter, no importa
// MhDteTransmissionAdapter, no importa deliver-dte-to-external-db, no
// importa external-dte-mariadb.adapter.
//
// Reutiliza el DteOutgoingDocument tipo 11 marcado FEX11_TEST_* creado
// por verify-fex11-preview-local.ts (F3-C8). No crea datos nuevos.
//
// Ejecutar (PowerShell):
//   $env:FEX11_LOCAL_TEST="YES"
//   npx tsx src/modules/commerce/dte/dev/verify-fex11-generate-persist-local.ts
// ─────────────────────────────────────────────────────────────────

import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { generateAndPersistFexJsonForDte } from "../services/generate-fex-json-pipeline.service";

const SALE_MARKER = "FEX11_TEST_SALE";

class AbortError extends Error {}

function abort(message: string): never {
  throw new AbortError(message);
}

// ── 1. Guardas de ambiente local (idénticas a verify-fex11-preview-local) ─

const REMOTE_MARKERS = [
  "supabase", "pooler", "neon.tech", "railway", "render.com",
  "amazonaws", "aws", "azure", "digitalocean", "vercel",
];

function assertLocalEnvironment(): { dbHostSafe: string } {
  if (process.env.NODE_ENV === "production") {
    abort("NODE_ENV=production. Este script no puede ejecutarse en producción.");
  }
  if (process.env.FEX11_LOCAL_TEST !== "YES") {
    abort('Falta confirmación explícita. Define FEX11_LOCAL_TEST="YES" antes de ejecutar.');
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

// ── 2. Localizar el DteOutgoingDocument tipo 11 de prueba (F3-C8) ────

interface TestDteCandidate {
  id:                   string;
  tenant_id:            string;
  location_id:          string;
  sale_id:              string | null;
  dte_status:           string;
  environment:          string;
  control_number:       string | null;
  generation_code:      string | null;
  signed_jws:            string | null;
  signed_at:            Date | null;
  mh_response:          unknown;
  reception_stamp:      string | null;
  json_document:        unknown;
  schema_validated_at:  Date | null;
  retry_count:          number;
  created_at:           Date;
}

async function findTestDteDocument(): Promise<TestDteCandidate> {
  const candidates = await prisma.dteOutgoingDocument.findMany({
    where: {
      dte_type_code: "11",
      environment:   "TEST",
      control_number: { startsWith: "DTE-11" },
      signed_jws:      null,
      sale: { notes: SALE_MARKER },
    },
    select: {
      id:                  true,
      tenant_id:           true,
      location_id:         true,
      sale_id:             true,
      dte_status:          true,
      environment:         true,
      control_number:      true,
      generation_code:     true,
      signed_jws:          true,
      signed_at:           true,
      mh_response:         true,
      reception_stamp:     true,
      json_document:       true,
      schema_validated_at: true,
      retry_count:         true,
      created_at:          true,
    },
    orderBy: { created_at: "desc" },
  });

  if (candidates.length === 0) {
    abort(
      "No se encontró ningún DteOutgoingDocument tipo 11 (TEST, control_number DTE-11..., " +
      `venta marcada "${SALE_MARKER}", sin firmar) en la base local. ` +
      "Primero ejecuta verify-fex11-preview-local.ts para crear los datos FEX11_TEST_*.",
    );
  }

  if (candidates.length > 1) {
    console.warn(
      `\nADVERTENCIA: se encontraron ${candidates.length} documentos DTE 11 de prueba FEX11_TEST_*. ` +
      "Se usará el más reciente por created_at. Candidatos:",
    );
    for (const c of candidates) {
      console.warn(`  - id=${c.id} created_at=${c.created_at.toISOString()} dte_status=${c.dte_status}`);
    }
  }

  return candidates[0];
}

// ── 3. Reset controlado del DTE de prueba a estado inicial ───────────
// Solo permitido si: tipo 11, environment TEST, control_number DTE-11...,
// pertenece a datos FEX11_TEST_* (venta marcada), signed_jws null, sin
// reception_stamp, y no está ACCEPTED/SENT (no "transmitido").

const NON_RESETTABLE_STATUSES = new Set(["ACCEPTED", "SENT", "REJECTED", "OBSERVED", "INVALIDATED"]);

async function resetTestDteIfEligible(doc: TestDteCandidate): Promise<boolean> {
  const eligible =
    doc.environment === "TEST" &&
    (doc.control_number ?? "").startsWith("DTE-11") &&
    doc.signed_jws === null &&
    doc.reception_stamp === null &&
    !NON_RESETTABLE_STATUSES.has(doc.dte_status);

  if (!eligible) {
    console.log("Reset controlado: NO aplicado (el documento no cumple todas las condiciones de seguridad).");
    return false;
  }

  if (doc.dte_status === "PENDING_GENERATION" && !doc.json_document) {
    console.log("Reset controlado: no necesario (el documento ya está en PENDING_GENERATION sin json_document).");
    return false;
  }

  if (doc.signed_jws) {
    abort("El documento tiene signed_jws — abortado por seguridad, no se resetea un documento firmado.");
  }

  await prisma.dteOutgoingDocument.update({
    where: { id: doc.id },
    data: {
      dte_status:          "PENDING_GENERATION",
      json_document:       Prisma.JsonNull,
      schema_validated_at: null,
    },
  });

  console.log("Reset controlado: aplicado (dte_status → PENDING_GENERATION, json_document → null, schema_validated_at → null).");
  return true;
}

// ── 3b. Resolver un usuario real del tenant para updated_by (FK real) ─
// updated_by tiene FK a users.id — no se puede usar un string arbitrario.

async function resolveTestUserId(tenant_id: string): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { tenant_id },
    select: { id: true },
    orderBy: { created_at: "asc" },
  });
  if (!user) {
    abort(`No se encontró ningún User para tenant_id="${tenant_id}". Necesario para updated_by (FK real).`);
  }
  return user.id;
}

// ── 4. main ─────────────────────────────────────────────────────────

async function main() {
  const { dbHostSafe } = assertLocalEnvironment();
  console.log(`Ambiente local verificado. DB: ${dbHostSafe}`);

  const doc = await findTestDteDocument();

  if (!doc.sale_id) {
    abort(`El DteOutgoingDocument de prueba (${doc.id}) no tiene sale_id asociado.`);
  }

  console.log("\n── Estado inicial (seguro) ──");
  console.log(`dte_document_id:      ${doc.id}`);
  console.log(`sale_id:              ${doc.sale_id}`);
  console.log(`dte_status:           ${doc.dte_status}`);
  console.log(`environment:          ${doc.environment}`);
  console.log(`control_number:       ${doc.control_number}`);
  console.log(`generation_code:      ${doc.generation_code}`);
  console.log(`json_document existe: ${doc.json_document ? "sí" : "no"}`);
  console.log(`schema_validated_at:  ${doc.schema_validated_at ? doc.schema_validated_at.toISOString() : "null"}`);
  console.log(`signed_jws existe:    ${doc.signed_jws ? "sí" : "no"}`);
  console.log(`retry_count:          ${doc.retry_count}`);

  console.log("\n── Reset controlado ──");
  await resetTestDteIfEligible(doc);

  const testUserId = await resolveTestUserId(doc.tenant_id);

  console.log("\n── generateAndPersistFexJsonForDte ──");
  const result = await generateAndPersistFexJsonForDte({
    tenant_id:       doc.tenant_id,
    location_id:     doc.location_id,
    dte_document_id: doc.id,
    user_id:         testUserId, // usuario real del tenant — updated_by tiene FK a users.id
  });

  if (!result.ok) {
    abort(`generateAndPersistFexJsonForDte falló: ${result.error}`);
  }

  if (result.dte_status !== "SCHEMA_VALIDATED") {
    console.log("\n── AJV falló ──");
    for (const e of result.validation_errors ?? []) {
      console.log(`  - ${e.path}: ${e.message}`);
    }
    abort(
      `El documento quedó en estado "${result.dte_status}" (AJV no pasó). ` +
      "Revisa validation_errors arriba.",
    );
  }

  console.log("generateAndPersistFexJsonForDte: OK (dte_status → SCHEMA_VALIDATED)");

  // ── 5. Releer el documento persistido para verificar contra base real ──
  const finalDoc = await prisma.dteOutgoingDocument.findFirst({
    where: { id: doc.id, tenant_id: doc.tenant_id, location_id: doc.location_id },
    select: {
      dte_status:          true,
      schema_validated_at: true,
      signed_jws:          true,
      signed_at:           true,
      mh_response:         true,
      reception_stamp:     true,
      retry_count:         true,
      control_number:      true,
      generation_code:     true,
      json_document:       true,
    },
  });

  if (!finalDoc) {
    abort("El documento desapareció después de la generación. Estado inconsistente.");
  }

  console.log("\n── Verificaciones post-persistencia ──");
  const checks: Array<{ label: string; pass: boolean; detail?: string }> = [];

  checks.push({ label: "dte_status === SCHEMA_VALIDATED", pass: finalDoc.dte_status === "SCHEMA_VALIDATED" });
  checks.push({ label: "json_document existe en base", pass: finalDoc.json_document != null });
  checks.push({ label: "schema_validated_at no es null", pass: finalDoc.schema_validated_at != null });
  checks.push({ label: "signed_jws sigue null", pass: finalDoc.signed_jws === null });
  checks.push({ label: "signed_at sigue null", pass: finalDoc.signed_at === null });
  checks.push({ label: "mh_response sigue null", pass: finalDoc.mh_response === null });
  checks.push({ label: "reception_stamp sigue null", pass: finalDoc.reception_stamp === null });
  checks.push({ label: "retry_count no cambió", pass: finalDoc.retry_count === doc.retry_count });
  checks.push({ label: "control_number sigue empezando con DTE-11", pass: (finalDoc.control_number ?? "").startsWith("DTE-11") });
  checks.push({ label: "control_number no cambió", pass: finalDoc.control_number === doc.control_number });
  checks.push({ label: "generation_code no cambió", pass: finalDoc.generation_code === doc.generation_code });

  const jsonDoc = finalDoc.json_document as {
    identificacion?: { tipoDte?: string; numeroControl?: string; codigoGeneracion?: string };
    resumen?: { montoTotalOperacion?: number; totalPagar?: number };
    cuerpoDocumento?: unknown[];
  } | null;

  checks.push({ label: 'json_document.identificacion.tipoDte === "11"', pass: jsonDoc?.identificacion?.tipoDte === "11" });
  checks.push({
    label: "json_document.identificacion.numeroControl === control_number",
    pass: jsonDoc?.identificacion?.numeroControl === finalDoc.control_number,
  });
  checks.push({
    label: "json_document.identificacion.codigoGeneracion === generation_code",
    pass: jsonDoc?.identificacion?.codigoGeneracion === finalDoc.generation_code,
  });

  let allPass = true;
  for (const c of checks) {
    const mark = c.pass ? "OK " : "FALLA";
    console.log(`  [${mark}] ${c.label}`);
    if (!c.pass) allPass = false;
  }

  console.log("\n── Confirmaciones de alcance ──");
  console.log("  Firma: NO ejecutada (este script no importa MhAuthAdapter).");
  console.log("  Transmisión: NO ejecutada (este script no importa MhDteTransmissionAdapter).");
  console.log("  MariaDB: NO ejecutado (este script no importa deliver-dte-to-external-db ni external-dte-mariadb.adapter).");

  console.log("\n── Resumen seguro ──");
  console.log(`dte_document_id:      ${doc.id}`);
  console.log(`sale_id:              ${doc.sale_id}`);
  console.log(`control_number:       ${finalDoc.control_number}`);
  console.log(`generation_code:      ${finalDoc.generation_code}`);
  console.log(`dte_status final:     ${finalDoc.dte_status}`);
  console.log(`schema_validated_at:  ${finalDoc.schema_validated_at ? finalDoc.schema_validated_at.toISOString() : "null"}`);
  console.log(`tipoDte:              ${jsonDoc?.identificacion?.tipoDte}`);
  console.log(`montoTotalOperacion:  ${jsonDoc?.resumen?.montoTotalOperacion}`);
  console.log(`totalPagar:           ${jsonDoc?.resumen?.totalPagar}`);
  console.log(`cantidad de líneas:   ${jsonDoc?.cuerpoDocumento?.length ?? 0}`);
  console.log(`signed_jws sigue null: ${finalDoc.signed_jws === null}`);
  console.log("transmisión ejecutada: no");

  if (!allPass) {
    abort("Una o más verificaciones post-persistencia fallaron. Ver detalle arriba.");
  }

  console.log("\nVERIFICACIÓN LOCAL FEX 11 (GENERACIÓN + PERSISTENCIA) OK");
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
