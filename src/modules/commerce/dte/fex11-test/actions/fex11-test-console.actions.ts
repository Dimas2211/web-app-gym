"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/fex11-test — fex11-test-console.actions.ts
//
// Microfase F3-C18 — server actions de la Consola de prueba FEX 11.
//
// Esta consola NO reemplaza el flujo comercial ni las actions públicas
// de DTE: cada botón delega la operación real en las mismas actions ya
// probadas (generateFexJsonForSaleAction, signDteDocumentAction,
// transmitDteDocumentAction, deliverDteToExternalDbAction). Esta capa
// solo agrega:
//   - guard explícito de consola (flag + NODE_ENV) antes de delegar;
//   - resolución de tenant/location desde sesión (requireAdmin);
//   - lectura de estado seguro del documento + último log, para que
//     el cliente no necesite conocer los detalles de cada service.
//
// No imprime signed_jws, json_document completo, token MH ni
// credenciales MariaDB — solo indica presencia (sí/no) y metadatos
// seguros ya sanitizados por las actions/services subyacentes.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { prisma }                 from "@/lib/db/prisma";
import { isFex11TestEnabled }     from "../../utils/fex11-feature-guard";
import { createFex11TestCase }    from "../utils/fex11-test-data";
import { generateFexJsonForSaleAction } from "../../actions/generate-fex-json-for-sale.action";
import { signDteDocumentAction }        from "../../actions/sign-dte-document.action";
import { transmitDteDocumentAction }    from "../../actions/transmit-dte-document.action";
import { deliverDteToExternalDbAction } from "../../actions/deliver-dte-to-external-db.action";

// ── Tipos públicos ────────────────────────────────────────────────

export interface Fex11ConsoleLastLog {
  operation_type: string;
  created_at:     string;
  ok:             boolean;
  message:        string | null;
}

export interface Fex11ConsoleDteState {
  dte_document_id:           string;
  sale_id:                   string | null;
  control_number:            string | null;
  generation_code:           string | null;
  dte_status:                string;
  has_json_document:         boolean;
  has_signed_jws:            boolean;
  has_mh_response:           boolean;
  has_reception_stamp:       boolean;
  has_external_delivery_log: boolean;
  last_log:                  Fex11ConsoleLastLog | null;
}

export type Fex11ConsoleActionResult =
  | { ok: true; state: Fex11ConsoleDteState }
  | { ok: false; error: string };

// ── Guard de consola ───────────────────────────────────────────────

interface ConsoleSession {
  tenant_id:   string;
  location_id: string;
  user_id:     string;
}

async function requireConsoleSession(): Promise<ConsoleSession | { error: string }> {
  if (process.env.NODE_ENV === "production") {
    return { error: "La consola de prueba FEX 11 está deshabilitada en producción." };
  }
  if (!isFex11TestEnabled()) {
    return { error: "DTE_FEX11_TEST_ENABLED no está activo. La consola está bloqueada." };
  }

  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { error: "La sesión no tiene una location activa." };

  return { tenant_id, location_id, user_id: sessionUser.id };
}

function isConsoleSession(value: ConsoleSession | { error: string }): value is ConsoleSession {
  return "tenant_id" in value;
}

// ── Lectura de estado seguro ───────────────────────────────────────

