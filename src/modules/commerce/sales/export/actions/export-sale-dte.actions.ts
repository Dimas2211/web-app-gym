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
// ─────────────────────────────────────────────────────────────────

import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { prisma }                 from "@/lib/db/prisma";
import { isFex11Enabled }         from "../../../dte/utils/fex11-feature-guard";
import { generateFexJsonForSaleAction } from "../../../dte/actions/generate-fex-json-for-sale.action";
import { signDteDocumentAction }        from "../../../dte/actions/sign-dte-document.action";
import { transmitDteDocumentAction }    from "../../../dte/actions/transmit-dte-document.action";
import { deliverDteToExternalDbAction } from "../../../dte/actions/deliver-dte-to-external-db.action";
import { regenerateRejectedExportDte }  from "../services/export-sale.service";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

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

interface ExportSession {
  tenant_id:   string;
  location_id: string;
}

async function requireExportDteSession(): Promise<ExportSession | { error: string }> {
  if (!isFex11Enabled()) {
    return { error: "FEX 11 no está habilitada. Active DTE_FEX11_ENABLED o DTE_FEX11_TEST_ENABLED en ambiente TEST." };
  }

  const sessionUser = await requireAdmin();
  const tenant_id    = sessionUser.tenant_id;
  const location_id  = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { error: "La sesión no tiene una location activa." };

  // Panel de exportación (commerce.sales) — las actions DTE subyacentes
  // (generate/sign/transmit/deliver) llevan además su propio guard
  // fiscal.dte, ver sección DTE del Bloque B.
  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.sales");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

  return { tenant_id, location_id };
}

function isSession(v: ExportSession | { error: string }): v is ExportSession {
  return "tenant_id" in v;
}

async function loadExportDteState(
  tenant_id: string,
  location_id: string,
  dte_document_id: string,
): Promise<ExportDteState | null> {
  const doc = await prisma.dteOutgoingDocument.findFirst({
    where: { id: dte_document_id, tenant_id, location_id, dte_type_code: "11" },
    select: {
      id: true, sale_id: true, control_number: true, generation_code: true, dte_status: true,
      json_document: true, signed_jws: true, mh_response: true, reception_stamp: true,
    },
  });
  if (!doc) return null;

  const deliveryLogs = await prisma.dteTransmissionLog.findMany({
    where:  { dte_document_id: doc.id, operation_type: "EXTERNAL_DELIVERY" },
    select: { error_message: true },
  });

  const lastLogRow = await prisma.dteTransmissionLog.findFirst({
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
): Promise<ExportDteActionResult> {
  const state = await loadExportDteState(tenant_id, location_id, dte_document_id);
  if (!state) {
    return { ok: false, error: "El documento DTE de exportación no existe o no pertenece a la location activa." };
  }
  return { ok: true, state };
}

export async function getExportDteStateAction(dte_document_id: string): Promise<ExportDteActionResult> {
  const session = await requireExportDteSession();
  if (!isSession(session)) return { ok: false, error: session.error };
  return loadExportDteStateOrError(session.tenant_id, session.location_id, dte_document_id);
}

export async function generateExportDteJsonAction(dte_document_id: string): Promise<ExportDteActionResult> {
  const session = await requireExportDteSession();
  if (!isSession(session)) return { ok: false, error: session.error };

  const result = await generateFexJsonForSaleAction(dte_document_id);
  if (!result.ok) return { ok: false, error: result.error };

  return loadExportDteStateOrError(session.tenant_id, session.location_id, dte_document_id);
}

export async function signExportDteAction(dte_document_id: string): Promise<ExportDteActionResult> {
  const session = await requireExportDteSession();
  if (!isSession(session)) return { ok: false, error: session.error };

  const result = await signDteDocumentAction(dte_document_id);
  if (!result.ok) return { ok: false, error: result.error };

  return loadExportDteStateOrError(session.tenant_id, session.location_id, dte_document_id);
}

export async function transmitExportDteAction(dte_document_id: string): Promise<ExportDteActionResult> {
  const session = await requireExportDteSession();
  if (!isSession(session)) return { ok: false, error: session.error };

  const result = await transmitDteDocumentAction(dte_document_id);
  if (!result.ok) return { ok: false, error: result.error };

  return loadExportDteStateOrError(session.tenant_id, session.location_id, dte_document_id);
}

// F3-C23E — Acción segura tras rechazo por numeroControl duplicado (u
// otro motivo): crea un DteOutgoingDocument NUEVO (numeroControl y
// codigoGeneracion frescos) para la misma venta. Nunca retransmite ni
// modifica el documento RECHAZADO original — queda intacto.
export async function regenerateExportDteAction(dte_document_id: string): Promise<ExportDteActionResult> {
  const session = await requireExportDteSession();
  if (!isSession(session)) return { ok: false, error: session.error };

  const result = await regenerateRejectedExportDte(session.tenant_id, session.location_id, dte_document_id);
  if (!result.ok) return { ok: false, error: result.error };

  return loadExportDteStateOrError(session.tenant_id, session.location_id, result.dte_document_id);
}

export async function deliverExportDteAction(dte_document_id: string): Promise<ExportDteActionResult> {
  const session = await requireExportDteSession();
  if (!isSession(session)) return { ok: false, error: session.error };

  const result = await deliverDteToExternalDbAction(dte_document_id);
  if (!result.ok) return { ok: false, error: result.error };

  return loadExportDteStateOrError(session.tenant_id, session.location_id, dte_document_id);
}
