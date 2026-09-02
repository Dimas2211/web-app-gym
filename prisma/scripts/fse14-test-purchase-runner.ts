/**
 * fse14-test-purchase-runner.ts
 *
 * PASO 6B — FASE 3. Runner de soporte, controlado y explícito, para
 * preparar un FSE 14 (TEST) desde una Purchase candidata en TrustMeDB
 * Runtime, vía el Runtime Database Router. Continuación directa de
 * audit-trustme-dte-runtime.ts (FASE 1) y health-check-dte-signer-test.ts
 * (FASE 2).
 *
 * Cubre, como máximo en esta fase:
 *   1. resolver profileId TrustMe Runtime (por organización)
 *   2. conectar vía withRuntimePrisma (Runtime Database Router)
 *   3. seleccionar Purchase candidata explícita (--purchase)
 *   4. resolver DteIssuerConfig TEST explícita por id (--issuer),
 *      SIN filtrar por is_active (Opción B aprobada — ver runbook).
 *      Nunca escribe DteIssuerConfig. Nunca activa/desactiva nada.
 *   5. reservar correlativo TEST tipo 14 (reserveDteControlNumber real)
 *   6. crear DteOutgoingDocument PENDING_GENERATION
 *   7. generar JSON FSE14 (buildFseJsonFromLoadedData real — función pura)
 *   8. validar contra el schema AJV oficial MH (fse-14.schema.json)
 *   9. dejar el documento en SCHEMA_VALIDATED, listo para firma (fase futura)
 *
 * NO firma. NO transmite a Hacienda. NO usa PRODUCTION. NO toca MariaDB
 * externa. NO toca schema.prisma. NO imprime secrets ni signed_jws.
 *
 * Pasos disponibles (--step), cada uno con su propia confirmación textual
 * en modo EXECUTE — igual que create-pending / generate-json ya están
 * separados como dos operaciones distintas en el flujo normal de la app:
 *
 *   INSPECT   — solo lectura. Muestra Purchase + DteIssuerConfig + estado
 *               de correlativo TEST/14. No requiere confirmación.
 *   CREATE    — reserva correlativo + crea DteOutgoingDocument PENDING_GENERATION.
 *               Confirmación: "CREATE FSE14 TEST"
 *   GENERATE  — genera json_document (GENERATED) sobre un documento ya creado.
 *               Confirmación: "GENERATE FSE14 TEST"
 *   VALIDATE  — valida el JSON contra el schema AJV oficial (SCHEMA_VALIDATED).
 *               Confirmación: "VALIDATE FSE14 TEST"
 *   VERIFY    — solo lectura. Confirma qué quedó realmente escrito para una
 *               Purchase (DteOutgoingDocument, DteCorrelative TEST/14,
 *               PlatformDeploymentLog). Sin confirmación — nunca escribe.
 *   SIGN      — PASO 6B FASE 4. Firma un DteOutgoingDocument SCHEMA_VALIDATED
 *               contra el firmador remoto TEST (DTE_SIGNER_URL_TEST). Espejo
 *               de sign-dte-document.service.ts, reimplementado contra el
 *               client runtime (ese servicio usa Prisma global). Nunca opera
 *               PRODUCTION — rechaza cualquier documento cuyo `environment`
 *               no sea exactamente "TEST", sin importar qué se le pida.
 *               Confirmación: "SIGN FSE14 TEST". NO transmite a Hacienda.
 *   TRANSMIT  — PASO 6B FASE 5. Transmite un DteOutgoingDocument SIGNED al
 *               endpoint MH TEST (recepciondte). Espejo de
 *               transmit-dte-document.service.ts, reimplementado contra el
 *               client runtime. Nunca opera PRODUCTION — rechaza cualquier
 *               documento cuyo `environment` no sea exactamente "TEST", y
 *               siempre llama al adapter con environment:"TEST" hardcodeado.
 *               Se detiene si el documento ya tiene reception_stamp (ya
 *               transmitido). transmission_type_code distinto de "1"
 *               (contingencia) queda fuera de alcance — se rechaza.
 *               Confirmación: "TRANSMIT FSE14 TEST". NO vuelve a firmar,
 *               NO toca signed_jws, NO dispara delivery a MariaDB externa.
 *   DELIVER   — PASO 6B FASE 6. Entrega un DteOutgoingDocument ACCEPTED/
 *               OBSERVED (con reception_stamp) a la base MariaDB externa.
 *               Espejo de deliver-dte-to-external-db.service.ts, reimplementado
 *               contra el client runtime — la razón de ser de este step: la
 *               Server Action real (deliver-dte-to-external-db.action.ts) usa
 *               Prisma GLOBAL y por diseño no es runtime-aware (ver auditoría
 *               previa), así que el botón "Enviar DTE externo" de
 *               /dashboard/dte/outgoing no puede alcanzar documentos que solo
 *               existen en TrustMe Runtime. Este step NO toca esa Server
 *               Action ni el botón — reutiliza sin modificar
 *               buildExternalDtePayload() (función pura) y
 *               ExternalDteMariaDbAdapter (mysql2 puro, no usa Prisma).
 *               No modifica dte_status. No toca signed_jws. No firma. No
 *               transmite a MH. Se detiene si ya existe un
 *               EXTERNAL_DELIVERY exitoso previo (mismo criterio que
 *               canDeliverExternal). Confirmación: "DELIVER FSE14 TEST".
 *
 * Modo (--mode): DRY_RUN (default) | EXECUTE.
 *   DRY_RUN de CREATE/GENERATE/VALIDATE reutiliza la misma lógica de
 *   validación/precondiciones que EXECUTE pero nunca escribe.
 *
 * USO (PowerShell), con DATABASE_URL/DIRECT_URL/PLATFORM_ENCRYPTION_KEY
 * de control plane ya en el entorno (.env local):
 *
 *   # 1. Ver candidatos y estado (solo lectura)
 *   npx tsx prisma/scripts/fse14-test-purchase-runner.ts --org "TrustMe" --step INSPECT
 *
 *   # 2. Dry-run de creación contra una Purchase e issuer TEST específicos
 *   npx tsx prisma/scripts/fse14-test-purchase-runner.ts --org "TrustMe" --step CREATE `
 *     --purchase <purchaseId> --issuer <issuerConfigIdTEST> --mode DRY_RUN
 *
 *   # 3. Ejecutar creación real (requiere confirmación exacta)
 *   npx tsx prisma/scripts/fse14-test-purchase-runner.ts --org "TrustMe" --step CREATE `
 *     --purchase <purchaseId> --issuer <issuerConfigIdTEST> --mode EXECUTE `
 *     --confirm "CREATE FSE14 TEST"
 *
 *   # 4. Generar JSON sobre el documento ya creado
 *   npx tsx prisma/scripts/fse14-test-purchase-runner.ts --org "TrustMe" --step GENERATE `
 *     --dte <dteDocumentId> --mode EXECUTE --confirm "GENERATE FSE14 TEST"
 *
 *   # 5. Validar schema AJV
 *   npx tsx prisma/scripts/fse14-test-purchase-runner.ts --org "TrustMe" --step VALIDATE `
 *     --dte <dteDocumentId> --mode EXECUTE --confirm "VALIDATE FSE14 TEST"
 *
 *   # 6. Verificación read-only post-incidente (¿quedó algo escrito o no?)
 *   npx tsx prisma/scripts/fse14-test-purchase-runner.ts --org "TrustMe" --step VERIFY `
 *     --purchase <purchaseId>
 *
 *   # 7. Firma — dry-run (no llama al firmador, no escribe nada)
 *   npx tsx prisma/scripts/fse14-test-purchase-runner.ts --org "TrustMe" --step SIGN `
 *     --dte <dteDocumentId> --mode DRY_RUN
 *
 *   # 8. Firma — ejecución real contra el firmador TEST remoto
 *   npx tsx prisma/scripts/fse14-test-purchase-runner.ts --org "TrustMe" --step SIGN `
 *     --dte <dteDocumentId> --mode EXECUTE --confirm "SIGN FSE14 TEST"
 *
 *   # 9. Transmisión — dry-run (no llama a MH, no escribe nada)
 *   npx tsx prisma/scripts/fse14-test-purchase-runner.ts --org "TrustMe" --step TRANSMIT `
 *     --dte <dteDocumentId> --mode DRY_RUN
 *
 *   # 10. Transmisión — ejecución real contra MH TEST
 *   npx tsx prisma/scripts/fse14-test-purchase-runner.ts --org "TrustMe" --step TRANSMIT `
 *     --dte <dteDocumentId> --mode EXECUTE --confirm "TRANSMIT FSE14 TEST"
 *
 *   # 11. Delivery MariaDB externa — dry-run (no conecta, no escribe nada)
 *   npx tsx prisma/scripts/fse14-test-purchase-runner.ts --org "TrustMe" --step DELIVER `
 *     --dte <dteDocumentId> --mode DRY_RUN
 *
 *   # 12. Delivery MariaDB externa — ejecución real (INSERT único)
 *   npx tsx prisma/scripts/fse14-test-purchase-runner.ts --org "TrustMe" --step DELIVER `
 *     --dte <dteDocumentId> --mode EXECUTE --confirm "DELIVER FSE14 TEST"
 *
 * Variables de entorno requeridas para --step SIGN (nunca se imprimen):
 *   DATABASE_URL / DIRECT_URL / PLATFORM_ENCRYPTION_KEY  — control plane (ya
 *     requeridas por FASE 1-3, resuelven organización + credenciales runtime).
 *   DTE_SIGNER_URL_TEST   — https://firmador-test.getzolvi.com/firmardocumento/
 *   DTE_SIGNER_API_KEY    — header X-DTE-Signer-Key del firmador remoto (VPS).
 *   DTE_SIGNER_NIT        — NIT del firmante (mismo que usa signDteDocument real).
 *   DTE_SIGNER_PASSWORD   — password privada del certificado.
 *   DTE_SIGNER_TIMEOUT_MS — opcional, default 10000.
 *   (DTE_SIGNER_URL_PRODUCTION nunca se lee en este step — SIGN es TEST-only.)
 *
 * Variables de entorno requeridas para --step TRANSMIT (nunca se imprimen):
 *   DTE_MH_USER / DTE_MH_PASSWORD — fallback oficial de credenciales MH TEST
 *     (dte-credential.service.ts) — usado porque no existe DteCredential
 *     local utilizable para un issuer_config_id de TrustMe Runtime.
 *   DTE_MH_AUTH_URL_TEST / DTE_MH_RECEPTION_URL_TEST — opcionales, default a
 *     las URLs oficiales apitest.dtes.mh.gob.sv hardcodeadas en dte-mh.config.ts.
 *   DTE_MH_TIMEOUT_MS — opcional, default 8000.
 *   (DTE_MH_*_PROD nunca se lee en este step — TRANSMIT es TEST-only.)
 *
 * Variables de entorno requeridas para --step DELIVER (password nunca se imprime):
 *   EXTERNAL_DTE_MARIADB_ENABLED  — debe ser exactamente "true".
 *   EXTERNAL_DTE_MARIADB_HOST / _PORT (default 3306) / _USER / _PASSWORD
 *   EXTERNAL_DTE_MARIADB_DATABASE / _TABLE — sin fallback silencioso si faltan.
 *   EXTERNAL_DTE_MARIADB_TIMEOUT_MS — opcional, default 10000.
 *   (Mismas variables que usa el botón real "Enviar DTE externo" — no hay
 *   variante TEST/PROD separada para el destino MariaDB.)
 *
 * created_by / updated_by (F3-C25 — corrección post-incidente FK):
 *   dte_outgoing_documents.created_by / .updated_by son FK opcionales
 *   (String?) hacia User.id DE LA MISMA BASE donde se inserta la fila —
 *   NUNCA un id de PlatformOrganization/control plane, ni un literal
 *   arbitrario. Este runner no tiene sesión (es CLI), así que por defecto
 *   created_by/updated_by quedan NULL (permitido por schema). Si querés
 *   atribuir la operación a un usuario real de TrustMe Runtime, pasá
 *   --actor <userId> — el runner valida que ese id exista como User en el
 *   tenant runtime ANTES de escribir nada (en DRY_RUN y en EXECUTE). Usa
 *   --step INSPECT para ver candidatos válidos (super_admin/branch_admin
 *   activos, sin datos sensibles).
 */

