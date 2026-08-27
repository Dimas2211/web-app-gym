// ─────────────────────────────────────────────────────────────────
// commerce/dte — verify-fex11-mariadb-delivery-local.ts
//
// Microfase F3-C16B — envío controlado local/TEST del DTE FEX 11
// ACCEPTED de prueba a la base MariaDB externa, sin habilitar
// delivery público tipo 11.
//
//   DteOutgoingDocument (11, TEST, ACCEPTED — dejado por
//   verify-fex11-transmit-local.ts, F3-C15B)
//   → construir payload externo local (equivalente a
//     buildExternalDtePayload, pero permitiendo "11" solo en
//     este script)
//   → ExternalDteMariaDbAdapter.insert() directo
//   → DteTransmissionLog operation_type=EXTERNAL_DELIVERY
//
// Este script NO modifica build-external-dte-payload.service.ts ni
// su SUPPORTED_TYPES (sigue sin incluir "11"), NO modifica
// deliver-dte-to-external-db.service.ts, NO invoca
// deliverDteToExternalDbAction ni deliverDteToExternalDb, NO habilita
// delivery público tipo 11, NO toca UI, NO retransmite a Hacienda,
// NO refirma.
//
// Ejecutar (PowerShell):
//   $env:FEX11_LOCAL_TEST="YES"
//   $env:FEX11_MARIADB_TEST="YES"
//   npx tsx src/modules/commerce/dte/dev/verify-fex11-mariadb-delivery-local.ts
// ─────────────────────────────────────────────────────────────────

import "dotenv/config";
import { prisma }                      from "@/lib/db/prisma";
import { getExternalDteMariaDbConfig } from "../config/external-dte-mariadb.config";
import { ExternalDteMariaDbAdapter }   from "../adapters/external-dte-mariadb.adapter";
import type {
  ExternalDtePayload,
  ExternalDteResponseMH,
} from "../types/external-dte-delivery.types";

