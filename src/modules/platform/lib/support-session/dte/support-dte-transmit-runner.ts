// ─────────────────────────────────────────────────────────────────
// platform/lib/support-session/dte — support-dte-transmit-runner.ts
//
// F2-B3: Runner SERVER-ONLY para transmitir un DteOutgoingDocument en
// estado SIGNED a Hacienda TEST directamente en la base cliente de un
// PlatformDatabaseProfile, usando los adapters MH genéricos (auth +
// transmisión) configurados por variables de entorno (DTE_MH_USER,
// DTE_MH_PASSWORD, DTE_MH_AUTH_URL_TEST, DTE_MH_RECEPTION_URL_TEST).
//
// Replica (sin modificar) la lógica de interpretación de respuesta de
// commerce/dte/services/transmit-dte-document.service.ts, usando el
// PrismaClient dinámico del perfil en lugar del singleton del .env.
// Los adapters HTTP (MhAuthAdapter, MhDteTransmissionAdapter) y su
// config se reutilizan sin cambios porque no dependen de Prisma.
//
// Garantías:
// - Solo dte_type_code "01" (FE) y "03" (CCFE).
// - Solo dte_status === "SIGNED".
// - Exige signed_jws, json_document, generation_code y control_number.
// - Exige venta relacionada CONFIRMED con inventory_moved = true.
// - Solo transmite en ambiente fiscal TEST del documento (nunca PROD).
// - DRY_RUN (previewTransmitSupportDte) es 100% read-only: no llama a
//   MH, no escribe DteOutgoingDocument, no crea DteTransmissionLog.
// - EXECUTE (transmitSupportDteRunner) es la única función que llama
//   a MH y escribe — crea DteTransmissionLog (operación SEND) en éxito
//   y en fallo, sin guardar signed_jws, token ni json_document completo.
// - Estado MH inesperado o error técnico: mantiene SIGNED, incrementa
//   retry_count, igual que el flujo normal.
// - NO transmite a PRODUCTION. NO modifica commerce/dte. NO cambia .env.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[support-dte-transmit-runner] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { PrismaClient, Prisma } from "@prisma/client";
import { getDteMhConfig }            from "../../../../commerce/dte/config/dte-mh.config";
import { MhDteTransmissionAdapter }  from "../../../../commerce/dte/adapters/dte-transmission.adapter";
import { SUPPORT_DTE_ACTIVE_TYPE_CODES } from "./support-dte.constants";
import type {
  DteTransmissionSuccessResult,
} from "../../../../commerce/dte/types/dte-transmission.types";
import type {
  TransmitSupportDteInput,
  TransmitSupportDtePreviewResult,
  TransmitSupportDteResult,
  SupportDteFinalStatus,
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
  signed_jws:      string;
  warnings:        string[];
}

type ValidationResult =
  | { ok: true; data: ValidatedContext }
  | { ok: false; error: string; field?: string };

function dteTypeCodeToVersion(code: SupportDteTypeCode): number {
  return code === "03" ? 3 : 1;
}

/** Determina el estado final a partir de la respuesta normalizada del adapter. */
function determineFinalStatus(
  result: DteTransmissionSuccessResult,
): SupportDteFinalStatus | null {
  if (result.mhEstado === "RECHAZADO") return "REJECTED";

  if (result.mhEstado === "PROCESADO") {
    const hasObs = Array.isArray(result.observaciones) && result.observaciones.length > 0;
    const descObs = result.descripcionMsg?.toLowerCase().includes("observaci") ?? false;
    return hasObs || descObs ? "OBSERVED" : "ACCEPTED";
  }

  return null;
}

