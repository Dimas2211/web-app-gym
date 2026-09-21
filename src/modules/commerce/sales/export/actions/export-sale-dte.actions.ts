"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-sale-dte.actions.ts
//
// F3-C21 — Panel DTE del módulo comercial FEX 11. Cada botón delega
// en las mismas actions ya probadas para FE/CCFE/NC/FEX 11
// (generateFexJsonForSaleAction, signDteDocumentAction,
// transmitDteDocumentAction, deliverDteToExternalDbAction) — esta
// capa solo agrega el guard de sesión/flag y lectura de estado
// seguro, mismo patrón que fex11-test-console.actions.ts (no se
// modifica ese archivo).
//
// No devuelve signed_jws, json_document completo, mh_response
// completo ni credenciales — solo indica presencia y metadatos
// seguros.
//
// FASE VI-E4A: la lectura de estado (loadExportDteState) y la
// regeneración tras rechazo (regenerateExportDteAction) pasan por el
// contexto operacional runtime — RUNTIME_CLIENT lee/escribe siempre en
// su propia DB. Firma/transmisión/entrega externa (fuera de alcance de
// esta fase) siguen delegadas sin cambios a sus propias actions, que
// mantienen su propio guard.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin }           from "@/lib/permissions/guards";
import { isFex11Enabled }         from "../../../dte/utils/fex11-feature-guard";
import { generateFexJsonForSaleAction } from "../../../dte/actions/generate-fex-json-for-sale.action";
import { signDteDocumentAction }        from "../../../dte/actions/sign-dte-document.action";
import { transmitDteDocumentAction }    from "../../../dte/actions/transmit-dte-document.action";
import { deliverDteToExternalDbAction } from "../../../dte/actions/deliver-dte-to-external-db.action";
import { regenerateRejectedExportDte }  from "../services/export-sale.service";
import {
  requireOperationalContext,
  OperationalContextError,
  type OperationalContext,
} from "@/modules/platform/runtime/require-operational-context";
import type { PrismaClient } from "@prisma/client";

export interface ExportDteLastLog {
  operation_type: string;
  created_at:     string;
  ok:             boolean;
  message:        string | null;
}

export interface ExportDteState {
  dte_document_id:           string;
  sale_id:                   string | null;
  control_number:            string | null;
  generation_code:           string | null;
  dte_status:                string;
  has_json_document:         boolean;
  has_signed_jws:             boolean;
  has_mh_response:           boolean;
  has_reception_stamp:       boolean;
  has_external_delivery_log: boolean;
  last_log:                  ExportDteLastLog | null;
}

export type ExportDteActionResult =
  | { ok: true; state: ExportDteState }
  | { ok: false; error: string };

async function requireExportDteSession(write: boolean):
  Promise<{ context: OperationalContext; dispose: () => Promise<void> } | { error: string }> {
  if (!isFex11Enabled()) {
    return { error: "FEX 11 no está habilitada. Active DTE_FEX11_ENABLED o DTE_FEX11_TEST_ENABLED en ambiente TEST." };
  }

  const sessionUser = await requireAdmin();

  let handle;
  try {
    // Panel de exportación (commerce.sales) — las actions DTE subyacentes
    // (generate/sign/transmit/deliver) llevan además su propio guard
    // fiscal.dte, ver sección DTE del Bloque B.
    handle = await requireOperationalContext(sessionUser, { module: "commerce.sales", write });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }

  if (!handle.context.locationId) {
    await handle.dispose();
    return { error: "La sesión no tiene una location activa." };
  }

  return handle;
}

function isSession(
  v: { context: OperationalContext; dispose: () => Promise<void> } | { error: string },
): v is { context: OperationalContext; dispose: () => Promise<void> } {
  return "context" in v;
}

async function loadExportDteState(
  tenant_id: string,
  location_id: string,
  dte_document_id: string,
  db: PrismaClient,
): Promise<ExportDteState | null> {
  const doc = await db.dteOutgoingDocument.findFirst({
    where: { id: dte_document_id, tenant_id, location_id, dte_type_code: "11" },
    select: {
      id: true, sale_id: true, control_number: true, generation_code: true, dte_status: true,
      json_document: true, signed_jws: true, mh_response: true, reception_stamp: true,
    },
  });
  if (!doc) return null;

  const deliveryLogs = await db.dteTransmissionLog.findMany({
    where:  { dte_document_id: doc.id, operation_type: "EXTERNAL_DELIVERY" },
    select: { error_message: true },
  });

  const lastLogRow = await db.dteTransmissionLog.findFirst({
    where:   { dte_document_id: doc.id },
    orderBy: { created_at: "desc" },
    select:  { operation_type: true, created_at: true, error_message: true },
  });

  return {
    dte_document_id:           doc.id,
    sale_id:                   doc.sale_id,
    control_number:            doc.control_number,
    generation_code:           doc.generation_code,
    dte_status:                doc.dte_status,
    has_json_document:         doc.json_document != null,
    has_signed_jws:             !!doc.signed_jws,
    has_mh_response:           doc.mh_response != null,
    has_reception_stamp:       !!doc.reception_stamp,
    has_external_delivery_log: deliveryLogs.some((l) => l.error_message === null),
    last_log: lastLogRow
      ? {
          operation_type: lastLogRow.operation_type,
          created_at:     lastLogRow.created_at.toISOString(),
          ok:             lastLogRow.error_message === null,
          message:        lastLogRow.error_message,
        }
      : null,
  };
}

