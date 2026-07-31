// ─────────────────────────────────────────────────────────────────
// commerce/dte — verify-fex11-sign-local.ts
//
// Microfase F3-C12 — firma controlada local/TEST de FEX 11.
//
//   DteOutgoingDocument (11, TEST, SCHEMA_VALIDATED — dejado por
//   verify-fex11-generate-persist-local.ts, F3-C10B)
//   → signDteDocument (service real, agnóstico de dte_type_code)
//   → signed_jws / signed_at persistidos
//   → dte_status SIGNED
//
// Este script NO transmite a Hacienda, NO toca MariaDB, NO habilita
// firma pública de tipo 11 (sign-dte-document.action.ts sigue
// bloqueando "11" — ver F3-C11B), y NO modifica UI. No importa
// MhAuthAdapter, MhDteTransmissionAdapter, deliver-dte-to-external-db
// ni external-dte-mariadb.adapter.
//
// Ejecutar (PowerShell):
//   $env:FEX11_LOCAL_TEST="YES"
//   $env:FEX11_SIGN_TEST="YES"
//   npx tsx src/modules/commerce/dte/dev/verify-fex11-sign-local.ts
// ─────────────────────────────────────────────────────────────────

import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { signDteDocument } from "../services/sign-dte-document.service";

// F3-C15B — FEX11_TEST_CASE=CATALOG_OK apunta al DTE de prueba nuevo
// (venta marcada FEX11_TEST_CATALOG_OK_SALE), sin tocar el DTE original
// REJECTED en F3-C14 (venta marcada FEX11_TEST_SALE).
const TEST_CASE: "DEFAULT" | "CATALOG_OK" =
  process.env.FEX11_TEST_CASE === "CATALOG_OK" ? "CATALOG_OK" : "DEFAULT";