import "dotenv/config";
import { randomUUID, createHash } from "crypto";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import Ajv from "ajv";
import addFormats from "ajv-formats";

import { controlPlanePrisma } from "../../src/modules/platform/runtime/control-plane-prisma";
import {
  withRuntimePrisma,
  RuntimeDatabaseRouterError,
} from "../../src/modules/platform/runtime/runtime-database-router";
import { reserveDteControlNumber } from "../../src/modules/commerce/dte/services/dte-correlative.service";
import {
  buildFseJsonFromLoadedData,
  type FseLoadedData,
} from "../../src/modules/commerce/dte/services/generate-fse-json.service";
import type { FseJsonDocument } from "../../src/modules/commerce/dte/types/fse-json.types";
import { FSE_ELIGIBLE_DOCUMENT_TYPES } from "../../src/modules/commerce/purchases/constants/purchase-document.constants";
import fseSchema from "../../src/modules/commerce/dte/schemas/mh/fse-14.schema.json";
import { resolveDteSignerConfigForIssuer } from "../../src/modules/commerce/dte/services/dte-credential.service";
import { MhHttpDteSignerAdapter } from "../../src/modules/commerce/dte/adapters/dte-signer.adapter";
import { resolveDteMhUrls } from "../../src/modules/commerce/dte/config/dte-mh.config";
import { MhDteTransmissionAdapter } from "../../src/modules/commerce/dte/adapters/dte-transmission.adapter";
import type { DteTransmissionSuccessResult } from "../../src/modules/commerce/dte/types/dte-transmission.types";
import { isFiscallyReceivedByMh } from "../../src/modules/commerce/dte/utils/dte-fiscal-receipt.utils";
import { isSuccessfulDeliveryLog, type DeliveryLog } from "../../src/modules/commerce/dte/outgoing/utils/dte-delivery-summary.utils";
import {
  buildExternalDtePayload,
  type DteDocumentForExternalPayload,
} from "../../src/modules/commerce/dte/services/build-external-dte-payload.service";
import { getExternalDteMariaDbConfig } from "../../src/modules/commerce/dte/config/external-dte-mariadb.config";
import { ExternalDteMariaDbAdapter } from "../../src/modules/commerce/dte/adapters/external-dte-mariadb.adapter";

// ─────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────

type Step = "INSPECT" | "CREATE" | "GENERATE" | "VALIDATE" | "VERIFY" | "SIGN" | "TRANSMIT" | "DELIVER";
type Mode = "DRY_RUN" | "EXECUTE";

const CONFIRMATION_TEXT: Record<"CREATE" | "GENERATE" | "VALIDATE" | "SIGN" | "TRANSMIT" | "DELIVER", string> = {
  CREATE:    "CREATE FSE14 TEST",
  GENERATE:  "GENERATE FSE14 TEST",
  VALIDATE:  "VALIDATE FSE14 TEST",
  SIGN:      "SIGN FSE14 TEST",
  TRANSMIT:  "TRANSMIT FSE14 TEST",
  DELIVER:   "DELIVER FSE14 TEST",
};

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const ORG_QUERY   = argValue("--org") ?? "TrustMe";
const STEP        = (argValue("--step") ?? "INSPECT").toUpperCase() as Step;
const MODE        = (argValue("--mode") ?? "DRY_RUN").toUpperCase() as Mode;
const PURCHASE_ID = argValue("--purchase");
const ISSUER_ID   = argValue("--issuer");
const DTE_ID      = argValue("--dte");
const CONFIRM     = argValue("--confirm");
const ACTOR_ID    = argValue("--actor"); // User.id runtime válido para created_by/updated_by — opcional, default NULL

const VALID_STEPS: Step[] = ["INSPECT", "CREATE", "GENERATE", "VALIDATE", "VERIFY", "SIGN", "TRANSMIT", "DELIVER"];

class RunnerInputError extends Error {}

// Valida --actor contra User de la MISMA base runtime, del mismo tenant.
// Nunca acepta un id de control plane. Si --actor no se pasó, devuelve
// null (permitido por schema — created_by/updated_by son String?).
async function resolveActorId(client: PrismaClient, tenantId: string): Promise<string | null> {
  if (!ACTOR_ID) return null;
  const user = await client.user.findFirst({
    where: { id: ACTOR_ID, tenant_id: tenantId },
    select: { id: true },
  });
  if (!user) {
    throw new RunnerInputError(
      `--actor "${ACTOR_ID}" no existe como User en el tenant runtime, o pertenece a otro tenant. ` +
      `Usa --step INSPECT para ver candidatos válidos.`,
    );
  }
  return user.id;
}

// ─────────────────────────────────────────────────────────────────
// INSPECT — solo lectura
// ─────────────────────────────────────────────────────────────────

async function stepInspect(client: PrismaClient, tenantId: string) {
  console.log("\n[INSPECT] Solo lectura. No se escribe nada.\n");

  const issuerConfigs = await client.dteIssuerConfig.findMany({
    where: { tenant_id: tenantId, environment: "TEST" },
    select: {
      id: true, is_active: true, nit: true, name: true,
      cod_estable_mh: true, cod_punto_venta_mh: true, location_id: true,
    },
  });
  console.log(`[DteIssuerConfig TEST] total: ${issuerConfigs.length}`);
  for (const c of issuerConfigs) {
    console.log(
      `  - id=${c.id} active=${c.is_active} nit=${c.nit ?? "?"} name="${c.name}" ` +
      `codEstable=${c.cod_estable_mh ?? "?"} codPV=${c.cod_punto_venta_mh ?? "?"} location=${c.location_id}`,
    );
  }
  const issuerLocations = new Set(issuerConfigs.map((c) => c.location_id));

  // F3-C27 — Candidatos con desglose fiscal completo. No requiere CREATE
  // previo: el cálculo de totalCompra/totalPagar candidato se hace en
  // memoria con la MISMA fórmula que buildFseJsonFromLoadedData, sin tocar
  // DteOutgoingDocument ni reservar correlativo.
  const purchases = await client.purchase.findMany({
    where: {
      tenant_id: tenantId,
      status:    "CONFIRMED",
      document_type: { in: [...FSE_ELIGIBLE_DOCUMENT_TYPES] },
      dte_documents: { none: { dte_type_code: "14", dte_status: { notIn: ["NOT_REQUIRED", "INVALIDATED", "REJECTED"] } } },
    },
    select: {
      id: true, purchase_code: true, location_id: true,
      total_amount: true, tax_amount: true,
      retention_1pct_applies: true, retention_1pct_amount: true,
      income_tax_withholding_applies: true, income_tax_withholding_amount: true,
      supplier: { select: { id: true, name: true, taxpayer_type: true } },
      items: { select: { line_subtotal: true } },
    },
    orderBy: { created_at: "desc" },
    take: 10,
  });

  console.log(`\n[Candidatas FSE14 — desglose fiscal] document_type FSE, CONFIRMED, sin DTE14 activo: ${purchases.length}`);
  for (const p of purchases) {
    const totalAmount = Number(p.total_amount);
    const taxAmount   = Number(p.tax_amount);
    const subTotal    = Math.round(p.items.reduce((s, i) => s + Number(i.line_subtotal), 0) * 100) / 100;
    const ivaRete1    = p.retention_1pct_applies ? Number(p.retention_1pct_amount) : 0;
    const reteRenta   = p.income_tax_withholding_applies ? Number(p.income_tax_withholding_amount) : 0;
    const totalCompra = subTotal; // descu siempre 0 en Purchase
    const totalPagarCandidato = Math.round((totalCompra - ivaRete1 - reteRenta) * 100) / 100;
    const locationMatches = issuerLocations.has(p.location_id);

    const reasons: string[] = [];
    if (p.supplier.taxpayer_type !== "EXCLUDED_SUBJECT") reasons.push(`supplier.taxpayer_type=${p.supplier.taxpayer_type} (se requiere EXCLUDED_SUBJECT)`);
    if (taxAmount !== 0) reasons.push(`tax_amount=${taxAmount} (FSE debe ser 0 — nunca genera crédito fiscal IVA)`);
    if (Math.abs(totalAmount - (subTotal + taxAmount)) > 0.01) reasons.push(`total_amount(${totalAmount}) ≠ subTotal(${subTotal}) + tax_amount(${taxAmount})`);
    if (!locationMatches) reasons.push(`location=${p.location_id} sin DteIssuerConfig TEST en esa location`);
    if (p.items.length === 0) reasons.push("sin líneas de detalle");

    const clean = reasons.length === 0;

    console.log(
      `\n  - id=${p.id} code=${p.purchase_code} supplier="${p.supplier.name}" taxpayer_type=${p.supplier.taxpayer_type} location=${p.location_id}`,
    );
    console.log(`    total_amount=${totalAmount} tax_amount=${taxAmount} subTotal(líneas)=${subTotal}`);
    console.log(`    retention_1pct: applies=${p.retention_1pct_applies} amount=${Number(p.retention_1pct_amount)} → ivaRete1=${ivaRete1}`);
    console.log(`    income_tax_withholding: applies=${p.income_tax_withholding_applies} amount=${Number(p.income_tax_withholding_amount)} → reteRenta=${reteRenta}`);
    console.log(`    totalCompra candidato=${totalCompra} totalPagar candidato=${totalPagarCandidato}`);
    console.log(`    ${clean ? "✅ CANDIDATA LIMPIA" : "❌ NO limpia — " + reasons.join("; ")}`);
  }

  // Candidatos válidos para --actor (created_by/updated_by) — User real de
  // ESTA base runtime, del mismo tenant. Sin campos sensibles (sin password,
  // sin tokens). --actor es opcional: si no se pasa, created_by/updated_by
  // quedan NULL.
  const actorCandidates = await client.user.findMany({
    where: { tenant_id: tenantId, role: { in: ["super_admin", "branch_admin"] }, status: "active" },
    select: { id: true, email: true, first_name: true, last_name: true, role: true },
    orderBy: { role: "asc" },
    take: 10,
  });
  console.log(`\n[Candidatos --actor válidos] (User.status=active, role super_admin|branch_admin): ${actorCandidates.length}`);
  for (const u of actorCandidates) {
    console.log(`  - id=${u.id} email=${u.email} nombre="${u.first_name} ${u.last_name}" role=${u.role}`);
  }
  console.log("  (--actor es opcional. Si se omite, created_by/updated_by quedan NULL.)");

  console.log("\nSiguiente paso: elegir --purchase <id> y --issuer <id TEST de arriba> y correr --step CREATE --mode DRY_RUN.");
}