async function validateTransmitSupportDte(
  client:   PrismaClient,
  tenantId: string,
  input:    TransmitSupportDteInput,
): Promise<ValidationResult> {
  const warnings: string[] = [];

  // 1-2. Documento existe y pertenece al tenant
  const dteDoc = await client.dteOutgoingDocument.findFirst({
    where: { id: input.dte_document_id, tenant_id: tenantId },
    select: {
      id: true, location_id: true, sale_id: true, dte_type_code: true,
      dte_status: true, environment: true, generation_code: true,
      control_number: true, retry_count: true, signed_jws: true,
      issuer_config_id: true,
    },
  });
  if (!dteDoc) {
    return { ok: false, field: "dte_document_id", error: "El documento DTE no existe o no pertenece al tenant de este perfil." };
  }

  // 6. Tipo DTE permitido
  if (!SUPPORT_DTE_ACTIVE_TYPE_CODES.includes(dteDoc.dte_type_code as SupportDteTypeCode)) {
    return {
      ok: false, field: "dte_document_id",
      error: `Tipo DTE "${dteDoc.dte_type_code}" no está permitido en F2-B3. Solo se admiten "01" (FE) y "03" (CCFE).`,
    };
  }

  // 3. Estado debe ser SIGNED
  if (dteDoc.dte_status !== "SIGNED") {
    return {
      ok: false, field: "dte_document_id",
      error: `Solo se pueden transmitir documentos firmados. Estado actual: "${dteDoc.dte_status}".`,
    };
  }

  // 4. signed_jws debe existir
  if (!dteDoc.signed_jws) {
    return { ok: false, error: "El documento DTE no tiene JWS firmado." };
  }

  // 7-8. generation_code y control_number deben existir
  if (!dteDoc.generation_code) {
    return { ok: false, error: "El documento DTE no tiene codigoGeneracion asignado. Datos internos inconsistentes." };
  }
  if (!dteDoc.control_number) {
    return { ok: false, error: "El documento DTE no tiene numeroControl asignado. Datos internos inconsistentes." };
  }

  // 13. Ambiente fiscal — solo TEST (nunca PROD desde Support Session)
  if (String(dteDoc.environment) !== "TEST") {
    return {
      ok: false,
      error: `Transmisión bloqueada: el documento tiene ambiente fiscal "${dteDoc.environment}". Support Session solo transmite en ambiente TEST.`,
    };
  }

  // 12. Issuer config asignado
  if (!dteDoc.issuer_config_id) {
    return { ok: false, error: "El documento DTE no tiene configuración de emisor (issuer_config) asignada." };
  }

  // 9-11. Venta relacionada debe existir, estar CONFIRMED y con inventario aplicado
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
    return { ok: false, error: `Solo se puede transmitir DTE de ventas confirmadas. Estado actual de la venta: "${sale.status}".` };
  }
  if (!sale.inventory_moved) {
    return { ok: false, error: "La venta aún no ha aplicado inventario. Aplica el inventario primero." };
  }

  // 18. Variables MH requeridas
  const config = getDteMhConfig();
  if (!config.user || !config.password) {
    return { ok: false, error: "Credenciales MH no configuradas (DTE_MH_USER / DTE_MH_PASSWORD)." };
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
      signed_jws:      dteDoc.signed_jws,
      warnings,
    },
  };
}

// ── Preview (dry-run) — solo lectura. No llama a MH. ──────────────

export async function previewTransmitSupportDte(
  client:   PrismaClient,
  tenantId: string,
  input:    TransmitSupportDteInput,
): Promise<
  | { ok: true; preview: TransmitSupportDtePreviewResult }
  | { ok: false; error: string; field?: string }
