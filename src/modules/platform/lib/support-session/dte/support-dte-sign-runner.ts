// ─────────────────────────────────────────────────────────────────
// platform/lib/support-session/dte — support-dte-sign-runner.ts
//
// F2-B2: Runner SERVER-ONLY para firmar un DteOutgoingDocument en
// estado SCHEMA_VALIDATED directamente en la base cliente de un
// PlatformDatabaseProfile, usando el firmador MH configurado por
// variables de entorno (DTE_SIGNER_URL, DTE_SIGNER_NIT,
// DTE_SIGNER_PASSWORD, DTE_SIGNER_TIMEOUT_MS).
//
// Replica (sin modificar) la lógica de
// commerce/dte/services/sign-dte-document.service.ts, usando el
// PrismaClient dinámico del perfil en lugar del singleton del .env.
// El adapter HTTP (MhHttpDteSignerAdapter) y su config se reutilizan
// sin cambios porque no dependen de Prisma — son puro HTTP.
//
// Garantías:
// - Solo dte_type_code "01" (FE) y "03" (CCFE).
// - Solo dte_status === "SCHEMA_VALIDATED".
// - Exige json_document, generation_code y control_number presentes.
// - Exige venta relacionada CONFIRMED con inventory_moved = true.
// - Exige signed_jws vacío (no permite refirmar un documento firmado).
// - Si firma bien: dte_status → SIGNED, guarda signed_jws y signed_at.
// - Si falla: mantiene SCHEMA_VALIDATED, incrementa retry_count.
// - DRY_RUN (previewSignSupportDte) es 100% read-only: no llama al
//   firmador, no escribe DteOutgoingDocument, no crea DteTransmissionLog.
// - EXECUTE (signSupportDteRunner) es la única función que llama al
//   firmador y escribe — crea DteTransmissionLog (operación SIGN) en
//   éxito y en fallo, sin guardar el JWS completo ni secretos.
// - NO transmite a Hacienda. NO modifica commerce/dte. NO cambia .env.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[support-dte-sign-runner] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { PrismaClient }           from "@prisma/client";
import { resolveDteSignerConfig } from "../../../../commerce/dte/config/dte-signer.config";
import { MhHttpDteSignerAdapter } from "../../../../commerce/dte/adapters/dte-signer.adapter";
import type { DteMhEnvironment }  from "../../../../commerce/dte/types/dte-mh-auth.types";
import { SUPPORT_DTE_ACTIVE_TYPE_CODES } from "./support-dte.constants";
import type {
  SignSupportDteInput,
  SignSupportDtePreviewResult,
  SignSupportDteResult,
  SupportDteTypeCode,
} from "../../../types/platform.types";

interface ValidatedContext {
  dte_document_id: string;
  sale_id:         string;
  sale_code:       string;
  location_id:     string;
  dte_type_code:   SupportDteTypeCode;
  environment:     string;
  generation_code: string;
  control_number:  string;
  retry_count:     number;
  json_document:   unknown;
  warnings:        string[];
}

type ValidationResult =
  | { ok: true; data: ValidatedContext }
  | { ok: false; error: string; field?: string };

async function validateSignSupportDte(
  client:   PrismaClient,
  tenantId: string,
  input:    SignSupportDteInput,
): Promise<ValidationResult> {
  const warnings: string[] = [];

  // 1. Documento existe y pertenece al tenant
  const dteDoc = await client.dteOutgoingDocument.findFirst({
    where: { id: input.dte_document_id, tenant_id: tenantId },
    select: {
      id: true, location_id: true, sale_id: true, dte_type_code: true,
      dte_status: true, environment: true, generation_code: true,
      control_number: true, retry_count: true, json_document: true,
      signed_jws: true,
    },
  });
  if (!dteDoc) {
    return { ok: false, field: "dte_document_id", error: "El documento DTE no existe o no pertenece al tenant de este perfil." };
  }

  // 2. Tipo DTE permitido
  if (!SUPPORT_DTE_ACTIVE_TYPE_CODES.includes(dteDoc.dte_type_code as SupportDteTypeCode)) {
    return {
      ok: false, field: "dte_document_id",
      error: `Tipo DTE "${dteDoc.dte_type_code}" no está permitido en F2-B2. Solo se admiten "01" (FE) y "03" (CCFE).`,
    };
  }

  // 3. Estado debe ser SCHEMA_VALIDATED
  if (dteDoc.dte_status !== "SCHEMA_VALIDATED") {
    return {
      ok: false, field: "dte_document_id",
      error: `Solo se pueden firmar documentos validados contra schema. Estado actual: "${dteDoc.dte_status}".`,
    };
  }

  // 4. json_document debe existir
  if (!dteDoc.json_document) {
    return { ok: false, error: "El documento DTE no tiene JSON generado. Genera y valida el JSON antes de firmar." };
  }

  // 5. generation_code y control_number deben existir
  if (!dteDoc.generation_code) {
    return { ok: false, error: "El documento DTE no tiene codigoGeneracion asignado. Datos internos inconsistentes." };
  }
  if (!dteDoc.control_number) {
    return { ok: false, error: "El documento DTE no tiene numeroControl asignado. Datos internos inconsistentes." };
  }

  // 6. signed_jws debe estar vacío — no se permite refirmar
  if (dteDoc.signed_jws) {
    return { ok: false, error: "Este documento ya tiene un JWS firmado. No se permite refirmar un documento ya firmado." };
  }

  // 7. Venta relacionada debe existir, estar CONFIRMED y con inventario aplicado
  if (!dteDoc.sale_id) {
    return { ok: false, error: "El documento DTE no está asociado a ninguna venta." };
  }
  const sale = await client.sale.findFirst({
    where:  { id: dteDoc.sale_id, tenant_id: tenantId, location_id: dteDoc.location_id },
    select: { id: true, sale_code: true, status: true, inventory_moved: true },
  });
  if (!sale) {
    return { ok: false, error: "La venta asociada al DTE no existe o no pertenece a esta location." };
  }
  if (sale.status !== "CONFIRMED") {
    return { ok: false, error: `Solo se puede firmar DTE de ventas confirmadas. Estado actual de la venta: "${sale.status}".` };
  }
  if (!sale.inventory_moved) {
    return { ok: false, error: "La venta aún no ha aplicado inventario. Aplica el inventario primero." };
  }

  return {
    ok: true,
    data: {
      dte_document_id: dteDoc.id,
      sale_id:         sale.id,
      sale_code:       sale.sale_code,
      location_id:     dteDoc.location_id,
      dte_type_code:   dteDoc.dte_type_code as SupportDteTypeCode,
      environment:     String(dteDoc.environment),
      generation_code: dteDoc.generation_code,
      control_number:  dteDoc.control_number,
      retry_count:     dteDoc.retry_count,
      json_document:   dteDoc.json_document,
      warnings,
    },
  };
}