// ─────────────────────────────────────────────────────────────────
// CREATE — reservar correlativo + crear DteOutgoingDocument PENDING_GENERATION
// Reimplementa createPendingDteForPurchase (dte-outgoing.service.ts) contra
// el client runtime, con UNA diferencia deliberada y aprobada: el
// DteIssuerConfig se resuelve por id explícito, SIN exigir is_active=true
// (Opción B). Nunca escribe DteIssuerConfig.
// ─────────────────────────────────────────────────────────────────

async function stepCreate(client: PrismaClient, tenantId: string, mode: Mode) {
  if (!PURCHASE_ID) throw new RunnerInputError("--purchase es requerido para --step CREATE.");
  if (!ISSUER_ID)   throw new RunnerInputError("--issuer es requerido para --step CREATE.");

  const purchase = await client.purchase.findFirst({
    where: { id: PURCHASE_ID, tenant_id: tenantId },
    select: {
      id: true, location_id: true, status: true, document_type: true, purchase_code: true,
      supplier: { select: { id: true, taxpayer_type: true, name: true } },
      _count: { select: { items: true } },
    },
  });
  if (!purchase) throw new RunnerInputError("La compra no existe o no pertenece al tenant runtime.");
  if (purchase.status !== "CONFIRMED") throw new RunnerInputError(`Solo se puede generar FSE para compras CONFIRMED. Estado actual: ${purchase.status}.`);
  if (purchase._count.items === 0) throw new RunnerInputError("La compra no tiene líneas de detalle.");
  if (!purchase.document_type || !FSE_ELIGIBLE_DOCUMENT_TYPES.includes(purchase.document_type)) {
    throw new RunnerInputError("Esta compra no está marcada document_type=FSE.");
  }
  if (purchase.supplier.taxpayer_type !== "EXCLUDED_SUBJECT") {
    throw new RunnerInputError(`El proveedor no es EXCLUDED_SUBJECT (actual: ${purchase.supplier.taxpayer_type}).`);
  }

  const activeDte = await client.dteOutgoingDocument.findFirst({
    where: {
      purchase_id: PURCHASE_ID, tenant_id: tenantId, dte_type_code: "14",
      dte_status: { notIn: ["NOT_REQUIRED", "INVALIDATED", "REJECTED"] },
    },
    select: { id: true, dte_status: true },
  });
  if (activeDte) throw new RunnerInputError(`Ya existe un FSE14 activo para esta compra (estado: ${activeDte.dte_status}, id: ${activeDte.id}).`);

  // Resolución por id explícito — SIN is_active. Esta es la única desviación
  // deliberada respecto a createPendingDteForPurchase real (Opción B aprobada).
  const issuerConfig = await client.dteIssuerConfig.findFirst({
    where: { id: ISSUER_ID, tenant_id: tenantId, location_id: purchase.location_id, environment: "TEST" },
    select: { id: true, cod_estable_mh: true, cod_punto_venta_mh: true, is_active: true },
  });
  if (!issuerConfig) throw new RunnerInputError("El DteIssuerConfig indicado no existe, no es TEST, o no corresponde a la location de la compra.");
  if (!issuerConfig.cod_estable_mh || !issuerConfig.cod_punto_venta_mh) {
    throw new RunnerInputError("Faltan cod_estable_mh / cod_punto_venta_mh en el DteIssuerConfig TEST.");
  }

  console.log(`\n[CREATE] Purchase ${purchase.purchase_code} — supplier "${purchase.supplier.name}"`);
  console.log(`[CREATE] DteIssuerConfig TEST id=${issuerConfig.id} is_active=${issuerConfig.is_active} (se usa igual, por id explícito)`);

  // F3-C25: validar --actor ANTES de escribir nada, en DRY_RUN y en EXECUTE
  // por igual — created_by/updated_by son FK a User de esta misma base.
  const actorId = await resolveActorId(client, tenantId);
  console.log(`[CREATE] actor (created_by/updated_by): ${actorId ?? "NULL (sin --actor)"}`);

  if (mode === "DRY_RUN") {
    console.log("[DRY_RUN] Precondiciones OK (incluye validación de --actor). No se reservó correlativo ni se escribió nada.");
    return;
  }

  if (CONFIRM !== CONFIRMATION_TEXT.CREATE) {
    throw new RunnerInputError(`Confirmación textual incorrecta. Se esperaba exactamente: "${CONFIRMATION_TEXT.CREATE}"`);
  }

  const doc = await client.$transaction(async (tx: Prisma.TransactionClient) => {
    const { control_number } = await reserveDteControlNumber(tx as unknown as Prisma.TransactionClient, {
      tenant_id: tenantId,
      location_id: purchase.location_id,
      issuer_config_id: issuerConfig.id,
      environment: "TEST",
      dte_type_code: "14",
      cod_estable_mh: issuerConfig.cod_estable_mh!,
      cod_punto_venta_mh: issuerConfig.cod_punto_venta_mh!,
    });

    const generation_code = randomUUID().toUpperCase();

    return tx.dteOutgoingDocument.create({
      data: {
        tenant_id: tenantId,
        location_id: purchase.location_id,
        purchase_id: purchase.id,
        issuer_config_id: issuerConfig.id,
        dte_type_code: "14",
        environment: "TEST",
        generation_code,
        control_number,
        transmission_type_code: "1",
        dte_status: "PENDING_GENERATION",
        retry_count: 0,
        created_by: actorId,
        updated_by: actorId,
      },
      select: { id: true, control_number: true, generation_code: true },
    });
  });

  console.log(`\n✅ [EXECUTE] DteOutgoingDocument creado: id=${doc.id} control_number=${doc.control_number} generation_code=${doc.generation_code}`);
  console.log("   Estado: PENDING_GENERATION. No se generó JSON. No se firmó. No se transmitió.");
}

// ─────────────────────────────────────────────────────────────────
// GENERATE — construir json_document (builder real, función pura)
// ─────────────────────────────────────────────────────────────────

