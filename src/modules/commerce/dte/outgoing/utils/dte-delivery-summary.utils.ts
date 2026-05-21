// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — dte-delivery-summary.utils.ts
//
// Helper compartido para calcular resúmenes de delivery externo.
// Extraído de la lógica inline de get-sale-detail-by-id.ts.
// Usado tanto por la vista de ventas como por la vista global DTE.
// ─────────────────────────────────────────────────────────────────

import type { DteOutgoingDeliverySummary, DteExternalDeliveryStatus } from "../types";

// ── Tipo base de log ──────────────────────────────────────────────
// El campo response_body se usa solo internamente — nunca se retorna al cliente.

export interface DeliveryLog {
  response_body: unknown;
  error_message: string | null;
  http_status:   number | null;
  created_at:    Date;
}

// ── Predicado de éxito ────────────────────────────────────────────
// Verifica si un log individual representa una entrega exitosa.
// Primero revisa body.ok si existe, luego cae en http_status 2xx sin error.

export function isSuccessfulDeliveryLog(log: DeliveryLog): boolean {
  if (
    log.response_body !== null &&
    log.response_body !== undefined &&
    typeof log.response_body === "object" &&
    !Array.isArray(log.response_body)
  ) {
    const body = log.response_body as Record<string, unknown>;
    if ("ok" in body) return body.ok === true;
  }
  return (
    log.error_message === null &&
    log.http_status !== null &&
    log.http_status >= 200 &&
    log.http_status < 300
  );
}

// ── buildDeliverySummary ──────────────────────────────────────────
// Construye el resumen de delivery para un tipo de operación dado.
// Los logs deben estar ordenados de más reciente a más antiguo (logs[0] = último).
// Compatible estructuralmente con SaleExternalDeliverySummary de sales.

export function buildDeliverySummary(logs: DeliveryLog[]): DteOutgoingDeliverySummary {
  return {
    hasSuccessfulDelivery: logs.some(isSuccessfulDeliveryLog),
    lastAttemptAt:         logs[0]?.created_at ?? null,
    lastErrorMessage:      logs[0]?.error_message ?? null,
    attemptsCount:         logs.length,
  };
}

// ── computeExternalDeliveryStatus ────────────────────────────────
// Versión reducida para el listado global: retorna un enum en lugar del resumen completo.
// Evita incluir response_body en los datos del frontend.

export function computeExternalDeliveryStatus(
  logs: DeliveryLog[],
): DteExternalDeliveryStatus {
  if (logs.length === 0) return "PENDING";
  if (logs.some(isSuccessfulDeliveryLog)) return "DELIVERED";
  return "ERROR";
}