// ── Preview (dry-run) — solo lectura. No llama al firmador. ───────

export async function previewSignSupportDte(
  client:   PrismaClient,
  tenantId: string,
  input:    SignSupportDteInput,
): Promise<
  | { ok: true; preview: SignSupportDtePreviewResult }
  | { ok: false; error: string; field?: string }
> {
  const validation = await validateSignSupportDte(client, tenantId, input);
  if (!validation.ok) return validation;

  const { data } = validation;

  const rawNit      = process.env["DTE_SIGNER_NIT"];
  const passwordPri = process.env["DTE_SIGNER_PASSWORD"];
  if (!rawNit || !passwordPri) {
    return { ok: false, error: "Credenciales del firmador DTE no configuradas (DTE_SIGNER_NIT / DTE_SIGNER_PASSWORD)." };
  }

  return {
    ok: true,
    preview: {
      dte_document_id: data.dte_document_id,
      sale_id:         data.sale_id,
      sale_code:       data.sale_code,
      dte_type_code:   data.dte_type_code,
      environment:     data.environment,
      generation_code: data.generation_code,
      control_number:  data.control_number,
      warnings:        data.warnings,
    },
  };
}

// ── Ejecución real — llama al firmador y persiste el resultado ────

export async function signSupportDteRunner(
  client:   PrismaClient,
  tenantId: string,
  input:    SignSupportDteInput,
): Promise<
  | { ok: true; result: SignSupportDteResult }
  | { ok: false; error: string; field?: string }
> {
  const validation = await validateSignSupportDte(client, tenantId, input);
  if (!validation.ok) return validation;

  const { data } = validation;

  const rawNit      = process.env["DTE_SIGNER_NIT"];
  const passwordPri = process.env["DTE_SIGNER_PASSWORD"];
  if (!rawNit || !passwordPri) {
    return { ok: false, error: "Credenciales del firmador DTE no configuradas (DTE_SIGNER_NIT / DTE_SIGNER_PASSWORD)." };
  }
  const nit = rawNit.replace(/-/g, "");

  let dteJson: unknown;
  try {
    dteJson =
      typeof data.json_document === "string"
        ? JSON.parse(data.json_document as string)
        : data.json_document;
  } catch {
    return { ok: false, error: "El JSON almacenado no es parseable. El documento puede estar corrupto." };
  }

  let signerConfig;
  try {
    signerConfig = resolveDteSignerConfig(data.environment as DteMhEnvironment);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Firmador no configurado para el ambiente del documento." };
  }
  const { signerUrl } = signerConfig;
  const adapter        = new MhHttpDteSignerAdapter();
  const attemptNumber  = data.retry_count + 1;

  let signerResult: Awaited<ReturnType<MhHttpDteSignerAdapter["sign"]>>;
  try {
    signerResult = await adapter.sign({ nit, passwordPri, dteJson }, signerConfig);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error inesperado al llamar al firmador DTE." };
  }

  if (signerResult.ok) {
    const signedAt = signerResult.signedAt;

    await client.$transaction([
      client.dteOutgoingDocument.update({
        where: { id: data.dte_document_id },
        data:  {
          dte_status: "SIGNED",
          signed_jws: signerResult.signedJws,
          signed_at:  signedAt,
        },
      }),
      client.dteTransmissionLog.create({
        data: {
          dte_document_id: data.dte_document_id,
          attempt_number:  attemptNumber,
          operation_type:  "SIGN",
          request_url:     signerUrl,
          response_body:   { status: "OK" },
        },
      }),
    ]);

    return {
      ok: true,
      result: {
        dte_document_id: data.dte_document_id,
        dte_status:      "SIGNED",
        signed_at:       signedAt.toISOString(),
        dte_type_code:   data.dte_type_code,
        generation_code: data.generation_code,
        control_number:  data.control_number,
      },
    };
  }

  // Firma fallida — mantener SCHEMA_VALIDATED, incrementar retry_count
  const httpStatus = signerResult.httpStatus ?? null;

  await client.$transaction([
    client.dteOutgoingDocument.update({
      where: { id: data.dte_document_id },
      data:  { retry_count: { increment: 1 } },
    }),
    client.dteTransmissionLog.create({
      data: {
        dte_document_id: data.dte_document_id,
        attempt_number:  attemptNumber,
        operation_type:  "SIGN",
        request_url:     signerUrl,
        http_status:     httpStatus,
        error_message:   signerResult.message,
        response_body: {
          errorCode:  signerResult.errorCode,
          message:    signerResult.message,
          httpStatus: httpStatus,
        },
      },
    }),
  ]);

  return { ok: false, error: signerResult.message };
}