async function stepGenerate(client: PrismaClient, tenantId: string, mode: Mode) {
  if (!DTE_ID) throw new RunnerInputError("--dte es requerido para --step GENERATE.");

  const dteDoc = await client.dteOutgoingDocument.findFirst({
    where: { id: DTE_ID, tenant_id: tenantId },
    select: {
      id: true, dte_type_code: true, purchase_id: true, signed_jws: true,
      dte_status: true, environment: true, control_number: true,
      generation_code: true, issuer_config_id: true, location_id: true,
    },
  });
  if (!dteDoc) throw new RunnerInputError("El DteOutgoingDocument no existe en el tenant runtime.");
  if (dteDoc.dte_type_code !== "14") throw new RunnerInputError(`Tipo DTE incorrecto: "${dteDoc.dte_type_code}", se esperaba "14".`);
  if (dteDoc.environment !== "TEST") throw new RunnerInputError(`Este runner solo opera TEST. environment actual: "${dteDoc.environment}".`);
  if (dteDoc.signed_jws) throw new RunnerInputError("El documento ya está firmado. No se puede regenerar JSON.");
  if (!["PENDING_GENERATION", "GENERATED", "SCHEMA_VALIDATED"].includes(dteDoc.dte_status)) {
    throw new RunnerInputError(`Estado incompatible con generación: "${dteDoc.dte_status}".`);
  }
  if (!dteDoc.purchase_id || !dteDoc.control_number || !dteDoc.generation_code || !dteDoc.issuer_config_id) {
    throw new RunnerInputError("El documento DTE tiene datos internos incompletos (purchase_id/control_number/generation_code/issuer_config_id).");
  }

  const purchase = await client.purchase.findFirst({
    where: { id: dteDoc.purchase_id, tenant_id: tenantId, location_id: dteDoc.location_id },
    select: {
      tenant_id: true, status: true, document_type: true, notes: true,
      purchase_code: true, total_amount: true, tax_amount: true,
      payment_condition: true, cancellation_type: true,
      retention_1pct_applies: true, retention_1pct_amount: true,
      income_tax_withholding_applies: true, income_tax_withholding_amount: true,
      supplier: {
        select: {
          name: true, legal_name: true, taxpayer_type: true, id_type_code: true,
          nit: true, dui: true, other_document: true, activity_code: true, activity_name: true,
          dept_code: true, municipality_code: true, address_complement: true, phone: true, email: true,
        },
      },
      items: {
        orderBy: { created_at: "asc" },
        select: {
          dte_line_number: true, quantity: true, unit_cost: true, line_subtotal: true,
          product: { select: { product_code: true, name: true, product_type: true, unit: { select: { mh_unit_code: true } } } },
        },
      },
    },
  });
  if (!purchase) throw new RunnerInputError("La compra asociada no existe en el tenant runtime.");

  const issuerConfig = await client.dteIssuerConfig.findFirst({
    where: { id: dteDoc.issuer_config_id, tenant_id: tenantId, location_id: dteDoc.location_id },
    select: {
      nit: true, nrc: true, name: true, activity_code: true, activity_name: true,
      establishment_code: true, point_of_sale_code: true, cod_estable_mh: true, cod_punto_venta_mh: true,
      dept_code: true, municipality_code: true, address_complement: true, phone: true, email: true, environment: true,
    },
  });
  if (!issuerConfig) throw new RunnerInputError("El DteIssuerConfig vinculado ya no existe en el tenant runtime.");

  // Validación territorial contra el client RUNTIME (nunca contra el
  // Municipality local) — evita mezclar catálogos de dos bases distintas.
  const emisorCheck = await checkAddressAgainstRuntime(client, "emisor", issuerConfig.dept_code, issuerConfig.municipality_code);
  if (!emisorCheck.ok) throw new RunnerInputError(emisorCheck.error);
  const sujetoCheck = await checkAddressAgainstRuntime(client, "sujeto excluido", purchase.supplier.dept_code, purchase.supplier.municipality_code);
  if (!sujetoCheck.ok) throw new RunnerInputError(sujetoCheck.error);

  const loaded: FseLoadedData = {
    dteDoc: { control_number: dteDoc.control_number, generation_code: dteDoc.generation_code },
    purchase: purchase as unknown as FseLoadedData["purchase"],
    issuerConfig: issuerConfig as unknown as FseLoadedData["issuerConfig"],
  };

  // Builder real, función pura — mismo código que usa la app normal.
  const built = buildFseJsonFromLoadedData(loaded);
  if (!built.ok) throw new RunnerInputError(`Builder FSE14 falló: ${built.error}`);

  console.log(`\n[GENERATE] JSON candidato construido. numeroControl=${dteDoc.control_number} codigoGeneracion=${dteDoc.generation_code}`);

  // F3-C26 — Desglose monetario read-only, sin secrets ni json completo.
  // Explica por qué Purchase.total_amount y JSON.resumen.totalPagar difieren
  // (son magnitudes fiscales distintas — ver comentario de fórmulas al
  // inicio de generate-fse-json.service.ts).
  printMoneyBreakdown(purchase, built.json);

  // F3-C25: validar --actor ANTES de escribir — updated_by es FK a User.
  const actorId = await resolveActorId(client, tenantId);
  console.log(`[GENERATE] actor (updated_by): ${actorId ?? "NULL (sin --actor)"}`);

  if (mode === "DRY_RUN") {
    console.log("[DRY_RUN] JSON construido en memoria (incluye validación de --actor). No se persistió json_document. dte_status sin cambios.");
    return;
  }

  if (CONFIRM !== CONFIRMATION_TEXT.GENERATE) {
    throw new RunnerInputError(`Confirmación textual incorrecta. Se esperaba exactamente: "${CONFIRMATION_TEXT.GENERATE}"`);
  }

  await client.dteOutgoingDocument.update({
    where: { id: dteDoc.id },
    data: {
      json_document: built.json as unknown as Prisma.InputJsonValue,
      dte_status: "GENERATED",
      generated_at: new Date(),
      updated_by: actorId,
    },
  });

  console.log(`\n✅ [EXECUTE] json_document persistido. dte_status → GENERATED. Siguiente paso: --step VALIDATE.`);
}

// F3-C26 — Desglose monetario read-only. No imprime json_document completo
// ni ningún dato de contacto/documento del proveedor — solo montos y
// cantidades, ya visibles en la propia app (purchase detail / panel fiscal).
interface MoneyBreakdownPurchase {
  purchase_code: string;
  total_amount: unknown;     // Prisma.Decimal
  tax_amount: unknown;       // Prisma.Decimal
  retention_1pct_applies: boolean;
  retention_1pct_amount: unknown;
  income_tax_withholding_applies: boolean;
  income_tax_withholding_amount: unknown;
  items: Array<{
    dte_line_number: number | null;
    quantity: unknown;
    unit_cost: unknown;
    line_subtotal: unknown;
    product: { name: string; product_type: string };
  }>;
}

function printMoneyBreakdown(purchase: MoneyBreakdownPurchase, json: FseJsonDocument) {
  console.log("\n──── Desglose monetario (read-only) ────");
  console.log(`Purchase ${purchase.purchase_code}:`);
  console.log(`  total_amount (subtotal + tax_amount, tax_amount=0 en FSE) = ${Number(purchase.total_amount)}`);
  console.log(`  tax_amount (siempre 0 en FSE — no genera crédito fiscal IVA) = ${Number(purchase.tax_amount)}`);
  console.log(`  retention_1pct_applies=${purchase.retention_1pct_applies} retention_1pct_amount=${Number(purchase.retention_1pct_amount)}`);
  console.log(`  income_tax_withholding_applies=${purchase.income_tax_withholding_applies} income_tax_withholding_amount=${Number(purchase.income_tax_withholding_amount)}`);
  console.log(`  items (${purchase.items.length}):`);
  for (const it of purchase.items) {
    console.log(
      `    - numItem=${it.dte_line_number ?? "?"} "${it.product.name}" tipo=${it.product.product_type} ` +
      `cantidad=${Number(it.quantity)} precioUni=${Number(it.unit_cost)} lineSubtotal=${Number(it.line_subtotal)}`,
    );
  }

  const r = json.resumen;
  console.log(`\nJSON FSE14 candidato — resumen:`);
  console.log(`  subTotal (suma de cuerpoDocumento[].compra)       = ${r.subTotal}`);
  console.log(`  descu (descuento global — Purchase no maneja)     = ${r.descu}`);
  console.log(`  totalCompra (subTotal - descu)                    = ${r.totalCompra}`);
  console.log(`  ivaRete1 (retención 1% IVA, si aplica)            = ${r.ivaRete1}`);
  console.log(`  reteRenta (retención renta, si aplica)            = ${r.reteRenta}`);
  console.log(`  totalPagar (totalCompra - ivaRete1 - reteRenta)   = ${r.totalPagar}`);
  console.log(`  condicionOperacion=${r.condicionOperacion} pagos=${JSON.stringify(r.pagos)}`);

  const expectedTotalPagar = Math.round((r.totalCompra - r.ivaRete1 - r.reteRenta) * 100) / 100;
  console.log(
    `\nVerificación de fórmula: totalCompra(${r.totalCompra}) - ivaRete1(${r.ivaRete1}) - reteRenta(${r.reteRenta}) ` +
    `= ${expectedTotalPagar} ${expectedTotalPagar === r.totalPagar ? "✅ coincide con totalPagar" : "❌ NO coincide con totalPagar — revisar builder"}`,
  );
  console.log(
    "Nota: Purchase.total_amount es el monto BRUTO de la compra (subtotal, sin descontar retenciones). " +
    "JSON.resumen.totalPagar es el monto NETO que efectivamente se paga al sujeto excluido, DESPUÉS de " +
    "restar las retenciones. Que difieran es el comportamiento esperado del builder cuando " +
    "retention_1pct_applies y/o income_tax_withholding_applies están activos — no es, por sí solo, una " +
    "inconsistencia de datos.",
  );
  console.log("──── Fin desglose ────\n");
}