> {
  const validation = await validateTransmitSupportDte(client, tenantId, input);
  if (!validation.ok) return validation;

  const { data } = validation;

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

// ── Ejecución real — llama a MH TEST y persiste el resultado ──────

export async function transmitSupportDteRunner(
  client:   PrismaClient,
  tenantId: string,
  input:    TransmitSupportDteInput,
): Promise<
  | { ok: true; result: TransmitSupportDteResult }
  | { ok: false; error: string; field?: string }
> {
  const validation = await validateTransmitSupportDte(client, tenantId, input);
  if (!validation.ok) return validation;

  const { data } = validation;

  const config        = getDteMhConfig();
  const receptionUrl  = process.env["DTE_MH_RECEPTION_URL_TEST"] ?? config.receptionUrl;
  const version       = dteTypeCodeToVersion(data.dte_type_code);
  const attemptNumber = data.retry_count + 1;

  const adapter = new MhDteTransmissionAdapter();
  const result  = await adapter.transmit({
    environment:      "TEST",
    dteTypeCode:      data.dte_type_code,
    version,
    codigoGeneracion: data.generation_code,
    signedJws:        data.signed_jws,
  });

  const now = new Date();

  // ── Error técnico: mantener SIGNED, incrementar retry_count ─────
  if (!result.ok) {
    await client.$transaction([
      client.dteOutgoingDocument.update({
        where: { id: data.dte_document_id },
        data:  { retry_count: { increment: 1 } },
      }),
      client.dteTransmissionLog.create({
        data: {
          dte_document_id: data.dte_document_id,
          attempt_number:  attemptNumber,
          operation_type:  "SEND",
          request_url:     receptionUrl,
          http_status:     result.httpStatus ?? null,
          error_message:   result.message,
          response_body: {
            errorCode:  result.errorCode,
            message:    result.message,
            httpStatus: result.httpStatus ?? null,
          },
        },
      }),
    ]);

    return { ok: false, error: result.message };
  }

  const finalStatus = determineFinalStatus(result);

  const mhResponseSanitized = {
    mhEstado:        result.mhEstado,
    codigoMsg:       result.codigoMsg       ?? null,
    descripcionMsg:  result.descripcionMsg  ?? null,
    fhProcesamiento: result.fhProcesamiento ?? null,
    httpStatus:      result.httpStatus,
    idEnvio:         result.idEnvio,
  };

  // ── Estado MH inesperado: mantener SIGNED, incrementar retry_count ─
  if (!finalStatus) {
    await client.$transaction([
      client.dteOutgoingDocument.update({
        where: { id: data.dte_document_id },
        data:  {
          mh_response: mhResponseSanitized,
          retry_count: { increment: 1 },
        },
      }),
      client.dteTransmissionLog.create({
        data: {
          dte_document_id: data.dte_document_id,
          attempt_number:  attemptNumber,
          operation_type:  "SEND",
          request_url:     receptionUrl,
          http_status:     result.httpStatus,
          error_message:   `Estado MH inesperado: ${result.mhEstado}`,
          response_body:   mhResponseSanitized,
        },
      }),
    ]);

    return {
      ok:    false,
      error: `MH respondió con estado inesperado (${result.mhEstado}). El documento se mantiene en SIGNED para reintento.`,
    };
  }

  // ── Actualizar estado según resultado fiscal ──────────────────────

  if (finalStatus === "ACCEPTED") {
    await client.$transaction([
      client.dteOutgoingDocument.update({
        where: { id: data.dte_document_id },
        data:  {
          dte_status:      "ACCEPTED",
          mh_response:     mhResponseSanitized,
          reception_stamp: result.selloRecibido ?? null,
          sent_at:         now,
          accepted_at:     now,
        },
      }),
      client.dteTransmissionLog.create({
        data: {
          dte_document_id: data.dte_document_id,
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

    await client.$transaction([
      client.dteOutgoingDocument.update({
        where: { id: data.dte_document_id },
        data:  {
          dte_status:      "OBSERVED",
          mh_response:     mhResponseSanitized,
          reception_stamp: result.selloRecibido ?? null,
          observations:    observationsJson,
          sent_at:         now,
          observed_at:     now,
        },
      }),
      client.dteTransmissionLog.create({
        data: {
          dte_document_id: data.dte_document_id,
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
    await client.$transaction([
      client.dteOutgoingDocument.update({
        where: { id: data.dte_document_id },
        data:  {
          dte_status:       "REJECTED",
          mh_response:      mhResponseSanitized,
          rejection_reason: result.descripcionMsg ?? null,
          sent_at:          now,
          rejected_at:      now,
        },
      }),
      client.dteTransmissionLog.create({
        data: {
          dte_document_id: data.dte_document_id,
          attempt_number:  attemptNumber,
          operation_type:  "SEND",
          request_url:     receptionUrl,
          http_status:     result.httpStatus,
          error_message:   result.descripcionMsg ?? null,
          response_body:   mhResponseSanitized,
        },
      }),
    ]);
  }

  return {
    ok: true,
    result: {
      dte_document_id: data.dte_document_id,
      sale_id:         data.sale_id,
      dte_status:      finalStatus,
      dte_type_code:   data.dte_type_code,
      generation_code: data.generation_code,
      control_number:  data.control_number,
      mh_estado:       result.mhEstado,
      codigo_msg:      result.codigoMsg ?? null,
      descripcion_msg: result.descripcionMsg ?? null,
      reception_stamp: result.selloRecibido ?? null,
      processed_at:    result.fhProcesamiento ?? null,
      observations:    (result.observaciones as unknown[] | null) ?? null,
    },
  };
}
