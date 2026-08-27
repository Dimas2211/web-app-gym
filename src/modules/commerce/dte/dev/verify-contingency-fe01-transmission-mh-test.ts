// ─────────────────────────────────────────────────────────────────
// commerce/dte — verify-contingency-fe01-transmission-mh-test.ts
//
// Bloque C (cierre de certificación de contingencia MH) — SEGUNDA
// prueba real contra MH TEST. Toma el FE01 EXACTO ya reportado por
// el Evento de Contingencia ACCEPTED (Bloque B) y:
//
//   Evento ACCEPTED (ya persistido)
//   → localizar el FE01 exacto reportado (SCHEMA_VALIDATED)
//   → AJV de re-confirmación (solo lectura, sin tocar Prisma)
//   → signDteDocument (firmador real → SIGNED)
//   → guard assertDteContingencyTransmissionAllowed (informativo, el mismo
//     guard ya corre dentro de transmitDteDocument)
//   → transmitDteDocument (POST /fesv/recepciondte TEST → ACCEPTED|OBSERVED|REJECTED)
//
// NO crea un DTE nuevo. NO regenera generation_code/control_number.
// NO crea un nuevo Evento de Contingencia.
//
// Guard de seguridad: aborta si DTE_ENVIRONMENT !== "TEST" o si
// DATABASE_URL no apunta a localhost.
//
// Ejecutar (PowerShell):
//   $env:CONTINGENCY_MH_TEST_RUN="YES"
//   npx tsx src/modules/commerce/dte/dev/verify-contingency-fe01-transmission-mh-test.ts
// ─────────────────────────────────────────────────────────────────

import "dotenv/config";
import Ajv        from "ajv";
import addFormats  from "ajv-formats";
import { prisma } from "@/lib/db/prisma";
import feSchema    from "../schemas/mh/fe-01.schema.json";
import { signDteDocument }      from "../services/sign-dte-document.service";
import { transmitDteDocument }  from "../services/transmit-dte-document.service";
import { assertDteContingencyTransmissionAllowed } from "../services/assert-dte-contingency-transmission-allowed.service";

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

function sanitizeControlNumber(cn: string | null): string {
  if (!cn) return "(sin numeroControl)";
  return cn.length > 10 ? `${cn.slice(0, 6)}…${cn.slice(-4)}` : cn;
}

// ── main ─────────────────────────────────────────────────────────