async function checkAddressAgainstRuntime(
  client: PrismaClient,
  role: string,
  deptCode: string | null,
  municipalityCode: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!deptCode && !municipalityCode) return { ok: true };
  if (!deptCode || !municipalityCode) {
    return { ok: false, error: `Dirección del ${role} incompleta (departamento="${deptCode ?? ""}", municipio="${municipalityCode ?? ""}").` };
  }
  const row = await client.municipality.findFirst({
    where: { dept_code: deptCode, code: municipalityCode, status: "active" },
    select: { id: true },
  });
  if (!row) {
    return { ok: false, error: `Código territorial del ${role} (dept="${deptCode}", mun="${municipalityCode}") no existe en el catálogo runtime.` };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────
// VALIDATE — AJV contra el schema oficial MH fse-14.schema.json
// ─────────────────────────────────────────────────────────────────

async function stepValidate(client: PrismaClient, tenantId: string, mode: Mode) {
  if (!DTE_ID) throw new RunnerInputError("--dte es requerido para --step VALIDATE.");

  const dteDoc = await client.dteOutgoingDocument.findFirst({
    where: { id: DTE_ID, tenant_id: tenantId },
    select: { id: true, dte_type_code: true, dte_status: true, json_document: true, environment: true },
  });
  if (!dteDoc) throw new RunnerInputError("El DteOutgoingDocument no existe en el tenant runtime.");
  if (dteDoc.dte_type_code !== "14") throw new RunnerInputError(`Tipo DTE incorrecto: "${dteDoc.dte_type_code}".`);
  if (dteDoc.environment !== "TEST") throw new RunnerInputError(`Este runner solo opera TEST. environment actual: "${dteDoc.environment}".`);
  if (dteDoc.dte_status !== "GENERATED") throw new RunnerInputError(`Solo se valida sobre estado GENERATED. Estado actual: "${dteDoc.dte_status}".`);
  if (!dteDoc.json_document) throw new RunnerInputError("El documento no tiene json_document.");

  const documentData = typeof dteDoc.json_document === "string" ? JSON.parse(dteDoc.json_document) : dteDoc.json_document;

  const ajv = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 2 });
  addFormats(ajv);
  const validate = ajv.compile(fseSchema as object);
  const valid = validate(documentData);

  if (!valid && validate.errors) {
    console.log(`\n[VALIDATE] ❌ ${validate.errors.length} error(es) de schema:`);
    for (const err of validate.errors.slice(0, 20)) {
      console.log(`  - ${err.instancePath || "(raíz)"}: ${err.message}`);
    }
    throw new RunnerInputError("El JSON no cumple el schema oficial MH. dte_status se mantiene GENERATED.");
  }

  console.log("\n[VALIDATE] ✅ JSON cumple el schema oficial MH fse-14.schema.json.");

  // F3-C25: validar --actor ANTES de escribir — updated_by es FK a User.
  const actorId = await resolveActorId(client, tenantId);
  console.log(`[VALIDATE] actor (updated_by): ${actorId ?? "NULL (sin --actor)"}`);

  if (mode === "DRY_RUN") {
    console.log("[DRY_RUN] No se actualizó dte_status (incluye validación de --actor).");
    return;
  }

  if (CONFIRM !== CONFIRMATION_TEXT.VALIDATE) {
    throw new RunnerInputError(`Confirmación textual incorrecta. Se esperaba exactamente: "${CONFIRMATION_TEXT.VALIDATE}"`);
  }

  await client.dteOutgoingDocument.update({
    where: { id: dteDoc.id },
    data: { dte_status: "SCHEMA_VALIDATED", schema_validated_at: new Date(), updated_by: actorId },
  });

  console.log("\n✅ [EXECUTE] dte_status → SCHEMA_VALIDATED. Listo para firma (fase futura, fuera de alcance de FASE 3).");
  console.log("   NO se firmó. NO se transmitió a Hacienda.");
}

// ─────────────────────────────────────────────────────────────────
// SIGN — PASO 6B FASE 4. Firma un DteOutgoingDocument SCHEMA_VALIDATED
// contra el firmador remoto TEST. Reimplementa sign-dte-document.service.ts
// (que usa Prisma global) contra el client runtime — mismo adapter HTTP
// (MhHttpDteSignerAdapter) y misma resolveDteSignerConfig(environment),
// sin modificar ninguno de los dos.
//
// Nunca puede firmar contra PRODUCTION: exige dteDoc.environment === "TEST"
// antes de siquiera resolver el signer, y solo llama
// resolveDteSignerConfig("TEST") — nunca "PRODUCTION" en este step.
// Nunca imprime signed_jws completo, DTE_SIGNER_API_KEY ni
// DTE_SIGNER_PASSWORD — solo longitud + huella sha256 truncada del JWS.
// ─────────────────────────────────────────────────────────────────