const EXPECTED_ID              = "3e116222-fcbe-4c9a-865e-757d654500e7";
const EXPECTED_CONTROL_NUMBER  = "DTE-11-M001P001-000000000000002";
const EXPECTED_GENERATION_CODE = "ED534152-5D0F-4A4D-AB15-4A249150AFA9";

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
  if (process.env.FEX11_MARIADB_TEST !== "YES") {
    abort('Falta confirmación explícita de delivery MariaDB. Define FEX11_MARIADB_TEST="YES" antes de ejecutar.');
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

// ── 1b. Guardas de configuración MariaDB externa (sin imprimir secretos) ──

function assertMariaDbConfigPresent(): { hostSafe: string } {
  const config = getExternalDteMariaDbConfig();

  if (!config.enabled) {
    abort("EXTERNAL_DTE_MARIADB_ENABLED no está activo. Revise variables de entorno.");
  }
  if (!config.host || !config.user || !config.password) {
    abort("Configuración MariaDB externa incompleta (host/user/password). Revise variables de entorno.");
  }
  if (!config.database) {
    abort("EXTERNAL_DTE_MARIADB_DATABASE no está configurada.");
  }
  if (!config.table) {
    abort("EXTERNAL_DTE_MARIADB_TABLE no está configurada.");
  }

  for (const marker of REMOTE_MARKERS) {
    if (config.host.toLowerCase().includes(marker)) {
      abort(`EXTERNAL_DTE_MARIADB_HOST contiene el indicador remoto "${marker}". Abortado por seguridad.`);
    }
  }

  return { hostSafe: config.host };
}

// ── 2. Localizar el DteOutgoingDocument tipo 11 ACCEPTED de prueba ──

interface TestDteCandidate {
  id:              string;
  tenant_id:       string;
  location_id:     string;
  sale_id:         string;
  dte_type_code:   string;
  control_number:  string | null;
  generation_code: string | null;
  environment:     string;
  dte_status:      string;
  accepted_at:     Date | null;
  json_document:   unknown;
  signed_jws:      string | null;
  reception_stamp: string | null;
  mh_response:     unknown;
  retry_count:     number;
}

async function findAcceptedFex11(): Promise<TestDteCandidate> {
  const doc = await prisma.dteOutgoingDocument.findFirst({
    where: { id: EXPECTED_ID },
    select: {
      id:              true,
      tenant_id:       true,
      location_id:     true,
      sale_id:         true,
      dte_type_code:   true,
      control_number:  true,
      generation_code: true,
      environment:     true,
      dte_status:      true,
      accepted_at:     true,
      json_document:   true,
      signed_jws:      true,
      reception_stamp: true,
      mh_response:     true,
      retry_count:     true,
    },
  });

  if (!doc) {
    abort(`No se encontró ningún DteOutgoingDocument con id="${EXPECTED_ID}".`);
  }
  if (doc.sale_id === null) {
    abort(`El documento (${doc.id}) no tiene sale_id asociado.`);
  }
  if (doc.dte_type_code !== "11") {
    abort(`El documento (${doc.id}) tiene dte_type_code="${doc.dte_type_code}", se esperaba "11".`);
  }
  if (doc.control_number !== EXPECTED_CONTROL_NUMBER) {
    abort(`El documento (${doc.id}) tiene control_number="${doc.control_number}", se esperaba "${EXPECTED_CONTROL_NUMBER}".`);
  }
  if (doc.generation_code !== EXPECTED_GENERATION_CODE) {
    abort(`El documento (${doc.id}) tiene generation_code="${doc.generation_code}", se esperaba "${EXPECTED_GENERATION_CODE}".`);
  }
  if (doc.environment !== "TEST") {
    abort(`El documento (${doc.id}) tiene environment="${doc.environment}", se esperaba "TEST".`);
  }
  if (doc.dte_status !== "ACCEPTED") {
    abort(`El documento (${doc.id}) tiene dte_status="${doc.dte_status}", se esperaba "ACCEPTED".`);
  }
  if (!doc.json_document) {
    abort(`El documento (${doc.id}) no tiene json_document.`);
  }
  if (!doc.signed_jws) {
    abort(`El documento (${doc.id}) no tiene signed_jws.`);
  }
  if (!doc.mh_response) {
    abort(`El documento (${doc.id}) no tiene mh_response.`);
  }
  if (!doc.reception_stamp) {
    abort(`El documento (${doc.id}) no tiene reception_stamp.`);
  }

  // doc.sale_id ya fue validado no-null arriba — se afirma explícitamente
  // aquí porque TS no propaga la narrowing de una propiedad al objeto completo.
  return { ...doc, sale_id: doc.sale_id! };
}

// ── 3. Verificar que no exista ya un log EXTERNAL_DELIVERY previo ──

async function assertNoPriorExternalDelivery(dteDocumentId: string): Promise<void> {
  const priorLogs = await prisma.dteTransmissionLog.findMany({
    where: { dte_document_id: dteDocumentId, operation_type: "EXTERNAL_DELIVERY" },
    select: { id: true, error_message: true, created_at: true },
    orderBy: { created_at: "desc" },
  });

  if (priorLogs.length === 0) return;

  const lastSuccess = priorLogs.find((l) => l.error_message === null);
  if (lastSuccess) {
    abort(
      `Ya existe un log EXTERNAL_DELIVERY exitoso (id=${lastSuccess.id}, ` +
      `created_at=${lastSuccess.created_at.toISOString()}) para este documento. No se reinserta en MariaDB.`,
    );
  }

  abort(
    `Ya existe(n) ${priorLogs.length} log(s) EXTERNAL_DELIVERY con error para este documento. ` +
    "Esta fase no reintenta automáticamente. Se requiere una fase de reintento controlado.",
  );
}

// ── 4. Resolver un usuario real del tenant para userId (trazabilidad) ──

async function resolveTestUserId(tenant_id: string): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { tenant_id },
    select: { id: true },
    orderBy: { created_at: "asc" },
  });
  if (!user) {
    abort(`No se encontró ningún User para tenant_id="${tenant_id}". Necesario para trazabilidad (deliveredBy).`);
  }
  return user.id;
}

// ── 5. Construir payload externo local (equivalente a
//      buildExternalDtePayload, permitiendo "11" solo aquí) ─────────

