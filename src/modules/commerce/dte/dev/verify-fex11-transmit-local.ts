// ─────────────────────────────────────────────────────────────────
// commerce/dte — verify-fex11-transmit-local.ts
//
// Microfase F3-C14 — transmisión controlada local/TEST de FEX 11.
//
//   DteOutgoingDocument (11, TEST, SIGNED — dejado por
//   verify-fex11-sign-local.ts, F3-C12)
//   → MhAuthAdapter (auth TEST)
//   → MhDteTransmissionAdapter.transmit() (recepción TEST)
//   → interpretar respuesta con el mismo criterio de
//     transmit-dte-document.service.ts (determineFinalStatus)
//   → dte_status ACCEPTED | OBSERVED | REJECTED | SIGNED (inesperado)
//   → mh_response / reception_stamp persistidos
//   → DteTransmissionLog operation_type=SEND
//
// Este script NO modifica transmit-dte-document.service.ts ni su
// SUPPORTED_TYPE_CODES (sigue sin incluir "11"), NO modifica
// transmitDteDocumentAction, NO habilita transmisión pública tipo 11,
// NO toca MariaDB, NO toca UI. El tipo DteTransmissionInput.dteTypeCode
// del adapter compartido sigue restringido a "01"|"03"|"05"; este
// script castea localmente "11" solo dentro de este archivo dev-only,
// porque el adapter en sí es agnóstico de tipo (no valida tipoDte).
//
// Ejecutar (PowerShell):
//   $env:FEX11_LOCAL_TEST="YES"
//   $env:FEX11_TRANSMIT_TEST="YES"
//   npx tsx src/modules/commerce/dte/dev/verify-fex11-transmit-local.ts
// ─────────────────────────────────────────────────────────────────

import "dotenv/config";
import { prisma }     from "@/lib/db/prisma";
import { Prisma }     from "@prisma/client";
import { MhAuthAdapter }             from "../adapters/dte-auth.adapter";
import { MhDteTransmissionAdapter }  from "../adapters/dte-transmission.adapter";
import type {
  DteTransmissionInput,
  DteTransmissionSuccessResult,
} from "../types/dte-transmission.types";

const SALE_MARKER = "FEX11_TEST_SALE";