function safeSignerHost(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`; // sin querystring ni credenciales
  } catch {
    return "(URL no parseable)";
  }
}

function safeJwsFingerprint(jws: string): string {
  const hash = createHash("sha256").update(jws).digest("hex").slice(0, 12);
  return `len=${jws.length} sha256:${hash}…`;
}

async function stepSign(client: PrismaClient, tenantId: string, mode: Mode) {
  if (!DTE_ID) throw new RunnerInputError("--dte es requerido para --step SIGN.");

  const dteDoc = await client.dteOutgoingDocument.findFirst({
    where: { id: DTE_ID, tenant_id: tenantId },
    select: {
      id: true, dte_type_code: true, dte_status: true, json_document: true,
      signed_jws: true, retry_count: true, environment: true, control_number: true,
      issuer_config_id: true,
    },
  });
  if (!dteDoc) throw new RunnerInputError("El DteOutgoingDocument no existe en el tenant runtime.");
  if (dteDoc.dte_type_code !== "14") throw new RunnerInputError(`Tipo DTE incorrecto: "${dteDoc.dte_type_code}", se esperaba "14".`);
  // Defensa dura: este step jamás firma PRODUCTION, sin importar qué se le pida.
  if (dteDoc.environment !== "TEST") {
    throw new RunnerInputError(`Este runner SOLO firma TEST. environment del documento: "${dteDoc.environment}". Rechazado.`);
  }
  if (dteDoc.dte_status !== "SCHEMA_VALIDATED") {
    throw new RunnerInputError(`Solo se pueden firmar documentos SCHEMA_VALIDATED. Estado actual: "${dteDoc.dte_status}".`);
  }
  if (dteDoc.signed_jws) {
    throw new RunnerInputError("Este documento ya tiene signed_jws. No se permite refirmar un documento ya firmado.");
  }
  if (!dteDoc.json_document) {
    throw new RunnerInputError("El documento DTE no tiene json_document. Genera y valida el JSON antes de firmar.");
  }

  // --actor ANTES de tocar el firmador — updated_by es FK a User.
  const actorId = await resolveActorId(client, tenantId);
  console.log(`\n[SIGN] dte=${dteDoc.id} control_number=${dteDoc.control_number} status actual=${dteDoc.dte_status}`);
  console.log(`[SIGN] actor (updated_by): ${actorId ?? "NULL (sin --actor)"}`);

  // SIGNERPROFILE-MULTITENANT — resolver firmador + credenciales por
  // issuer_config_id (DteCredential del emisor), con fallback a las
  // variables globales DTE_SIGNER_NIT/PASSWORD + DTE_SIGNER_URL_TEST. SOLO
  // TEST — se pasa "TEST" explícito, nunca "PRODUCTION" en este step.
  const signerResolution = await resolveDteSignerConfigForIssuer({
    issuerConfigId: dteDoc.issuer_config_id,
    tenantId,
    environment: "TEST",
    client,
  });
  if (!signerResolution.ok) {
    throw new RunnerInputError(signerResolution.error);
  }
  const { config: signerConfig, nit, passwordPri } = signerResolution;
  console.log(`[SIGN] firmador resuelto (fuente=${signerResolution.source}): ${safeSignerHost(signerConfig.signerUrl)}`);
  console.log(`[SIGN] healthUrl: ${safeSignerHost(signerConfig.healthUrl)} timeoutMs=${signerConfig.timeoutMs}`);
  console.log(`[SIGN] apiKey configurada: ${signerConfig.apiKey ? "sí (no se imprime)" : "NO — el firmador remoto puede responder 403"}`);

  const adapter = new MhHttpDteSignerAdapter();

  if (mode === "DRY_RUN") {
    console.log("\n[DRY_RUN] Ejecutando checkHealth() — GET /status, NO firma. Ver PASO 6B FASE 2.");
    const health = await adapter.checkHealth(signerConfig);
    console.log(health.ok ? "  ✅ Firmador TEST alcanzable." : `  ✗ Firmador TEST no alcanzable: httpStatus=${health.httpStatus ?? "n/a"} ${health.message ?? ""}`);
    console.log("\n[DRY_RUN] Precondiciones OK (incluye --actor y checkHealth). NO se llamó al endpoint de firma. NO se escribió signed_jws.");
    return;
  }

  if (CONFIRM !== CONFIRMATION_TEXT.SIGN) {
    throw new RunnerInputError(`Confirmación textual incorrecta. Se esperaba exactamente: "${CONFIRMATION_TEXT.SIGN}"`);
  }

  let dteJson: unknown;
  try {
    dteJson = typeof dteDoc.json_document === "string" ? JSON.parse(dteDoc.json_document) : dteDoc.json_document;
  } catch {
    throw new RunnerInputError("El JSON almacenado no es parseable. El documento puede estar corrupto.");
  }

  const attemptNumber = dteDoc.retry_count + 1;
  const signerResult = await adapter.sign({ nit, passwordPri, dteJson }, signerConfig);

  if (signerResult.ok) {
    const signedAt = signerResult.signedAt;
    await client.$transaction([
      client.dteOutgoingDocument.update({
        where: { id: dteDoc.id },
        data: { dte_status: "SIGNED", signed_jws: signerResult.signedJws, signed_at: signedAt, updated_by: actorId },
      }),
      client.dteTransmissionLog.create({
        data: {
          dte_document_id: dteDoc.id,
          attempt_number: attemptNumber,
          operation_type: "SIGN",
          request_url: signerConfig.signerUrl,
          // Nunca guardar signed_jws en el log — solo confirmación de estado.
          response_body: { status: "OK" },
        },
      }),
    ]);

    console.log(`\n✅ [EXECUTE] Firmado. dte_status: SCHEMA_VALIDATED → SIGNED.`);
    console.log(`   control_number=${dteDoc.control_number}`);
    console.log(`   firmador: ${safeSignerHost(signerConfig.signerUrl)}`);
    console.log(`   JWS: ${safeJwsFingerprint(signerResult.signedJws)} (nunca impreso completo, nunca guardado en archivo local)`);
    console.log("   NO se transmitió a Hacienda. NO se llamó endpoint de recepción MH.");
    return;
  }

  // Firma fallida — mantener SCHEMA_VALIDATED, incrementar retry_count.
  const httpStatus = signerResult.httpStatus ?? null;
  await client.$transaction([
    client.dteOutgoingDocument.update({
      where: { id: dteDoc.id },
      data: { retry_count: { increment: 1 }, updated_by: actorId },
    }),
    client.dteTransmissionLog.create({
      data: {
        dte_document_id: dteDoc.id,
        attempt_number: attemptNumber,
        operation_type: "SIGN",
        request_url: signerConfig.signerUrl,
        http_status: httpStatus,
        error_message: signerResult.message,
        response_body: { errorCode: signerResult.errorCode, message: signerResult.message, httpStatus },
      },
    }),
  ]);

  throw new RunnerInputError(`Firma falló: ${signerResult.message} (httpStatus=${httpStatus ?? "n/a"}). dte_status se mantiene SCHEMA_VALIDATED, retry_count incrementado.`);
}

// ─────────────────────────────────────────────────────────────────
// TRANSMIT — PASO 6B FASE 5. Transmite un DteOutgoingDocument SIGNED a
// MH TEST. Reimplementa transmit-dte-document.service.ts (Prisma global)
// contra el client runtime, reusando sin modificar MhDteTransmissionAdapter
// (HTTP puro, no toca Prisma) y resolveDteMhUrls (env-based, puro).
//
// Nota de auditoría honesta: MhAuthAdapter.authenticate() —usado
// internamente por MhDteTransmissionAdapter— sí intenta primero
// prisma.dteCredential (Prisma GLOBAL/local) buscando por issuer_config_id;
// como ese id pertenece a TrustMe Runtime, no existe en la base local y
// esa consulta no encuentra nada (no-op de solo lectura). Para TEST cae
// entonces al fallback oficial documentado en dte-credential.service.ts:
// DTE_MH_USER/DTE_MH_PASSWORD del proceso. Es el mismo comportamiento ya
// sancionado por el código real — no un bypass nuevo. Nunca aplica a
// PRODUCTION (el fallback está bloqueado ahí explícitamente).
//
// Nunca puede transmitir PRODUCTION: exige dteDoc.environment === "TEST"
// y siempre llama al adapter con environment:"TEST" hardcodeado.
// transmission_type_code distinto de "1" (contingencia) queda fuera de
// alcance — se rechaza explícitamente en vez de reimplementar el guard.
// ─────────────────────────────────────────────────────────────────

function determineFinalStatusLocal(
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

async function stepTransmit(client: PrismaClient, tenantId: string, mode: Mode): Promise<"ACCEPTED" | "OBSERVED" | "REJECTED" | undefined> {
  if (!DTE_ID) throw new RunnerInputError("--dte es requerido para --step TRANSMIT.");

  const dteDoc = await client.dteOutgoingDocument.findFirst({
    where: { id: DTE_ID, tenant_id: tenantId },
    select: {
      id: true, dte_type_code: true, dte_status: true, signed_jws: true,
      generation_code: true, control_number: true, environment: true,
      issuer_config_id: true, retry_count: true, transmission_type_code: true,
      reception_stamp: true, json_document: true,
    },
  });
  if (!dteDoc) throw new RunnerInputError("El DteOutgoingDocument no existe en el tenant runtime.");
  if (dteDoc.dte_type_code !== "14") throw new RunnerInputError(`Tipo DTE incorrecto: "${dteDoc.dte_type_code}", se esperaba "14".`);
  // Defensa dura: este step jamás transmite PRODUCTION, sin importar qué se le pida.
  if (dteDoc.environment !== "TEST") {
    throw new RunnerInputError(`Este runner SOLO transmite TEST. environment del documento: "${dteDoc.environment}". Rechazado.`);
  }
  // Punto 6: si ya tiene reception_stamp o un status final, detenerse — no retransmitir.
  if (dteDoc.reception_stamp) {
    throw new RunnerInputError(`El documento ya tiene reception_stamp="${dteDoc.reception_stamp}" — ya fue transmitido anteriormente. No se retransmite.`);
  }
  if (dteDoc.dte_status !== "SIGNED") {
    throw new RunnerInputError(`Solo se pueden transmitir documentos SIGNED. Estado actual: "${dteDoc.dte_status}".`);
  }
  if (!dteDoc.signed_jws) throw new RunnerInputError("El documento no tiene JWS firmado.");
  if (!dteDoc.json_document) throw new RunnerInputError("El documento no tiene json_document.");
  if (!dteDoc.generation_code) throw new RunnerInputError("El documento no tiene código de generación.");
  if (!dteDoc.control_number) throw new RunnerInputError("El documento no tiene número de control.");
  if (dteDoc.transmission_type_code !== "1") {
    throw new RunnerInputError(`transmission_type_code="${dteDoc.transmission_type_code}" fuera de alcance de este runner (solo "1", transmisión normal). Contingencia no soportada aquí.`);
  }

  // --actor ANTES de tocar MH — updated_by es FK a User.
  const actorId = await resolveActorId(client, tenantId);
  console.log(`\n[TRANSMIT] dte=${dteDoc.id} control_number=${dteDoc.control_number} status actual=${dteDoc.dte_status}`);
  console.log(`[TRANSMIT] actor (updated_by): ${actorId ?? "NULL (sin --actor)"}`);

  const { authUrl, receptionUrl } = resolveDteMhUrls("TEST");
  console.log(`[TRANSMIT] MH TEST authUrl: ${safeSignerHost(authUrl)}`);
  console.log(`[TRANSMIT] MH TEST receptionUrl: ${safeSignerHost(receptionUrl)}`);

  const mhUserConfigured     = !!process.env["DTE_MH_USER"]?.trim();
  const mhPasswordConfigured = !!process.env["DTE_MH_PASSWORD"]?.trim();
  console.log(`[TRANSMIT] DTE_MH_USER configurada: ${mhUserConfigured ? "sí (no se imprime)" : "NO"}`);
  console.log(`[TRANSMIT] DTE_MH_PASSWORD configurada: ${mhPasswordConfigured ? "sí (no se imprime)" : "NO"}`);
  console.log("[TRANSMIT] Autenticación: intenta DteCredential local por issuer_config_id primero (no-op esperado, id pertenece a otra base); cae a DTE_MH_USER/DTE_MH_PASSWORD (fallback TEST oficial).");

  if (mode === "DRY_RUN") {
    if (!mhUserConfigured || !mhPasswordConfigured) {
      console.log("  ⚠ DTE_MH_USER/DTE_MH_PASSWORD no configuradas en este proceso — EXECUTE fallaría al autenticar salvo que exista una DteCredential local utilizable (improbable).");
    }
    console.log("\n[DRY_RUN] Precondiciones OK (incluye --actor). NO se llamó a MH. NO se escribió nada.");
    return undefined;
  }

  if (CONFIRM !== CONFIRMATION_TEXT.TRANSMIT) {
    throw new RunnerInputError(`Confirmación textual incorrecta. Se esperaba exactamente: "${CONFIRMATION_TEXT.TRANSMIT}"`);
  }

  const adapter = new MhDteTransmissionAdapter();
  const attemptNumber = dteDoc.retry_count + 1;

  const result = await adapter.transmit({
    environment: "TEST",
    issuerConfigId: dteDoc.issuer_config_id ?? undefined,
    dteTypeCode: "14",
    version: 1, // FSE14 identificacion.version fijo en 1
    codigoGeneracion: dteDoc.generation_code,
    signedJws: dteDoc.signed_jws,
  });

  const now = new Date();

  // ── Caso: error técnico (timeout, HTTP inesperado, auth fallida) ──
  if (!result.ok) {
    await client.$transaction([
      client.dteOutgoingDocument.update({
        where: { id: dteDoc.id },
        data: { retry_count: { increment: 1 }, updated_by: actorId },
      }),
      client.dteTransmissionLog.create({
        data: {
          dte_document_id: dteDoc.id,
          attempt_number: attemptNumber,
          operation_type: "SEND",
          request_url: receptionUrl,
          http_status: result.httpStatus ?? null,
          error_message: result.message,
          response_body: { errorCode: result.errorCode, message: result.message, httpStatus: result.httpStatus ?? null },
        },
      }),
    ]);
    throw new RunnerInputError(`Transmisión falló (error técnico): ${result.message} (httpStatus=${result.httpStatus ?? "n/a"}). dte_status se mantiene SIGNED, retry_count incrementado.`);
  }

  // ── Respuesta fiscal — sanitizada, sin signed_jws ni token ─────────
  const mhResponseSanitized = {
    mhEstado: result.mhEstado,
    codigoMsg: result.codigoMsg ?? null,
    descripcionMsg: result.descripcionMsg ?? null,
    fhProcesamiento: result.fhProcesamiento ?? null,
    httpStatus: result.httpStatus,
    idEnvio: result.idEnvio,
  };

  const finalStatus = determineFinalStatusLocal(result);

  if (!finalStatus) {
    await client.$transaction([
      client.dteOutgoingDocument.update({
        where: { id: dteDoc.id },
        data: { mh_response: mhResponseSanitized, retry_count: { increment: 1 }, updated_by: actorId },
      }),
      client.dteTransmissionLog.create({
        data: {
          dte_document_id: dteDoc.id,
          attempt_number: attemptNumber,
          operation_type: "SEND",
          request_url: receptionUrl,
          http_status: result.httpStatus,
          error_message: `Estado MH inesperado: ${result.mhEstado}`,
          response_body: mhResponseSanitized,
        },
      }),
    ]);
    throw new RunnerInputError(`MH respondió con estado inesperado (${result.mhEstado}). El documento se mantiene en SIGNED para reintento.`);
  }

  if (finalStatus === "ACCEPTED") {
    await client.$transaction([
      client.dteOutgoingDocument.update({
        where: { id: dteDoc.id },
        data: {
          dte_status: "ACCEPTED", mh_response: mhResponseSanitized,
          reception_stamp: result.selloRecibido ?? null, sent_at: now, accepted_at: now, updated_by: actorId,
        },
      }),
      client.dteTransmissionLog.create({
        data: { dte_document_id: dteDoc.id, attempt_number: attemptNumber, operation_type: "SEND", request_url: receptionUrl, http_status: result.httpStatus, response_body: mhResponseSanitized },
      }),
    ]);
  } else if (finalStatus === "OBSERVED") {
    const observationsJson: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue =
      result.observaciones != null ? (result.observaciones as Prisma.InputJsonValue) : Prisma.JsonNull;
    const logBodyWithObs: Prisma.InputJsonValue = { ...mhResponseSanitized, observaciones: (result.observaciones ?? null) as Prisma.InputJsonValue };

    await client.$transaction([
      client.dteOutgoingDocument.update({
        where: { id: dteDoc.id },
        data: {
          dte_status: "OBSERVED", mh_response: mhResponseSanitized, reception_stamp: result.selloRecibido ?? null,
          observations: observationsJson, sent_at: now, observed_at: now, updated_by: actorId,
        },
      }),
      client.dteTransmissionLog.create({
        data: { dte_document_id: dteDoc.id, attempt_number: attemptNumber, operation_type: "SEND", request_url: receptionUrl, http_status: result.httpStatus, response_body: logBodyWithObs },
      }),
    ]);
  } else {
    // REJECTED
    await client.$transaction([
      client.dteOutgoingDocument.update({
        where: { id: dteDoc.id },
        data: {
          dte_status: "REJECTED", mh_response: mhResponseSanitized, rejection_reason: result.descripcionMsg ?? null,
          sent_at: now, rejected_at: now, updated_by: actorId,
        },
      }),
      client.dteTransmissionLog.create({
        data: { dte_document_id: dteDoc.id, attempt_number: attemptNumber, operation_type: "SEND", request_url: receptionUrl, http_status: result.httpStatus, error_message: result.descripcionMsg ?? null, response_body: mhResponseSanitized },
      }),
    ]);
  }

  console.log(`\n✅ [EXECUTE] Transmitido. dte_status: SIGNED → ${finalStatus}.`);
  console.log(`   control_number=${dteDoc.control_number} ambiente=TEST`);
  console.log(`   mhEstado=${result.mhEstado} codigoMsg=${result.codigoMsg ?? "-"} descripcionMsg=${result.descripcionMsg ?? "-"}`);
  console.log(`   selloRecibido=${result.selloRecibido ?? "(ninguno)"}`);
  console.log("   NO se tocó MariaDB externa. NO hubo delivery externo. NO se tocó PRODUCTION.");

  return finalStatus;
}

// ─────────────────────────────────────────────────────────────────
// DELIVER — cierre del flujo: entrega un DteOutgoingDocument ACCEPTED/
// OBSERVED a la base MariaDB externa. Reimplementa
// deliver-dte-to-external-db.service.ts (Prisma global) contra el client
// runtime, reusando SIN modificar buildExternalDtePayload (función pura,
// ya soporta purchase_id/tipo 14 — ver auditoría) y ExternalDteMariaDbAdapter
// (mysql2 puro, no toca Prisma en absoluto).
//
// No modifica dte_status (se queda ACCEPTED/OBSERVED). No toca signed_jws.
// No firma. No transmite a MH. No usa PRODUCTION en ningún punto — el
// destino MariaDB no tiene noción de ambiente MH, pero el documento en sí
// se valida dteDoc.environment === "TEST" igual que en SIGN/TRANSMIT, por
// consistencia y para nunca entregar accidentalmente un documento
// PRODUCTION desde este runner de pruebas.
// ─────────────────────────────────────────────────────────────────

async function stepDeliver(client: PrismaClient, tenantId: string, mode: Mode) {
  if (!DTE_ID) throw new RunnerInputError("--dte es requerido para --step DELIVER.");

  const dteDoc = await client.dteOutgoingDocument.findFirst({
    where: { id: DTE_ID, tenant_id: tenantId },
    select: {
      id: true, tenant_id: true, location_id: true, sale_id: true, purchase_id: true,
      dte_type_code: true, control_number: true, generation_code: true, environment: true,
      dte_status: true, accepted_at: true, json_document: true, signed_jws: true,
      reception_stamp: true, mh_response: true, retry_count: true,
    },
  });
  if (!dteDoc) throw new RunnerInputError("El DteOutgoingDocument no existe en el tenant runtime.");
  if (dteDoc.dte_type_code !== "14") throw new RunnerInputError(`Tipo DTE incorrecto: "${dteDoc.dte_type_code}", se esperaba "14".`);
  if (dteDoc.environment !== "TEST") {
    throw new RunnerInputError(`Este runner SOLO entrega documentos TEST. environment del documento: "${dteDoc.environment}". Rechazado.`);
  }
  if (!isFiscallyReceivedByMh(dteDoc.dte_status, dteDoc.reception_stamp)) {
    throw new RunnerInputError(`El documento no ha sido recibido fiscalmente por MH (requiere ACCEPTED u OBSERVED con sello). Estado actual: "${dteDoc.dte_status}", reception_stamp=${dteDoc.reception_stamp ?? "null"}.`);
  }
  if (!dteDoc.json_document) throw new RunnerInputError("El documento no tiene json_document.");
  if (!dteDoc.signed_jws)    throw new RunnerInputError("El documento no tiene signed_jws (firma).");

  // Verificar que no exista ya un delivery exitoso — mismo criterio que
  // canDeliverExternal/dte-action-availability.utils.ts, reusando el mismo
  // predicado puro isSuccessfulDeliveryLog.
  const priorLogs = await client.dteTransmissionLog.findMany({
    where: { dte_document_id: dteDoc.id, operation_type: "EXTERNAL_DELIVERY" },
    select: { response_body: true, error_message: true, http_status: true, created_at: true },
    orderBy: { created_at: "desc" },
  });
  const alreadyDelivered = priorLogs.some((l) => isSuccessfulDeliveryLog(l as DeliveryLog));
  if (alreadyDelivered) {
    throw new RunnerInputError("Este documento ya tiene un delivery exitoso previo a MariaDB externa (EXTERNAL_DELIVERY). No se reentrega.");
  }

  // --actor — no hay FK que tocar en DteOutgoingDocument (DELIVER no lo
  // actualiza), pero se valida igual y se incluye como deliveredBy en el
  // log, igual que el flujo real (userId en response_body.deliveredBy).
  const actorId = await resolveActorId(client, tenantId);
  console.log(`\n[DELIVER] dte=${dteDoc.id} control_number=${dteDoc.control_number} status=${dteDoc.dte_status} reception_stamp=${dteDoc.reception_stamp}`);
  console.log(`[DELIVER] actor (deliveredBy en log): ${actorId ?? "NULL (sin --actor)"}`);

  // Construir payload externo en memoria — función pura, sin efectos.
  const docForPayload: DteDocumentForExternalPayload = {
    id: dteDoc.id, tenant_id: dteDoc.tenant_id, location_id: dteDoc.location_id,
    sale_id: dteDoc.sale_id, purchase_id: dteDoc.purchase_id, dte_type_code: dteDoc.dte_type_code,
    control_number: dteDoc.control_number, generation_code: dteDoc.generation_code,
    environment: dteDoc.environment, dte_status: dteDoc.dte_status, accepted_at: dteDoc.accepted_at,
    json_document: dteDoc.json_document, signed_jws: dteDoc.signed_jws,
    reception_stamp: dteDoc.reception_stamp, mh_response: dteDoc.mh_response,
  };
  const built = buildExternalDtePayload(docForPayload);
  if (!built.ok) throw new RunnerInputError(`No se pudo construir el payload externo: ${built.error}`);

  // Resumen seguro del payload — NUNCA el payload completo (incluye
  // payload.token = signed_jws completo) ni ningún otro campo sensible.
  const p = built.payload as Record<string, unknown>;
  const ident = p["identificacion"] as Record<string, unknown> | undefined;
  console.log(`[DELIVER] payload candidato — tipoDte=${ident?.["tipoDte"]} numeroControl=${ident?.["numeroControl"]} ambiente=${ident?.["ambiente"]}`);
  console.log(`[DELIVER] payload candidato — codigoEmpresa=${p["codigoEmpresa"]}`);

  const config = getExternalDteMariaDbConfig();
  console.log(`\n[DELIVER] EXTERNAL_DTE_MARIADB_ENABLED: ${config.enabled ? "true" : "false/ausente"}`);
  console.log(`[DELIVER] host=${config.host || "(vacío)"} port=${config.port} database=${config.database || "(vacío)"} table=${config.table || "(vacío)"}`);
  console.log(`[DELIVER] user configurado: ${config.user ? "sí (no se imprime)" : "NO"} / password configurada: ${config.password ? "sí (no se imprime)" : "NO"}`);

  const configErrors: string[] = [];
  if (!config.enabled) configErrors.push("EXTERNAL_DTE_MARIADB_ENABLED no es \"true\".");
  if (!config.host) configErrors.push("EXTERNAL_DTE_MARIADB_HOST vacío.");
  if (!config.user) configErrors.push("EXTERNAL_DTE_MARIADB_USER vacío.");
  if (!config.password) configErrors.push("EXTERNAL_DTE_MARIADB_PASSWORD vacío.");
  if (!config.database) configErrors.push("EXTERNAL_DTE_MARIADB_DATABASE vacío.");
  if (!config.table) configErrors.push("EXTERNAL_DTE_MARIADB_TABLE vacío.");

  if (mode === "DRY_RUN") {
    if (configErrors.length > 0) {
      console.log("\n[DRY_RUN] ⚠ Configuración incompleta — EXECUTE fallaría:");
      for (const e of configErrors) console.log(`   - ${e}`);
    } else {
      console.log("\n[DRY_RUN] Configuración MariaDB externa completa.");
    }
    console.log("[DRY_RUN] Precondiciones OK (incluye --actor, elegibilidad, sin delivery previo). NO se conectó a MariaDB. NO se escribió nada.");
    return;
  }

  if (CONFIRM !== CONFIRMATION_TEXT.DELIVER) {
    throw new RunnerInputError(`Confirmación textual incorrecta. Se esperaba exactamente: "${CONFIRMATION_TEXT.DELIVER}"`);
  }
  if (configErrors.length > 0) {
    throw new RunnerInputError(`Configuración MariaDB externa incompleta: ${configErrors.join(" ")}`);
  }

  const adapter = new ExternalDteMariaDbAdapter();
  const deliveryResult = await adapter.insert(config, built.payload);
  const attemptNumber = dteDoc.retry_count + 1;

  if (deliveryResult.ok) {
    await client.dteTransmissionLog.create({
      data: {
        dte_document_id: dteDoc.id,
        attempt_number: attemptNumber,
        operation_type: "EXTERNAL_DELIVERY",
        request_url: `mariadb://${config.host}:${config.port}/${deliveryResult.targetDatabase}/${deliveryResult.targetTable}`,
        http_status: null,
        error_message: null,
        response_body: {
          ok: true,
          insertId: deliveryResult.insertId?.toString() ?? null,
          affectedRows: deliveryResult.affectedRows,
          targetTable: deliveryResult.targetTable,
          targetDatabase: deliveryResult.targetDatabase,
          tipoDte: dteDoc.dte_type_code,
          numeroControl: dteDoc.control_number,
          codigoGeneracion: dteDoc.generation_code,
          deliveredBy: actorId,
        },
      },
    });

    console.log(`\n✅ [EXECUTE] Entregado a MariaDB externa. dte_status NO cambia (se queda ${dteDoc.dte_status}).`);
    console.log(`   control_number=${dteDoc.control_number} targetDatabase=${deliveryResult.targetDatabase} targetTable=${deliveryResult.targetTable}`);
    console.log(`   insertId=${deliveryResult.insertId} affectedRows=${deliveryResult.affectedRows}`);
    console.log("   NO se volvió a firmar. NO se retransmitió a Hacienda. NO se tocó PRODUCTION.");
    return;
  }

  // Delivery fallido — registrar error sanitizado (el adapter ya sanitiza cualquier password).
  await client.dteTransmissionLog.create({
    data: {
      dte_document_id: dteDoc.id,
      attempt_number: attemptNumber,
      operation_type: "EXTERNAL_DELIVERY",
      request_url: `mariadb://${config.host}:${config.port}/${config.database}/${config.table}`,
      http_status: null,
      error_message: deliveryResult.error,
      response_body: {
        ok: false,
        errorCode: deliveryResult.errorCode ?? null,
        targetTable: config.table || null,
        targetDatabase: config.database || null,
        tipoDte: dteDoc.dte_type_code,
        numeroControl: dteDoc.control_number,
        codigoGeneracion: dteDoc.generation_code,
      },
    },
  });

  throw new RunnerInputError(`Delivery a MariaDB externa falló: ${deliveryResult.error}`);
}

