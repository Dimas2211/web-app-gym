// ─────────────────────────────────────────────────────────────────
// commerce/dte — list-dte-query-history.ts
//
// FASE IV-C — historial read-only de consultas MH (operation_type
// "QUERY") para un DteOutgoingDocument. Nunca escribe. Nunca expone
// `response_body` crudo — extrae solo un resumen seguro (kind/estado
// MH/codigoMsg/descripcionMsg) desde el JSON ya sanitizado que
// reconcileDteWithMh persiste (ver dte-reconciliation.service.ts:
// sanitizeQueryResultForLog / mhResponseSanitized — ninguno de los dos
// incluye Authorization/token/password/signerApiKey/signed_jws/
// json_document/encrypted_payload por construcción del adapter).
//
// Scoping: esta función NO filtra por tenant/location — asume que el
// caller ya validó que `dteDocumentId` pertenece al tenant/location
// efectivo (mismo patrón que el resto de `DteTransmissionLog` en
// get-dte-outgoing-detail-by-id.ts, donde el documento padre ya fue
// scoped por id+tenant_id+location_id antes de leer sus logs).
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";

export interface DteQueryHistoryEntry {
  id:              string;
  attempt_number:  number;
  http_status:     number | null;
  created_at:      Date;
  /** Categoría normalizada del resultado (DteQueryResult["kind"]) si se pudo determinar. */
  result_kind:     string | null;
  /** Estado MH crudo ("PROCESADO" | "RECHAZADO" | ...) si estaba presente en la respuesta. */
  mh_estado:       string | null;
  codigo_msg:      string | null;
  descripcion_msg: string | null;
  /** Resumen no fiscal del error técnico, si aplica (nunca incluye secretos). */
  error_message:   string | null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * Extrae un resumen seguro desde `response_body` — nunca reenvía el
 * objeto completo (que puede incluir `rawResponse` con el JSON crudo de
 * MH, o el resultado normalizado completo del adapter). Sabe leer las
 * dos formas reales que persiste dte-reconciliation.service.ts:
 *   - QUERY_PROCESSED:  mhResponseSanitized  { mhEstado, codigoMsg, descripcionMsg, ... }
 *   - no conclusivo:    sanitizeQueryResultForLog(result) { kind, mhEstado?, codigoMsg?, descripcionMsg?, ... }
 */
function summarizeResponseBody(responseBody: unknown): {
  result_kind: string | null;
  mh_estado: string | null;
  codigo_msg: string | null;
  descripcion_msg: string | null;
} {
  if (!isPlainObject(responseBody)) {
    return { result_kind: null, mh_estado: null, codigo_msg: null, descripcion_msg: null };
  }
  return {
    result_kind:     asStringOrNull(responseBody["kind"]),
    mh_estado:       asStringOrNull(responseBody["mhEstado"]),
    codigo_msg:      asStringOrNull(responseBody["codigoMsg"]),
    descripcion_msg: asStringOrNull(responseBody["descripcionMsg"]),
  };
}

export async function listDteQueryHistory(params: {
  dteDocumentId: string;
  client?:       PrismaClient;
}): Promise<DteQueryHistoryEntry[]> {
  const { dteDocumentId, client = prisma } = params;

  const rows = await client.dteTransmissionLog.findMany({
    where:   { dte_document_id: dteDocumentId, operation_type: "QUERY" },
    orderBy: { created_at: "desc" },
    select: {
      id:             true,
      attempt_number: true,
      http_status:    true,
      created_at:     true,
      error_message:  true,
      response_body:  true, // consumido solo aquí — nunca reenviado crudo
    },
  });

  return rows.map((row) => {
    const summary = summarizeResponseBody(row.response_body);
    return {
      id:             row.id,
      attempt_number: row.attempt_number,
      http_status:    row.http_status,
      created_at:     row.created_at,
      error_message:  row.error_message,
      ...summary,
    };
  });
}