async function loadConsoleState(
  tenant_id: string,
  location_id: string,
  dte_document_id: string,
): Promise<Fex11ConsoleDteState | null> {
  const doc = await prisma.dteOutgoingDocument.findFirst({
    where: { id: dte_document_id, tenant_id, location_id, dte_type_code: "11" },
    select: {
      id:              true,
      sale_id:         true,
      control_number:  true,
      generation_code: true,
      dte_status:      true,
      json_document:   true,
      signed_jws:      true,
      mh_response:     true,
      reception_stamp: true,
    },
  });

  if (!doc) return null;

  const deliveryLogs = await prisma.dteTransmissionLog.findMany({
    where: { dte_document_id: doc.id, operation_type: "EXTERNAL_DELIVERY" },
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

async function loadConsoleStateOrError(
  tenant_id: string,
  location_id: string,
  dte_document_id: string,
): Promise<Fex11ConsoleActionResult> {
  const state = await loadConsoleState(tenant_id, location_id, dte_document_id);
  if (!state) {
    return { ok: false, error: "El documento DTE de prueba no existe o no pertenece a la location activa." };
  }
  return { ok: true, state };
}

// ── Estado del feature flag (sin secretos) ──────────────────────────

export interface Fex11ConsoleFlagState {
  flag_enabled:      boolean;
  node_env:          string;
  environment_ok:    boolean;
}

export async function getFex11ConsoleFlagStateAction(): Promise<Fex11ConsoleFlagState> {
  return {
    flag_enabled:   isFex11TestEnabled(),
    node_env:       process.env.NODE_ENV ?? "unknown",
    environment_ok: process.env.NODE_ENV !== "production",
  };
}

// ── Botón 1: crear caso de prueba ───────────────────────────────────

export async function createFex11TestCaseAction(): Promise<Fex11ConsoleActionResult> {
  const session = await requireConsoleSession();
  if (!isConsoleSession(session)) return { ok: false, error: session.error };

  try {
    const result = await createFex11TestCase({
      tenant_id:   session.tenant_id,
      location_id: session.location_id,
    });
    return loadConsoleStateOrError(session.tenant_id, session.location_id, result.dte_document_id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error desconocido al crear el caso de prueba." };
  }
}

// ── Botón refrescar ──────────────────────────────────────────────

export async function refreshFex11TestStateAction(
  dte_document_id: string,
): Promise<Fex11ConsoleActionResult> {
  const session = await requireConsoleSession();
  if (!isConsoleSession(session)) return { ok: false, error: session.error };

  return loadConsoleStateOrError(session.tenant_id, session.location_id, dte_document_id);
}

// ── Botón 2: generar JSON ──────────────────────────────────────────

export async function generateFex11TestJsonAction(
  dte_document_id: string,
): Promise<Fex11ConsoleActionResult> {
  const session = await requireConsoleSession();
  if (!isConsoleSession(session)) return { ok: false, error: session.error };

  const result = await generateFexJsonForSaleAction(dte_document_id);
  if (!result.ok) return { ok: false, error: result.error };

  return loadConsoleStateOrError(session.tenant_id, session.location_id, dte_document_id);
}

// ── Botón 3: firmar ─────────────────────────────────────────────────

export async function signFex11TestAction(
  dte_document_id: string,
): Promise<Fex11ConsoleActionResult> {
  const session = await requireConsoleSession();
  if (!isConsoleSession(session)) return { ok: false, error: session.error };

  const result = await signDteDocumentAction(dte_document_id);
  if (!result.ok) return { ok: false, error: result.error };

  return loadConsoleStateOrError(session.tenant_id, session.location_id, dte_document_id);
}

// ── Botón 4: transmitir a Hacienda TEST ──────────────────────────────

export async function transmitFex11TestAction(
  dte_document_id: string,
): Promise<Fex11ConsoleActionResult> {
  const session = await requireConsoleSession();
  if (!isConsoleSession(session)) return { ok: false, error: session.error };

  const result = await transmitDteDocumentAction(dte_document_id);
  if (!result.ok) return { ok: false, error: result.error };

  return loadConsoleStateOrError(session.tenant_id, session.location_id, dte_document_id);
}

// ── Botón 5: enviar a MariaDB ────────────────────────────────────────

export async function deliverFex11TestAction(
  dte_document_id: string,
): Promise<Fex11ConsoleActionResult> {
  const session = await requireConsoleSession();
  if (!isConsoleSession(session)) return { ok: false, error: session.error };

  const result = await deliverDteToExternalDbAction(dte_document_id);
  if (!result.ok) return { ok: false, error: result.error };

  return loadConsoleStateOrError(session.tenant_id, session.location_id, dte_document_id);
}