// ─────────────────────────────────────────────────────────────────
// VERIFY — solo lectura. Confirma post-incidente qué quedó escrito y
// qué no, sin asumir nada del resultado del intento anterior.
// ─────────────────────────────────────────────────────────────────

async function stepVerify(client: PrismaClient, tenantId: string, organizationId: string) {
  if (!PURCHASE_ID) throw new RunnerInputError("--purchase es requerido para --step VERIFY.");

  console.log("\n[VERIFY] Solo lectura contra TrustMe Runtime + control plane. No se escribe nada.\n");

  // 1) ¿Existe algún DteOutgoingDocument para esta Purchase?
  const docs = await client.dteOutgoingDocument.findMany({
    where: { purchase_id: PURCHASE_ID, tenant_id: tenantId },
    select: {
      id: true, dte_type_code: true, dte_status: true, environment: true,
      control_number: true, generation_code: true, created_by: true, created_at: true,
    },
    orderBy: { created_at: "desc" },
  });
  console.log(`[1] DteOutgoingDocument para purchase=${PURCHASE_ID}: ${docs.length}`);
  for (const d of docs) {
    console.log(
      `  - id=${d.id} tipo=${d.dte_type_code} status=${d.dte_status} env=${d.environment} ` +
      `ctrl=${d.control_number ?? "-"} gen=${d.generation_code ?? "-"} created_by=${d.created_by ?? "NULL"} at=${d.created_at.toISOString()}`,
    );
  }
  if (docs.length === 0) {
    console.log("  → Ningún documento persistido para esta compra. Consistente con rollback completo de la transacción CREATE fallida.");
  }

  // 2) Estado actual de DteCorrelative TEST/14 para este tenant
  const correlatives = await client.dteCorrelative.findMany({
    where: { tenant_id: tenantId, environment: "TEST", dte_type_code: "14" },
    select: { id: true, location_id: true, issuer_config_id: true, year: true, last_sequence: true, external_baseline_last_used_sequence: true },
  });
  console.log(`\n[2] DteCorrelative TEST/14: ${correlatives.length} fila(s)`);
  for (const c of correlatives) {
    console.log(
      `  - location=${c.location_id} issuer=${c.issuer_config_id} year=${c.year} ` +
      `last_sequence=${c.last_sequence} baseline=${c.external_baseline_last_used_sequence}`,
    );
  }
  console.log("  (Compará last_sequence contra lo que viste antes del intento fallido. Si no cambió, la reserva se revirtió junto con el create().)");

  // 3) Logs de control plane dejados por este runner para esta organización
  const logs = await controlPlanePrisma.platformDeploymentLog.findMany({
    where: { organization_id: organizationId, action: { startsWith: "SUPPORT_FSE14_TEST_" } },
    select: { id: true, action: true, status: true, notes: true, created_at: true },
    orderBy: { created_at: "desc" },
    take: 10,
  });
  console.log(`\n[3] PlatformDeploymentLog (control plane) para esta organización: ${logs.length}`);
  for (const l of logs) {
    console.log(`  - ${l.created_at.toISOString()} action=${l.action} status=${l.status} notes="${l.notes ?? ""}"`);
  }
}

