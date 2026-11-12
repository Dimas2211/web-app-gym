"use server";

import { revalidatePath } from "next/cache";
import { canAdministerCommerce } from "@/core/permissions/commerce-access";
import { requireAdmin } from "@/lib/permissions/guards";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import type { PrismaClient } from "@prisma/client";
import { generateFeJsonForSaleAction } from "../actions/generate-fe-json-for-sale.action";
import { generateCcfeJsonForSaleAction } from "../actions/generate-ccfe-json-for-sale.action";
import { generateNcJsonAction } from "../actions/generate-nc-json.action";
import { generateFseJsonForPurchaseAction } from "../actions/generate-fse-json-for-purchase.action";
import { validateDteJsonSchemaAction } from "../actions/validate-dte-json-schema.action";
import { signDteDocumentAction } from "../actions/sign-dte-document.action";
import { transmitDteDocumentAction } from "../actions/transmit-dte-document.action";
import { deliverDteToExternalDbAction } from "../actions/deliver-dte-to-external-db.action";
import { reopenRejectedDteForResignAction } from "../actions/reopen-rejected-dte-for-resign.action";
import { reconcileDteWithMhAction } from "../actions/reconcile-dte-with-mh.action";
import { continuationAllowed } from "./availability";
import type {
  DteContinuationRequest,
  DteContinuationOperation,
  DteContinuationState,
  DteContinuationResult,
} from "./types";

async function load(
  request: DteContinuationRequest,
  tenant: string,
  location: string,
  db: PrismaClient
): Promise<DteContinuationState | null> {
  const doc = await db.dteOutgoingDocument.findFirst({
    where: {
      id: request.dteId,
      tenant_id: tenant,
      location_id: location,
      ...(request.origin === "sale"
        ? {
            sale_id: request.originId,
            purchase_id: null,
            dte_type_code: { in: ["01", "03", "05"] },
          }
        : { purchase_id: request.originId, sale_id: null, dte_type_code: "14" }),
    },
    select: {
      id: true,
      dte_type_code: true,
      environment: true,
      dte_status: true,
      control_number: true,
      generation_code: true,
      json_document: true,
      signed_jws: true,
      reception_stamp: true,
      sale: { select: { status: true } },
      purchase: { select: { status: true } },
    },
  });
  if (!doc) return null;
  const [send, delivery, lastLog] = await Promise.all([
    db.dteTransmissionLog.findFirst({
      where: { dte_document_id: doc.id, operation_type: "SEND" },
      orderBy: { created_at: "desc" },
      select: { response_body: true },
    }),
    db.dteTransmissionLog.findFirst({
      where: { dte_document_id: doc.id, operation_type: "EXTERNAL_DELIVERY", error_message: null },
      select: { id: true },
    }),
    db.dteTransmissionLog.findFirst({
      where: { dte_document_id: doc.id },
      orderBy: { created_at: "desc" },
      select: { error_message: true },
    }),
  ]);
  const code = (send?.response_body as { codigoMsg?: unknown } | null)?.codigoMsg;
  return {
    id: doc.id,
    type: doc.dte_type_code,
    environment: doc.environment,
    status: doc.dte_status,
    originStatus: (request.origin === "sale" ? doc.sale : doc.purchase)?.status ?? "UNKNOWN",
    controlNumber: doc.control_number,
    generationCode: doc.generation_code,
    hasJson: doc.json_document != null,
    hasSignature: !!doc.signed_jws,
    hasStamp: !!doc.reception_stamp,
    delivered: !!delivery,
    canReopen: code === "802",
    lastError: lastLog?.error_message?.slice(0, 2000) ?? null,
  };
}

async function execute(
  request: DteContinuationRequest,
  operation?: DteContinuationOperation,
  confirmed = false
): Promise<DteContinuationResult> {
  if (
    !request ||
    !request.dteId ||
    !request.originId ||
    !["sale", "purchase"].includes(request.origin)
  )
    return { ok: false, error: "Selecciona un documento y su venta o compra de origen." };
  if (
    operation &&
    !["generate", "sign", "transmit", "deliver", "reopen", "reconcile"].includes(operation)
  )
    return { ok: false, error: "Operación no disponible." };
  if ((operation === "transmit" || operation === "deliver") && !confirmed)
    return { ok: false, error: "Confirma el envío antes de continuar." };
  const user = await requireAdmin();
  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "fiscal.dte", write: !!operation });
  } catch (error) {
    if (error instanceof OperationalContextError) return { ok: false, error: error.userMessage };
    throw error;
  }
  const { context, dispose } = handle;
  try {
    if (!canAdministerCommerce(context.effectiveUser.role))
      return { ok: false, error: "Sin permisos para gestionar documentos fiscales." };
    if (!context.locationId) return { ok: false, error: "Selecciona una sucursal activa." };
    const state = await load(request, context.tenantId, context.locationId, context.client);
    if (!state)
      return {
        ok: false,
        error:
          "El DTE no corresponde a esta venta o compra, o no está disponible en la sucursal activa.",
      };
    if (!operation) return { ok: true, state }; // Opening is read-only: no generator, signer or MH call.
    if (!continuationAllowed(state, operation))
      return {
        ok: false,
        error: "Esta operación no está disponible en el estado actual. Actualiza el documento.",
      };
    const id = state.id;
    let result: {
      ok: boolean;
      error?: string;
      message?: string;
      validation_errors?: { path: string; message: string }[];
    };
    switch (operation) {
      case "generate":
        if (state.type === "14") result = await generateFseJsonForPurchaseAction(id);
        else {
          if (state.status === "PENDING_GENERATION") {
            result =
              state.type === "01"
                ? await generateFeJsonForSaleAction(id)
                : state.type === "03"
                  ? await generateCcfeJsonForSaleAction(id)
                  : await generateNcJsonAction(id);
            if (!result.ok)
              return {
                ok: false,
                error: result.error ?? result.message ?? "No se pudo generar el JSON.",
              };
          }
          result = await validateDteJsonSchemaAction(id);
        }
        break;
      case "sign":
        result = await signDteDocumentAction(id);
        break;
      case "transmit":
        result = await transmitDteDocumentAction(id);
        break;
      case "deliver":
        result = await deliverDteToExternalDbAction(id, { confirmed: true });
        break;
      case "reopen":
        result = await reopenRejectedDteForResignAction(id);
        break;
      case "reconcile":
        result = await reconcileDteWithMhAction(id);
        break;
    }
    if (!result.ok || result.validation_errors?.length)
      return {
        ok: false,
        error: [
          result.error ?? result.message ?? "Revisa la validación del documento.",
          ...(result.validation_errors ?? []).map((e) => `${e.path}: ${e.message}`),
        ].join("\n"),
      };
    revalidatePath(request.origin === "sale" ? "/dashboard/sales" : "/dashboard/purchases");
    const updated = await load(request, context.tenantId, context.locationId, context.client);
    return updated
      ? { ok: true, state: updated }
      : { ok: false, error: "Actualiza el documento para consultar su estado." };
  } finally {
    await dispose();
  }
}
export async function getDteContinuationAction(
  request: DteContinuationRequest
): Promise<DteContinuationResult> {
  return execute(request);
}
export async function runDteContinuationAction(
  request: DteContinuationRequest,
  operation: DteContinuationOperation,
  confirmed = false
): Promise<DteContinuationResult> {
  return execute(request, operation, confirmed);
}