// FEX 11 identificacion.version es fijo en 1 (ver fex-json.types.ts).
const FEX11_VERSION = 1;

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
  if (process.env.FEX11_TRANSMIT_TEST !== "YES") {
    abort('Falta confirmación explícita de transmisión. Define FEX11_TRANSMIT_TEST="YES" antes de ejecutar.');
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

// ── 1b. Guardas de credenciales MH (sin imprimir valores) ─────────

function assertMhCredentialsPresent(): { authUrlHost: string; receptionUrlHost: string } {
  const mhUser = process.env["DTE_MH_USER"];
  const mhPwd  = process.env["DTE_MH_PASSWORD"];

  if (!mhUser) abort("DTE_MH_USER no está definida.");
  if (!mhPwd)  abort("DTE_MH_PASSWORD no está definida.");

  const authUrlRaw =
    process.env["DTE_MH_AUTH_URL_TEST"] ?? "https://apitest.dtes.mh.gob.sv/seguridad/auth";
  const receptionUrlRaw =
    process.env["DTE_MH_RECEPTION_URL_TEST"] ?? "https://apitest.dtes.mh.gob.sv/fesv/recepciondte";

  let authUrlHost = "desconocido";
  let receptionUrlHost = "desconocido";
  try {
    authUrlHost = new URL(authUrlRaw).hostname;
  } catch {
    // no imprimir la URL completa si no es parseable
  }
  try {
    receptionUrlHost = new URL(receptionUrlRaw).hostname;
  } catch {
    // no imprimir la URL completa si no es parseable
  }

  return { authUrlHost, receptionUrlHost };
}

function assertTestEnvironmentConfig(): void {
  const dteEnv = process.env["DTE_ENVIRONMENT"];
  if (dteEnv === "PRODUCTION") {
    abort('DTE_ENVIRONMENT=PRODUCTION. Este script solo puede ejecutarse contra TEST.');
  }
}

// ── 2. Localizar el DteOutgoingDocument tipo 11 de prueba en SIGNED ─

interface TestDteCandidate {
  id:              string;
  tenant_id:       string;
  location_id:     string;
  sale_id:         string | null;
  dte_status:      string;
  environment:     string;
  dte_type_code:   string;
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
      dte_type_code:   true,
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
      "Primero ejecuta verify-fex11-generate-persist-local.ts y verify-fex11-sign-local.ts " +
      "para dejar el DTE FEX11_TEST_* en SIGNED.",
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

  if (doc.dte_status === "INVALIDATED") {
    abort(`El documento de prueba (${doc.id}) está INVALIDATED. Abortado.`);
  }

  if (doc.dte_status === "ACCEPTED" || doc.reception_stamp !== null) {
    abort(
      `El documento de prueba (${doc.id}) ya está ACCEPTED o ya tiene reception_stamp. ` +
      "No se retransmite. mh_response y reception_stamp NO se modifican.",
    );
  }

  if (doc.dte_status !== "SIGNED") {
    abort(
      `El documento de prueba (${doc.id}) está en dte_status="${doc.dte_status}", se esperaba SIGNED. ` +
      "Primero ejecuta verify-fex11-generate-persist-local.ts y verify-fex11-sign-local.ts " +
      "para dejar el DTE FEX11_TEST_* en SIGNED.",
    );
  }

  if (!doc.signed_jws) {
    abort(`El documento de prueba (${doc.id}) no tiene signed_jws. No se puede transmitir.`);
  }
  if (!doc.generation_code) {
    abort(`El documento de prueba (${doc.id}) no tiene generation_code.`);
  }
  if (!doc.control_number) {
    abort(`El documento de prueba (${doc.id}) no tiene control_number.`);
  }
  if (!doc.json_document) {
    abort(`El documento de prueba (${doc.id}) no tiene json_document.`);
  }
  if (!doc.signed_at) {
    abort(`El documento de prueba (${doc.id}) no tiene signed_at.`);
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

// ── 3. Interpretación de respuesta MH — mismo criterio que
//      transmit-dte-document.service.ts::determineFinalStatus ────────

function determineFinalStatus(
  result: DteTransmissionSuccessResult,
): "ACCEPTED" | "OBSERVED" | "REJECTED" | null {
  if (result.mhEstado === "RECHAZADO") return "REJECTED";

  if (result.mhEstado === "PROCESADO") {
    const hasObs = Array.isArray(result.observaciones) && result.observaciones.length > 0;
    const descObs = result.descripcionMsg?.toLowerCase().includes("observaci") ?? false;
    return hasObs || descObs ? "OBSERVED" : "ACCEPTED";
  }

  return null;
}

// ── 4. main ─────────────────────────────────────────────────────────

function safeJwsSummary(jws: string | null): string {
  if (!jws) return "no presente";
  return `presente (longitud=${jws.length})`;
}

async function main() {
  const { dbHostSafe } = assertLocalEnvironment();
  console.log(`Ambiente local verificado. DB: ${dbHostSafe}`);

  assertTestEnvironmentConfig();

  const { authUrlHost, receptionUrlHost } = assertMhCredentialsPresent();
  console.log(`Credenciales MH: presentes (DTE_MH_USER presente, DTE_MH_PASSWORD presente).`);
  console.log(`MH auth URL host:      ${authUrlHost}`);
  console.log(`MH reception URL host: ${receptionUrlHost}`);

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
  console.log(`signed_jws:           ${safeJwsSummary(doc.signed_jws)}`);
  console.log(`mh_response presente: ${doc.mh_response ? "sí" : "no"}`);
  console.log(`reception_stamp:      ${doc.reception_stamp ? "presente" : "no presente"}`);

  const testUserId = await resolveTestUserId(doc.tenant_id);

  // ── 5. Autenticación MH TEST ───────────────────────────────────
  console.log("\n── Autenticación MH TEST ──");
  const authAdapter = new MhAuthAdapter();
  const authResult = await authAdapter.getCachedToken("TEST");

  if (!authResult.ok) {
    abort(`Autenticación MH falló: ${authResult.message}`);
  }
  console.log("Autenticación MH: OK (token no impreso).");

  // ── 6. Transmisión MH TEST ─────────────────────────────────────
  console.log("\n── Transmisión MH TEST ──");
  const environment = doc.environment as "TEST" | "PRODUCTION";
  const attemptNumber = doc.retry_count + 1;
  const receptionUrl =
    process.env["DTE_MH_RECEPTION_URL_TEST"] ?? "https://apitest.dtes.mh.gob.sv/fesv/recepciondte";

  const transmissionAdapter = new MhDteTransmissionAdapter(authAdapter);

  // dteTypeCode del adapter compartido está tipado como "01"|"03"|"05" porque
  // SUPPORTED_TYPE_CODES del service público no incluye "11" (bloqueo intencional,
  // F3-C11B / F3-C13). El adapter en sí no valida tipoDte en runtime, por lo que
  // este cast es local a este script dev-only y no modifica el tipo compartido.
  const transmissionInput = {
    environment,
    dteTypeCode: "11",
    version: FEX11_VERSION,
    codigoGeneracion: doc.generation_code!,
    signedJws: doc.signed_jws!,
  } as unknown as DteTransmissionInput;

  const result = await transmissionAdapter.transmit(transmissionInput);
  const now = new Date();

  // ── Caso: error técnico ────────────────────────────────────────
  if (!result.ok) {
    await prisma.$transaction([
      prisma.dteOutgoingDocument.update({
        where: { id: doc.id },
        data:  {
          retry_count: { increment: 1 },
          updated_by:  testUserId,
        },
      }),
      prisma.dteTransmissionLog.create({
        data: {
          dte_document_id: doc.id,
          attempt_number:  attemptNumber,
          operation_type:  "SEND",
          request_url:     receptionUrl,
          http_status:     result.httpStatus ?? null,
          error_message:   result.message,
          response_body:   {
            errorCode:   result.errorCode,
            message:     result.message,
            httpStatus:  result.httpStatus ?? null,
            rawResponse: result.rawResponse ?? null,
          },
        },
      }),
    ]);

    console.log(`Transmisión MH: ERROR TÉCNICO — ${result.errorCode}: ${result.message}`);
    abort(`Transmisión técnica falló: ${result.message}`);
  }

  console.log(`Transmisión MH: respuesta fiscal recibida (mhEstado=${result.mhEstado}, httpStatus=${result.httpStatus}).`);

  const finalStatus = determineFinalStatus(result);

  const mhResponseSanitized = {
    mhEstado:        result.mhEstado,
    codigoMsg:       result.codigoMsg       ?? null,
    descripcionMsg:  result.descripcionMsg  ?? null,
    fhProcesamiento: result.fhProcesamiento ?? null,
    httpStatus:      result.httpStatus,
    idEnvio:         result.idEnvio,
  };

  // ── Estado MH inesperado: mantener SIGNED ────────────────────────
  if (!finalStatus) {
    await prisma.$transaction([
      prisma.dteOutgoingDocument.update({
        where: { id: doc.id },
        data:  {
          mh_response: mhResponseSanitized,
          retry_count: { increment: 1 },
          updated_by:  testUserId,
        },
      }),
      prisma.dteTransmissionLog.create({
        data: {
          dte_document_id: doc.id,
          attempt_number:  attemptNumber,
          operation_type:  "SEND",
          request_url:     receptionUrl,
          http_status:     result.httpStatus,
          error_message:   `Estado MH inesperado: ${result.mhEstado}`,
          response_body:   mhResponseSanitized,
        },
      }),
    ]);

    console.log(`Estado MH inesperado (${result.mhEstado}). El documento se mantiene en SIGNED para reintento.`);
  }

  if (finalStatus === "ACCEPTED") {
    await prisma.$transaction([
      prisma.dteOutgoingDocument.update({
        where: { id: doc.id },
        data:  {
          dte_status:      "ACCEPTED",
          mh_response:     mhResponseSanitized,
          reception_stamp: result.selloRecibido ?? null,
          sent_at:         now,
          accepted_at:     now,
          updated_by:      testUserId,
        },
      }),
      prisma.dteTransmissionLog.create({
        data: {
          dte_document_id: doc.id,
          attempt_number:  attemptNumber,
          operation_type:  "SEND",
          request_url:     receptionUrl,
          http_status:     result.httpStatus,
          response_body:   mhResponseSanitized,
        },
      }),
    ]);
  }

  if (finalStatus === "OBSERVED") {
    const observationsJson: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue =
      result.observaciones != null
        ? (result.observaciones as Prisma.InputJsonValue)
        : Prisma.JsonNull;

    const logBodyWithObs: Prisma.InputJsonValue = {
      mhEstado:        mhResponseSanitized.mhEstado,
      codigoMsg:       mhResponseSanitized.codigoMsg,
      descripcionMsg:  mhResponseSanitized.descripcionMsg,
      fhProcesamiento: mhResponseSanitized.fhProcesamiento,
      httpStatus:      mhResponseSanitized.httpStatus,
      idEnvio:         mhResponseSanitized.idEnvio,
      observaciones:   (result.observaciones ?? null) as Prisma.InputJsonValue,
    };

    await prisma.$transaction([
      prisma.dteOutgoingDocument.update({
        where: { id: doc.id },
        data:  {
          dte_status:      "OBSERVED",
          mh_response:     mhResponseSanitized,
          reception_stamp: result.selloRecibido ?? null,
          observations:    observationsJson,
          sent_at:         now,
          observed_at:     now,
          updated_by:      testUserId,
        },
      }),
      prisma.dteTransmissionLog.create({
        data: {
          dte_document_id: doc.id,
          attempt_number:  attemptNumber,
          operation_type:  "SEND",
          request_url:     receptionUrl,
          http_status:     result.httpStatus,
          response_body:   logBodyWithObs,
        },
      }),
    ]);
  }

  if (finalStatus === "REJECTED") {
    await prisma.$transaction([
      prisma.dteOutgoingDocument.update({
        where: { id: doc.id },
        data:  {
          dte_status:       "REJECTED",
          mh_response:      mhResponseSanitized,
          rejection_reason: result.descripcionMsg ?? null,
          sent_at:          now,
          rejected_at:      now,
          updated_by:       testUserId,
        },
      }),
      prisma.dteTransmissionLog.create({
        data: {
          dte_document_id: doc.id,
          attempt_number:  attemptNumber,
          operation_type:  "SEND",
          request_url:     receptionUrl,
          http_status:     result.httpStatus,
          error_message:   result.descripcionMsg ?? null,
          response_body:   mhResponseSanitized,
        },
      }),
    ]);

    console.log("\n── MH respondió RECHAZADO ──");
    console.log(`codigoMsg:       ${result.codigoMsg ?? "null"}`);
    console.log(`descripcionMsg:  ${result.descripcionMsg ?? "null"}`);
    console.log(`observaciones:   ${result.observaciones ? JSON.stringify(result.observaciones) : "null"}`);
    console.log("Sin corrección en esta fase. Solo documentado.");
  }

  // ── 7. Releer el documento persistido para verificar contra base real ──
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
    abort("El documento desapareció después de la transmisión. Estado inconsistente.");
  }

  console.log("\n── Verificaciones post-transmisión ──");
  const checks: Array<{ label: string; pass: boolean }> = [];

  checks.push({ label: "signed_jws sigue existiendo", pass: !!finalDoc.signed_jws });
  checks.push({ label: "signed_at sigue existiendo", pass: finalDoc.signed_at !== null });
  checks.push({ label: "json_document sigue existiendo", pass: finalDoc.json_document != null });
  checks.push({ label: "control_number no cambió", pass: finalDoc.control_number === doc.control_number });
  checks.push({ label: "generation_code no cambió", pass: finalDoc.generation_code === doc.generation_code });
  checks.push({
    label: "dte_status final es ACCEPTED/OBSERVED/REJECTED/SIGNED",
    pass: ["ACCEPTED", "OBSERVED", "REJECTED", "SIGNED"].includes(finalDoc.dte_status),
  });

  let allPass = true;
  for (const c of checks) {
    const mark = c.pass ? "OK " : "FALLA";
    console.log(`  [${mark}] ${c.label}`);
    if (!c.pass) allPass = false;
  }

  console.log("\n── Confirmaciones de alcance ──");
  console.log("  transmit-dte-document.service.ts: NO modificado (SUPPORTED_TYPE_CODES sigue sin '11').");
  console.log("  transmitDteDocumentAction: NO modificado, NO invocado.");
  console.log("  MariaDB: NO ejecutado (este script no importa deliver-dte-to-external-db ni external-dte-mariadb.adapter).");
  console.log("  UI: NO tocada.");

  console.log("\n── Resumen seguro ──");
  console.log(`dte_document_id:  ${doc.id}`);
  console.log(`control_number:   ${finalDoc.control_number}`);
  console.log(`generation_code:  ${finalDoc.generation_code}`);
  console.log(`dte_status inicial: SIGNED`);
  console.log(`dte_status final: ${finalDoc.dte_status}`);
  console.log(`resultado MH:     ${result.mhEstado}`);
  console.log(`observaciones:    ${result.observaciones ? JSON.stringify(result.observaciones) : "ninguna"}`);
  console.log(`reception_stamp:  ${finalDoc.reception_stamp ? "presente" : "no presente"}`);
  console.log(`signed_jws:       ${safeJwsSummary(finalDoc.signed_jws)}`);
  console.log("transmisión ejecutada contra: TEST");
  console.log("MariaDB ejecutado: no");

  if (!allPass) {
    abort("Una o más verificaciones post-transmisión fallaron. Ver detalle arriba.");
  }

  console.log("\nVERIFICACIÓN LOCAL FEX 11 (TRANSMISIÓN CONTROLADA) COMPLETADA");
}

main()
  .catch((err) => {
    if (err instanceof AbortError) {
      console.error(`\nABORTADO: ${err.message}`);
      process.exitCode = 1;
    } else {
      console.error("\nERROR INESPERADO:");
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