const SALE_MARKER = TEST_CASE === "CATALOG_OK" ? "FEX11_TEST_CATALOG_OK_SALE" : "FEX11_TEST_SALE";

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
  if (process.env.FEX11_LOCAL_TEST !== "YES") {
    abort('Falta confirmación explícita. Define FEX11_LOCAL_TEST="YES" antes de ejecutar.');
  }
  if (process.env.FEX11_SIGN_TEST !== "YES") {
    abort('Falta confirmación explícita de firma. Define FEX11_SIGN_TEST="YES" antes de ejecutar.');
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

// ── 1b. Guardas de credenciales del firmador (sin imprimir valores) ──

function assertSignerCredentialsPresent(): { signerUrlHost: string } {
  const signerUrl = process.env["DTE_SIGNER_URL"];
  const signerNit  = process.env["DTE_SIGNER_NIT"];
  const signerPwd  = process.env["DTE_SIGNER_PASSWORD"];

  if (!signerUrl) abort("DTE_SIGNER_URL no está definida.");
  if (!signerNit) abort("DTE_SIGNER_NIT no está definida.");
  if (!signerPwd) abort("DTE_SIGNER_PASSWORD no está definida.");

  let signerUrlHost = "desconocido";
  try {
    signerUrlHost = new URL(signerUrl).hostname;
  } catch {
    // no imprimir la URL completa si no es parseable; host queda "desconocido"
  }

  return { signerUrlHost };
}

// ── 2. Localizar el DteOutgoingDocument tipo 11 de prueba en SCHEMA_VALIDATED ─

interface TestDteCandidate {
  id:              string;
  tenant_id:       string;
  location_id:     string;
  sale_id:         string | null;
  dte_status:      string;
  environment:     string;
  control_number:  string | null;
  generation_code: string | null;
  signed_jws:      string | null;
  signed_at:       Date | null;
  mh_response:     unknown;
  reception_stamp: string | null;
  json_document:   unknown;
  retry_count:     number;
  created_at:      Date;
}

async function findTestDteDocument(): Promise<TestDteCandidate> {
  const candidates = await prisma.dteOutgoingDocument.findMany({
    where: {
      dte_type_code: "11",
      environment:   "TEST",
      control_number: { startsWith: "DTE-11" },
      sale: { notes: SALE_MARKER },
    },
    select: {
      id:              true,
      tenant_id:       true,
      location_id:     true,
      sale_id:         true,
      dte_status:      true,
      environment:     true,
      control_number:  true,
      generation_code: true,
      signed_jws:      true,
      signed_at:       true,
      mh_response:     true,
      reception_stamp: true,
      json_document:   true,
      retry_count:     true,
      created_at:      true,
    },
    orderBy: { created_at: "desc" },
  });

  if (candidates.length === 0) {
    abort(
      "No se encontró ningún DteOutgoingDocument tipo 11 (TEST, control_number DTE-11..., " +
      `venta marcada "${SALE_MARKER}") en la base local. ` +
      "Primero ejecuta verify-fex11-generate-persist-local.ts para dejar el DTE FEX11_TEST_* en SCHEMA_VALIDATED.",
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

  const doc = candidates[0];

  if (doc.dte_status === "SIGNED") {
    abort(
      `El documento de prueba (${doc.id}) ya está en dte_status=SIGNED. ` +
      "No se refirma automáticamente. Para repetir la prueba se requiere un reset controlado " +
      "manual o una fase específica. signed_jws y signed_at NO se tocan.",
    );
  }

  if (doc.dte_status !== "SCHEMA_VALIDATED") {
    abort(
      `El documento de prueba (${doc.id}) está en dte_status="${doc.dte_status}", se esperaba SCHEMA_VALIDATED. ` +
      "Primero ejecuta verify-fex11-generate-persist-local.ts para dejar el DTE FEX11_TEST_* en SCHEMA_VALIDATED.",
    );
  }

  if (!doc.json_document) {
    abort(`El documento de prueba (${doc.id}) no tiene json_document. No se puede firmar.`);
  }

  if (doc.signed_jws !== null || doc.signed_at !== null) {
    abort(`El documento de prueba (${doc.id}) tiene signed_jws/signed_at no nulos en estado inconsistente. Abortado por seguridad.`);
  }

  if (doc.mh_response !== null || doc.reception_stamp !== null) {
    abort(`El documento de prueba (${doc.id}) tiene mh_response/reception_stamp no nulos. No corresponde a un DTE sin transmitir. Abortado.`);
  }

  return doc;
}

// ── 2b. Resolver un usuario real del tenant para userId (FK real) ────

async function resolveTestUserId(tenant_id: string): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { tenant_id },
    select: { id: true },
    orderBy: { created_at: "asc" },
  });
  if (!user) {
    abort(`No se encontró ningún User para tenant_id="${tenant_id}". Necesario para userId (FK real de updated_by).`);
  }
  return user.id;
}

// ── 3. main ─────────────────────────────────────────────────────────

function safeJwsSummary(jws: string | null): string {
  if (!jws) return "no presente";
  return `presente (longitud=${jws.length})`;
}