async function loadExportDteStateOrError(
  tenant_id: string,
  location_id: string,
  dte_document_id: string,
  db: PrismaClient,
): Promise<ExportDteActionResult> {
  const state = await loadExportDteState(tenant_id, location_id, dte_document_id, db);
  if (!state) {
    return { ok: false, error: "El documento DTE de exportación no existe o no pertenece a la location activa." };
  }
  return { ok: true, state };
}

export async function getExportDteStateAction(dte_document_id: string): Promise<ExportDteActionResult> {
  const session = await requireExportDteSession(false);
  if (!isSession(session)) return { ok: false, error: session.error };
  const { context, dispose } = session;

  try {
    return await loadExportDteStateOrError(context.tenantId, context.locationId!, dte_document_id, context.client);
  } finally {
    await dispose();
  }
}

export async function generateExportDteJsonAction(dte_document_id: string): Promise<ExportDteActionResult> {
  const session = await requireExportDteSession(true);
  if (!isSession(session)) return { ok: false, error: session.error };
  const { context, dispose } = session;

  try {
    const result = await generateFexJsonForSaleAction(dte_document_id);
    if (!result.ok) return { ok: false, error: result.error };

    return await loadExportDteStateOrError(context.tenantId, context.locationId!, dte_document_id, context.client);
  } finally {
    await dispose();
  }
}

export async function signExportDteAction(dte_document_id: string): Promise<ExportDteActionResult> {
  const session = await requireExportDteSession(true);
  if (!isSession(session)) return { ok: false, error: session.error };
  const { context, dispose } = session;

  try {
    const result = await signDteDocumentAction(dte_document_id);
    if (!result.ok) return { ok: false, error: result.error };

    return await loadExportDteStateOrError(context.tenantId, context.locationId!, dte_document_id, context.client);
  } finally {
    await dispose();
  }
}

export async function transmitExportDteAction(dte_document_id: string): Promise<ExportDteActionResult> {
  const session = await requireExportDteSession(true);
  if (!isSession(session)) return { ok: false, error: session.error };
  const { context, dispose } = session;

  try {
    const result = await transmitDteDocumentAction(dte_document_id);
    if (!result.ok) return { ok: false, error: result.error };

    return await loadExportDteStateOrError(context.tenantId, context.locationId!, dte_document_id, context.client);
  } finally {
    await dispose();
  }
}

// F3-C23E — Acción segura tras rechazo por numeroControl duplicado (u
// otro motivo): crea un DteOutgoingDocument NUEVO (numeroControl y
// codigoGeneracion frescos) para la misma venta. Nunca retransmite ni
// modifica el documento RECHAZADO original — queda intacto.
export async function regenerateExportDteAction(dte_document_id: string): Promise<ExportDteActionResult> {
  const session = await requireExportDteSession(true);
  if (!isSession(session)) return { ok: false, error: session.error };
  const { context, dispose } = session;

  try {
    const result = await regenerateRejectedExportDte(context.tenantId, context.locationId!, dte_document_id, context.client);
    if (!result.ok) return { ok: false, error: result.error };

    return await loadExportDteStateOrError(context.tenantId, context.locationId!, result.dte_document_id, context.client);
  } finally {
    await dispose();
  }
}

export async function deliverExportDteAction(dte_document_id: string): Promise<ExportDteActionResult> {
  const session = await requireExportDteSession(true);
  if (!isSession(session)) return { ok: false, error: session.error };
  const { context, dispose } = session;

  try {
    const result = await deliverDteToExternalDbAction(dte_document_id);
    if (!result.ok) return { ok: false, error: result.error };

    return await loadExportDteStateOrError(context.tenantId, context.locationId!, dte_document_id, context.client);
  } finally {
    await dispose();
  }
}