function buildLocalExternalPayloadForFex11(doc: TestDteCandidate): ExternalDtePayload {
  const jsonDoc        = doc.json_document as Record<string, unknown>;
  const mhRaw          = doc.mh_response   as Record<string, unknown>;
  const emisor         = jsonDoc["emisor"]  as Record<string, unknown> | undefined;
  const identificacion = jsonDoc["identificacion"] as Record<string, unknown> | undefined;

  const codigoEmpresa = (emisor?.["nrc"] as string | undefined) ?? null;
  if (!codigoEmpresa) {
    abort("No se pudo resolver codigoEmpresa/NRC del emisor desde json_document.");
  }
  if ((identificacion?.["tipoDte"] as string | undefined) !== "11") {
    abort('identificacion.tipoDte del json_document no es "11". Documento inconsistente con el tipo esperado.');
  }

  const responseMH: ExternalDteResponseMH = {
    version:          (mhRaw["version"]        as number  | undefined) ?? 2,
    ambiente:         (identificacion?.["ambiente"] as string | undefined) ?? doc.environment,
    versionApp:       (mhRaw["versionApp"]     as number  | undefined)
                      ?? (mhRaw["version"]     as number  | undefined)
                      ?? 2,
    estado:           (mhRaw["estado"]         as string  | undefined)
                      ?? (mhRaw["mhEstado"]    as string  | undefined)
                      ?? "PROCESADO",
    codigoGeneracion: doc.generation_code as string,
    selloRecibido:    doc.reception_stamp,
    fhProcesamiento:  (mhRaw["fhProcesamiento"] as string | null | undefined) ?? null,
    clasificaMsg:     (mhRaw["clasificaMsg"]    as string | null | undefined) ?? null,
    codigoMsg:        (mhRaw["codigoMsg"]       as string | null | undefined)
                      ?? (mhRaw["codigo"]       as string | null | undefined)
                      ?? null,
    descripcionMsg:   (mhRaw["descripcionMsg"]  as string | null | undefined)
                      ?? (mhRaw["descripcion"]  as string | null | undefined)
                      ?? null,
    observaciones:    Array.isArray(mhRaw["observaciones"]) ? mhRaw["observaciones"] : [],
  };

  return {
    ...jsonDoc,
    codigoEmpresa,
    responseMH,
    token: doc.signed_jws as string,
  };
}

// ── 6. main ─────────────────────────────────────────────────────────

function safeJwsSummary(jws: string | null): string {
  if (!jws) return "no presente";
  return `presente (longitud=${jws.length})`;
}