async function main() {
  const { dbHostSafe } = assertLocalEnvironment();
  console.log(`Ambiente local verificado. DB: ${dbHostSafe}`);

  const { signerUrlHost } = assertSignerCredentialsPresent();
  console.log(`Credenciales del firmador: presentes (DTE_SIGNER_URL host="${signerUrlHost}", DTE_SIGNER_NIT presente, DTE_SIGNER_PASSWORD presente).`);
  console.log(`Caso de prueba (FEX11_TEST_CASE): ${TEST_CASE} (marcador de venta: ${SALE_MARKER})`);

  const doc = await findTestDteDocument();

  if (!doc.sale_id) {
    abort(`El DteOutgoingDocument de prueba (${doc.id}) no tiene sale_id asociado.`);
  }

  console.log("\n── Estado inicial (seguro) ──");
  console.log(`dte_document_id:      ${doc.id}`);
  console.log(`sale_id:              ${doc.sale_id}`);
  console.log(`control_number:       ${doc.control_number}`);
  console.log(`generation_code:      ${doc.generation_code}`);
  console.log(`dte_status:           ${doc.dte_status}`);
  console.log(`environment:          ${doc.environment}`);
  console.log(`json_document existe: ${doc.json_document ? "sí" : "no"}`);
  console.log(`signed_jws existe:    ${doc.signed_jws ? "sí" : "no"}`);
  console.log(`signed_at:            ${doc.signed_at ? doc.signed_at.toISOString() : "null"}`);

  const testUserId = await resolveTestUserId(doc.tenant_id);

  console.log("\n── signDteDocument ──");
  const result = await signDteDocument({
    dteDocumentId: doc.id,
    userId:        testUserId,
    tenantId:      doc.tenant_id,
    locationId:    doc.location_id,
  });

  if (!result.ok) {
    abort(`signDteDocument falló: ${result.error}`);
  }

  console.log(`signDteDocument: OK (dte_status → ${result.dteStatus}, signed_at=${result.signedAt})`);

  // ── 4. Releer el documento persistido para verificar contra base real ──
  const finalDoc = await prisma.dteOutgoingDocument.findFirst({
    where: { id: doc.id, tenant_id: doc.tenant_id, location_id: doc.location_id },
    select: {
      dte_status:      true,
      signed_jws:      true,
      signed_at:       true,
      mh_response:     true,
      reception_stamp: true,
      retry_count:     true,
      control_number:  true,
      generation_code: true,
      json_document:   true,
    },
  });

  if (!finalDoc) {
    abort("El documento desapareció después de la firma. Estado inconsistente.");
  }

  console.log("\n── Verificaciones post-firma ──");
  const checks: Array<{ label: string; pass: boolean }> = [];

  checks.push({ label: "dte_status === SIGNED", pass: finalDoc.dte_status === "SIGNED" });
  checks.push({ label: "signed_jws presente", pass: !!finalDoc.signed_jws });
  checks.push({ label: "signed_at no es null", pass: finalDoc.signed_at !== null });
  checks.push({ label: "json_document sigue existiendo", pass: finalDoc.json_document != null });
  checks.push({ label: "control_number no cambió", pass: finalDoc.control_number === doc.control_number });
  checks.push({ label: "generation_code no cambió", pass: finalDoc.generation_code === doc.generation_code });
  checks.push({ label: "mh_response sigue null", pass: finalDoc.mh_response === null });
  checks.push({ label: "reception_stamp sigue null", pass: finalDoc.reception_stamp === null });

  let allPass = true;
  for (const c of checks) {
    const mark = c.pass ? "OK " : "FALLA";
    console.log(`  [${mark}] ${c.label}`);
    if (!c.pass) allPass = false;
  }

  console.log("\n── Confirmaciones de alcance ──");
  console.log("  Transmisión: NO ejecutada (este script no importa MhDteTransmissionAdapter).");
  console.log("  MariaDB: NO ejecutado (este script no importa deliver-dte-to-external-db ni external-dte-mariadb.adapter).");
  console.log("  Firma pública tipo 11: sigue bloqueada en sign-dte-document.action.ts (F3-C11B).");

  console.log("\n── Resumen seguro ──");
  console.log(`dte_document_id:  ${doc.id}`);
  console.log(`sale_id:          ${doc.sale_id}`);
  console.log(`control_number:   ${finalDoc.control_number}`);
  console.log(`generation_code:  ${finalDoc.generation_code}`);
  console.log(`dte_status final: ${finalDoc.dte_status}`);
  console.log(`signed_at:        ${finalDoc.signed_at ? finalDoc.signed_at.toISOString() : "null"}`);
  console.log(`signed_jws:       ${safeJwsSummary(finalDoc.signed_jws)}`);
  console.log("transmisión ejecutada: no");

  if (!allPass) {
    abort("Una o más verificaciones post-firma fallaron. Ver detalle arriba.");
  }

  console.log("\nVERIFICACIÓN LOCAL FEX 11 (FIRMA CONTROLADA) OK");
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