// ─────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  PASO 6B FASE 3 — Runner FSE14 TEST desde Purchase (TrustMe)    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nstep=${STEP} mode=${MODE} org="${ORG_QUERY}"`);

  if (!VALID_STEPS.includes(STEP)) {
    throw new RunnerInputError(`--step inválido: "${STEP}". Valores válidos: ${VALID_STEPS.join(", ")}.`);
  }
  if (MODE !== "DRY_RUN" && MODE !== "EXECUTE") {
    throw new RunnerInputError(`--mode inválido: "${MODE}". Valores válidos: DRY_RUN, EXECUTE.`);
  }

  const organization = await controlPlanePrisma.platformOrganization.findFirst({
    where: { OR: [{ name: { contains: ORG_QUERY, mode: "insensitive" } }, { code: { contains: ORG_QUERY, mode: "insensitive" } }] },
    select: { id: true, name: true, tenant_id: true },
  });
  if (!organization) throw new RunnerInputError(`Organización no encontrada: "${ORG_QUERY}"`);
  if (!organization.tenant_id) throw new RunnerInputError("La organización no tiene tenant_id — Tenant Binding pendiente.");

  let logStatus: "SUCCESS" | "FAILED" = "SUCCESS";
  let logNotes = `step=${STEP} mode=${MODE}`;
  let transmitOutcome: "ACCEPTED" | "OBSERVED" | "REJECTED" | undefined;

  try {
    await withRuntimePrisma({ organizationId: organization.id }, async (client) => {
      switch (STEP) {
        case "INSPECT":  return stepInspect(client, organization.tenant_id!);
        case "CREATE":   return stepCreate(client, organization.tenant_id!, MODE);
        case "GENERATE": return stepGenerate(client, organization.tenant_id!, MODE);
        case "VALIDATE": return stepValidate(client, organization.tenant_id!, MODE);
        case "VERIFY":   return stepVerify(client, organization.tenant_id!, organization.id);
        case "SIGN":     return stepSign(client, organization.tenant_id!, MODE);
        case "TRANSMIT": {
          transmitOutcome = await stepTransmit(client, organization.tenant_id!, MODE);
          return;
        }
        case "DELIVER": return stepDeliver(client, organization.tenant_id!, MODE);
      }
    });
  } catch (err) {
    logStatus = "FAILED";
    logNotes = `step=${STEP} mode=${MODE} error=${err instanceof Error ? err.message : String(err)}`;
    throw err;
  } finally {
    // Log de control plane solo para pasos que escriben (CREATE/GENERATE/VALIDATE/
    // SIGN/TRANSMIT/DELIVER en EXECUTE). INSPECT y VERIFY son solo lectura y
    // nunca generan log, igual que cualquier DRY_RUN.
    const WRITE_STEPS: Step[] = ["CREATE", "GENERATE", "VALIDATE", "SIGN", "TRANSMIT", "DELIVER"];
    if (WRITE_STEPS.includes(STEP) && MODE === "EXECUTE") {
      try {
        await controlPlanePrisma.platformDeploymentLog.create({
          data: {
            organization_id: organization.id,
            action: `SUPPORT_FSE14_TEST_${STEP}`,
            status: logStatus,
            notes: transmitOutcome ? `${logNotes} outcome=${transmitOutcome}` : logNotes,
            metadata: { step: STEP, mode: MODE, purchaseId: PURCHASE_ID ?? null, issuerId: ISSUER_ID ?? null, dteId: DTE_ID ?? null, actorId: ACTOR_ID ?? null, transmitOutcome: transmitOutcome ?? null },
          },
        });
      } catch {
        // el log nunca debe bloquear ni enmascarar el resultado real
      }
    }
  }

  // Mensaje de cierre contextual — solo se llega aquí si no hubo excepción,
  // así que siempre refleja una operación realmente completada.
  let closingMessage = "No se firmó. No se transmitió a Hacienda. No se tocó PRODUCTION. No se tocó MariaDB externa.";
  if (STEP === "SIGN" && MODE === "EXECUTE") {
    closingMessage = "Se firmó correctamente. No se transmitió a Hacienda. No se tocó PRODUCTION.";
  } else if (STEP === "TRANSMIT" && MODE === "EXECUTE") {
    closingMessage = `Se transmitió a Hacienda TEST (resultado: ${transmitOutcome ?? "desconocido"}). No se tocó MariaDB externa. No se tocó PRODUCTION.`;
  } else if (STEP === "DELIVER" && MODE === "EXECUTE") {
    closingMessage = "Se entregó a MariaDB externa. No se firmó de nuevo. No se transmitió a Hacienda. No se tocó PRODUCTION.";
  }
  console.log(`\n✅ Fin. ${closingMessage}`);
}

main()
  .catch((err) => {
    if (err instanceof RunnerInputError) {
      console.error(`\n✗ ${err.message}`);
    } else if (err instanceof RuntimeDatabaseRouterError) {
      console.error(`\n✗ [${err.code}] ${err.message}`);
    } else {
      console.error("\n✗ Error inesperado:", err instanceof Error ? err.message : err);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await controlPlanePrisma.$disconnect();
  });