async function main() {
  const { dbHostSafe } = assertLocalEnvironment();
  console.log(`Ambiente local verificado. DB app: ${dbHostSafe}`);

  const { hostSafe } = assertMariaDbConfigPresent();
  console.log(`Configuración MariaDB externa: presente (host=${hostSafe}).`);

  const doc = await findAcceptedFex11();

  console.log("\n── Estado inicial (seguro) ──");
  console.log(`dte_document_id: ${doc.id}`);
  console.log(`sale_id:         ${doc.sale_id}`);
  console.log(`control_number:  ${doc.control_number}`);
  console.log(`generation_code: ${doc.generation_code}`);
  console.log(`dte_status:      ${doc.dte_status}`);
  console.log(`environment:     ${doc.environment}`);
  console.log(`signed_jws:      ${safeJwsSummary(doc.signed_jws)}`);
  console.log(`mh_response:     ${doc.mh_response ? "presente" : "no presente"}`);
  console.log(`reception_stamp: ${doc.reception_stamp ? "presente" : "no presente"}`);

  await assertNoPriorExternalDelivery(doc.id);
  console.log("\nSin log EXTERNAL_DELIVERY previo para este documento. Continúa.");

  const testUserId = await resolveTestUserId(doc.tenant_id);

  console.log("\n── Construyendo payload externo local (tipo 11, solo este script) ──");
  const payload = buildLocalExternalPayloadForFex11(doc);
  const payloadKeys = Object.keys(payload).sort();
  console.log(`payload construido — claves de nivel raíz (${payloadKeys.length}): ${payloadKeys.join(", ")}`);
  console.log(`payload.codigoEmpresa: ${payload.codigoEmpresa}`);
  console.log(`payload.responseMH.estado: ${payload.responseMH.estado}`);
  console.log(`payload.responseMH.codigoMsg: ${payload.responseMH.codigoMsg}`);
  console.log(`payload.token: ${safeJwsSummary(payload.token)}`);

  const config = getExternalDteMariaDbConfig();
  const adapter = new ExternalDteMariaDbAdapter();
  const attemptNumber = doc.retry_count + 1;

  console.log("\n── Insertando en MariaDB externo ──");
  const deliveryResult = await adapter.insert(config, payload);

  if (!deliveryResult.ok) {
    await prisma.dteTransmissionLog.create({
      data: {
        dte_document_id: doc.id,
        attempt_number:  attemptNumber,
        operation_type:  "EXTERNAL_DELIVERY",
        request_url:     `mariadb://${config.host}:${config.port}/${config.database}/${config.table}`,
        http_status:     null,
        error_message:   deliveryResult.error,
        response_body:   {
          ok:               false,
          errorCode:        deliveryResult.errorCode ?? null,
          targetTable:      config.table || null,
          targetDatabase:   config.database || null,
          tipoDte:          doc.dte_type_code,
          numeroControl:    doc.control_number,
          codigoGeneracion: doc.generation_code,
          deliveredBy:      testUserId,
        },
      },
    });

    console.log(`Inserción MariaDB: ERROR — ${deliveryResult.errorCode ?? "SIN_CODIGO"}: ${deliveryResult.error}`);
    abort(`Inserción en MariaDB externa falló: ${deliveryResult.error}`);
  }

  console.log(`Inserción MariaDB: OK — affectedRows=${deliveryResult.affectedRows}, insertId=${deliveryResult.insertId ?? "n/a"}.`);

  await prisma.dteTransmissionLog.create({
    data: {
      dte_document_id: doc.id,
      attempt_number:  attemptNumber,
      operation_type:  "EXTERNAL_DELIVERY",
      request_url:     `mariadb://${config.host}:${config.port}/${deliveryResult.targetDatabase}/${deliveryResult.targetTable}`,
      http_status:     null,
      error_message:   null,
      response_body:   {
        ok:               true,
        insertId:         deliveryResult.insertId?.toString() ?? null,
        affectedRows:     deliveryResult.affectedRows,
        targetTable:      deliveryResult.targetTable,
        targetDatabase:   deliveryResult.targetDatabase,
        tipoDte:          doc.dte_type_code,
        numeroControl:    doc.control_number,
        codigoGeneracion: doc.generation_code,
        deliveredBy:      testUserId,
      },
    },
  });

  console.log("DteTransmissionLog EXTERNAL_DELIVERY creado.");

  // ── 7. Releer el documento y el log persistidos para verificar contra base real ──
  const finalDoc = await prisma.dteOutgoingDocument.findFirst({
    where: { id: doc.id, tenant_id: doc.tenant_id, location_id: doc.location_id },
    select: {
      dte_status:      true,
      signed_jws:      true,
      reception_stamp: true,
      mh_response:     true,
      json_document:   true,
      control_number:  true,
      generation_code: true,
    },
  });

  if (!finalDoc) {
    abort("El documento desapareció después del delivery externo. Estado inconsistente.");
  }

  const finalLogs = await prisma.dteTransmissionLog.findMany({
    where: { dte_document_id: doc.id, operation_type: "EXTERNAL_DELIVERY" },
    select: { id: true, error_message: true },
  });

  console.log("\n── Verificaciones post-delivery ──");
  const checks: Array<{ label: string; pass: boolean }> = [
    { label: "dte_status sigue ACCEPTED", pass: finalDoc.dte_status === "ACCEPTED" },
    { label: "signed_jws sigue presente", pass: !!finalDoc.signed_jws },
    { label: "reception_stamp sigue presente", pass: !!finalDoc.reception_stamp },
    { label: "mh_response sigue presente", pass: finalDoc.mh_response != null },
    { label: "json_document sigue presente", pass: finalDoc.json_document != null },
    { label: "control_number no cambió", pass: finalDoc.control_number === doc.control_number },
    { label: "generation_code no cambió", pass: finalDoc.generation_code === doc.generation_code },
    { label: "existe al menos un log EXTERNAL_DELIVERY exitoso", pass: finalLogs.some((l) => l.error_message === null) },
  ];

  let allPass = true;
  for (const c of checks) {
    const mark = c.pass ? "OK " : "FALLA";
    console.log(`  [${mark}] ${c.label}`);
    if (!c.pass) allPass = false;
  }

  console.log("\n── Confirmaciones de alcance ──");
  console.log("  build-external-dte-payload.service.ts: NO modificado (SUPPORTED_TYPES sigue sin '11').");
  console.log("  deliver-dte-to-external-db.service.ts: NO modificado, NO invocado.");
  console.log("  deliverDteToExternalDbAction: NO invocada.");
  console.log("  transmit-dte-document.service.ts / MH: NO invocado (sin retransmisión ni refirma).");
  console.log("  UI: NO tocada.");

  console.log("\n── Resumen seguro ──");
  console.log(`dte_document_id:  ${finalDoc.control_number ? doc.id : doc.id}`);
  console.log(`control_number:   ${finalDoc.control_number}`);
  console.log(`generation_code:  ${finalDoc.generation_code}`);
  console.log(`dte_status:       ${finalDoc.dte_status}`);
  console.log(`MariaDB insertId: ${deliveryResult.insertId ?? "n/a"}`);
  console.log(`MariaDB affectedRows: ${deliveryResult.affectedRows}`);
  console.log(`MariaDB target: ${deliveryResult.targetDatabase}.${deliveryResult.targetTable}`);

  if (!allPass) {
    abort("Una o más verificaciones post-delivery fallaron. Ver detalle arriba.");
  }

  console.log("\nVERIFICACIÓN LOCAL FEX 11 (DELIVERY MARIADB CONTROLADO) COMPLETADA");
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