async function main() {
  const { dbHostSafe } = assertSafeToRun();
  console.log(`Ambiente verificado — DTE_ENVIRONMENT=TEST. DB: ${dbHostSafe}`);

  // ── 1. Identificar exactamente el DTE reportado por el Evento ACCEPTED ──
  const event = await prisma.dteContingencyEvent.findFirst({
    where:  { status: "ACCEPTED" },
    orderBy: { created_at: "desc" },
    include: { items: { include: { dte_document: true } } },
  });
  if (!event) abort("No existe ningún DteContingencyEvent con status=ACCEPTED en la base local. Ejecuta primero Bloque B.");
  if (event.mh_estado !== "RECIBIDO") {
    abort(`El Evento ACCEPTED no tiene mh_estado="RECIBIDO" (mh_estado="${event.mh_estado}"). Revisar antes de continuar.`);
  }
  if (event.items.length !== 1) {
    abort(`Se esperaba exactamente 1 item en el Evento ACCEPTED; se encontraron ${event.items.length}.`);
  }

  const item = event.items[0];
  const dte  = item.dte_document;

  if (dte.dte_type_code !== "01") abort(`dte.dte_type_code inesperado: "${dte.dte_type_code}" (se esperaba "01").`);
  if (dte.transmission_type_code !== "2") abort(`dte.transmission_type_code inesperado: "${dte.transmission_type_code}" (se esperaba "2").`);
  if (dte.contingency_type_code !== event.contingency_type_code) {
    abort(`dte.contingency_type_code ("${dte.contingency_type_code}") no coincide con event.contingency_type_code ("${event.contingency_type_code}").`);
  }
  if (!dte.generation_code) abort("El DTE reportado no tiene generation_code.");

  // Confirmar que el generation_code del DTE coincide EXACTAMENTE con el
  // detalleDTE persistido en event_json (no solo el puente relacional).
  const detalleDTE = (event.event_json as { detalleDTE?: Array<{ codigoGeneracion?: string }> } | null)?.detalleDTE ?? [];
  const matchesEventDetail = detalleDTE.some(
    (d) => (d.codigoGeneracion ?? "").toUpperCase() === dte.generation_code!.toUpperCase(),
  );
  if (!matchesEventDetail) {
    abort("El generation_code del DTE NO coincide con el detalleDTE.codigoGeneracion almacenado en event_json del Evento.");
  }

  if (dte.dte_status === "ACCEPTED") {
    abort("El DTE ya está ACCEPTED — no hay nada que hacer. Bloque C ya se completó anteriormente para este DTE.");
  }
  if (dte.dte_status !== "SCHEMA_VALIDATED") {
    abort(`El DTE debe estar SCHEMA_VALIDATED antes de continuar. Estado actual: "${dte.dte_status}".`);
  }
  if (!dte.json_document) abort("El DTE no tiene json_document persistido.");

  console.log("\n── 1. Identificación del DTE reportado (sanitizada) ──");
  console.log(`  event.id:              ${event.id}`);
  console.log(`  event.generation_code: ${event.generation_code}`);
  console.log(`  event.status:          ${event.status}`);
  console.log(`  event.mh_sello:        ${event.mh_sello_recibido}`);
  console.log(`  dte.id:                ${dte.id}`);
  console.log(`  dte.generation_code:   ${dte.generation_code}`);
  console.log(`  dte.dte_type_code:     ${dte.dte_type_code}`);
  console.log(`  dte.dte_status:        ${dte.dte_status}`);
  console.log(`  transmission_type_code:${dte.transmission_type_code}`);
  console.log(`  contingency_type_code: ${dte.contingency_type_code}`);

  // ── 2. AJV de re-confirmación sobre json_document persistido (solo lectura) ──
  const documentData =
    typeof dte.json_document === "string" ? JSON.parse(dte.json_document as string) : dte.json_document;

  const ajv = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 2 });
  addFormats(ajv);
  const validate = ajv.compile(feSchema as object);
  const valid = validate(documentData);

  console.log(`\n── 2. AJV de re-confirmación (fe-01.schema.json) ──`);
  if (!valid) {
    console.log(`  AJV: FAIL`);
    console.log(JSON.stringify(validate.errors, null, 2));
    abort("AJV falló sobre el json_document ya persistido. DETENIÉNDOSE — no se reconstruye automáticamente.");
  }
  console.log(`  AJV: PASS`);

  // ── 3. Contexto tenant/location/user ────────────────────────────
  const { tenant_id, location_id } = dte;
  const user = await prisma.user.findFirst({
    where:  { tenant_id },
    select: { id: true },
    orderBy: { created_at: "asc" },
  });
  if (!user) abort(`No se encontró ningún User para tenant_id="${tenant_id}".`);

  // ── 4. Firmar (SCHEMA_VALIDATED → SIGNED) usando el servicio existente ──
  console.log("\n── 3. Firma del FE01 ──");
  const beforeGenerationCode = dte.generation_code;
  const beforeControlNumber  = dte.control_number;

  const signed = await signDteDocument({
    dteDocumentId: dte.id,
    userId:        user.id,
    tenantId:      tenant_id,
    locationId:    location_id,
  });
  if (!signed.ok) abort(`signDteDocument falló: ${signed.error}`);
  console.log(`  dte_status: SIGNED`);
  console.log(`  signedAt:   ${signed.signedAt}`);

  const afterSign = await prisma.dteOutgoingDocument.findUnique({
    where:  { id: dte.id },
    select: {
      dte_status: true, signed_jws: true, generation_code: true, control_number: true,
      transmission_type_code: true, contingency_type_code: true,
    },
  });
  if (!afterSign) abort("No se pudo releer el documento tras la firma.");
  if (afterSign.dte_status !== "SIGNED") abort(`Estado post-firma inesperado: ${afterSign.dte_status}`);
  if (!afterSign.signed_jws) abort("signed_jws ausente tras firma.");
  if (afterSign.generation_code !== beforeGenerationCode) abort("generation_code cambió durante la firma — DETENIÉNDOSE.");
  if (afterSign.control_number !== beforeControlNumber) abort("control_number cambió durante la firma — DETENIÉNDOSE.");
  if (afterSign.transmission_type_code !== "2") abort("transmission_type_code cambió durante la firma — DETENIÉNDOSE.");
  if (afterSign.contingency_type_code !== dte.contingency_type_code) abort("contingency_type_code cambió durante la firma — DETENIÉNDOSE.");

  console.log("  Confirmado: generation_code, control_number, transmission_type_code y contingency_type_code no cambiaron.");

  // ── 5. Guard informativo (el mismo guard corre dentro de transmitDteDocument) ──
  const guardCheck = await assertDteContingencyTransmissionAllowed({
    dteDocumentId:        dte.id,
    tenantId:             tenant_id,
    locationId:           location_id,
    transmissionTypeCode: afterSign.transmission_type_code,
    contingencyTypeCode:  afterSign.contingency_type_code,
    generationCode:       afterSign.generation_code,
  });

  // ── 6. Preflight sanitizado antes de transmitir ─────────────────
  console.log("\n── 4. Preflight antes de transmitir a MH TEST ──");
  console.log(`  AMBIENTE:            ${process.env.DTE_ENVIRONMENT} (00/TEST)`);
  console.log(`  EVENTO.id:            ${event.id}`);
  console.log(`  EVENTO.generation_code: ${event.generation_code}`);
  console.log(`  EVENTO.status:        ${event.status}`);
  console.log(`  EVENTO.mh_estado:     ${event.mh_estado}`);
  console.log(`  EVENTO.mh_sello:      ${event.mh_sello_recibido}`);
  console.log(`  DTE.dte_type_code:    01`);
  console.log(`  DTE.generation_code:  ${afterSign.generation_code}`);
  console.log(`  DTE.control_number:   ${sanitizeControlNumber(afterSign.control_number)}`);
  console.log(`  DTE.dte_status:       ${afterSign.dte_status}`);
  console.log(`  DTE.transmission_type_code: ${afterSign.transmission_type_code}`);
  console.log(`  DTE.contingency_type_code:  ${afterSign.contingency_type_code}`);
  console.log(`  GUARD.contingency_transmission_allowed: ${guardCheck.ok}`);
  console.log(`  AJV: PASS`);

  if (!guardCheck.ok) {
    abort(`Guard bloqueó la transmisión (no debería ocurrir aquí): ${guardCheck.error}`);
  }

  // ── 7. Transmisión real a MH TEST ───────────────────────────────
  console.log("\n── 5. Transmisión a MH TEST (/fesv/recepciondte) ──");
  const transmitted = await transmitDteDocument({
    dteDocumentId: dte.id,
    userId:        user.id,
    tenantId:      tenant_id,
    locationId:    location_id,
  });

  if (!transmitted.ok) {
    console.log(`  ERROR: ${transmitted.error}`);
  } else {
    console.log(`  dteStatus:      ${transmitted.dteStatus}`);
    console.log(`  mhEstado:       ${transmitted.mhEstado}`);
    console.log(`  descripcionMsg: ${transmitted.descripcionMsg}`);
    console.log(`  selloRecibido:  ${transmitted.selloRecibido}`);
  }

  const finalDte = await prisma.dteOutgoingDocument.findUnique({
    where:  { id: dte.id },
    select: {
      dte_status: true, generation_code: true, control_number: true, reception_stamp: true,
      mh_response: true, observations: true, rejection_reason: true,
      transmission_type_code: true, contingency_type_code: true,
    },
  });

  console.log("\n── 6. Estado final persistido (sanitizado) ──");
  console.log(JSON.stringify({
    dte_status:      finalDte?.dte_status,
    generation_code: finalDte?.generation_code,
    control_number:  sanitizeControlNumber(finalDte?.control_number ?? null),
    reception_stamp: finalDte?.reception_stamp,
    mh_response:     finalDte?.mh_response,
    observations:    finalDte?.observations,
    rejection_reason: finalDte?.rejection_reason,
    transmission_type_code: finalDte?.transmission_type_code,
    contingency_type_code:  finalDte?.contingency_type_code,
  }, null, 2));

  console.log("\n── 7. Comparación generation_code Evento vs DTE informado ──");
  console.log(`  event detalleDTE.codigoGeneracion: ${dte.generation_code}`);
  console.log(`  dte.generation_code (final):        ${finalDte?.generation_code}`);
  console.log(`  coinciden: ${finalDte?.generation_code === dte.generation_code}`);

  console.log("\n── Criterio de cierre ──");
  const eventClosed = event.status === "ACCEPTED" && !!event.mh_sello_recibido;
  const dteClosed    = finalDte?.dte_status === "ACCEPTED" && !!finalDte?.reception_stamp;
  console.log(`  Evento ACCEPTED + sello MH: ${eventClosed}`);
  console.log(`  DTE ACCEPTED + sello MH:    ${dteClosed}`);
  console.log(`  MICROFASE CERRADA: ${eventClosed && dteClosed}`);
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
