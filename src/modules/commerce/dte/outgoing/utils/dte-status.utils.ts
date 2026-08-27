// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — dte-status.utils.ts
//
// Helpers de presentación y lógica de estado DTE reutilizables.
// Extraídos de sale-dte-fiscal-panel.tsx (copiados, no movidos).
// sale-dte-fiscal-panel.tsx NO fue modificado.
// ─────────────────────────────────────────────────────────────────

import type { DteOutgoingDeliverySummary, DteOutgoingInvalidationSummary } from "../types";
import { isFiscallyReceivedByMh } from "../../utils/dte-fiscal-receipt.utils";

// ── Labels de estado DTE ──────────────────────────────────────────

export function dteStatusLabel(s: string): string {
  const map: Record<string, string> = {
    NOT_REQUIRED:         "No requerido",
    PENDING_GENERATION:   "Pendiente",
    GENERATED:            "Generado",
    SCHEMA_VALIDATED:     "Validado",
    SIGNED:               "Firmado",
    SENT:                 "Enviado",
    ACCEPTED:             "Aceptado ✓",
    REJECTED:             "Rechazado ✗",
    OBSERVED:             "Observado",
    CONTINGENCY_PENDING:  "Contingencia",
    INVALIDATION_PENDING: "Inv. pendiente",
    INVALIDATED:          "Invalidado",
  };
  return map[s] ?? s;
}

// ── Clases Tailwind de estado DTE ─────────────────────────────────

export function dteStatusCls(s: string): string {
  if (s === "ACCEPTED")                          return "text-emerald-400 font-semibold";
  if (s === "INVALIDATED" || s === "REJECTED")   return "text-red-400 font-semibold";
  if (s === "SIGNED" || s === "SENT")            return "text-amber-300 font-semibold";
  if (s === "OBSERVED")                          return "text-orange-400 font-semibold";
  return "text-zinc-400";
}

// ── Labels de ambiente ────────────────────────────────────────────

export function envLabel(env: string): string {
  return env === "PRODUCTION" ? "PRODUCCIÓN" : "TEST";
}

export function envCls(env: string): string {
  return env === "PRODUCTION"
    ? "text-red-400 font-semibold"
    : "text-amber-400 font-semibold";
}

// ── Labels de tipo de invalidación (CAT-024) ──────────────────────

export function invalidationTypeLabel(code: string): string {
  const map: Record<string, string> = {
    "1": "Tipo 1 — Error en emisión",
    "2": "Tipo 2 — Rescindir operación",
    "3": "Tipo 3 — Otro",
  };
  return map[code] ?? `Tipo ${code}`;
}

// ── Clases Tailwind de estado de invalidación ─────────────────────

export function invalidationStatusCls(s: string): string {
  if (s === "ACCEPTED")                        return "text-emerald-400";
  if (s === "REJECTED" || s === "CANCELLED")   return "text-red-400";
  if (s === "SIGNED" || s === "SENT")          return "text-amber-300";
  return "text-zinc-400";
}

// ── Labels de tipo DTE ────────────────────────────────────────────

export function dteTypeLabel(code: string): string {
  const map: Record<string, string> = {
    "01": "FE",
    "03": "CCFE",
    "05": "NC",
    "11": "FEX",
    "14": "FSE",
  };
  return map[code] ?? code;
}

export function dteTypeLabelFull(code: string): string {
  const map: Record<string, string> = {
    "01": "Factura Electrónica",
    "03": "Comprobante de Crédito Fiscal",
    "05": "Nota de Crédito",
    "11": "Factura de Exportación",
    "14": "Factura de Sujeto Excluido",
  };
  return map[code] ?? `DTE ${code}`;
}

// ── Predicados de estado ──────────────────────────────────────────

export function isAccepted(status: string): boolean {
  return status === "ACCEPTED";
}

export function isRejected(status: string): boolean {
  return status === "REJECTED";
}

export function isInvalidated(status: string): boolean {
  return status === "INVALIDATED";
}

// ── Helpers de disponibilidad de acciones ────────────────────────
// Calculados en servidor — el cliente solo los lee, no los recalcula.

const EXTERNAL_DELIVERY_TYPES = new Set(["01", "03", "05", "14"]);

export function canCreateCreditNote(
  dteStatus:    string,
  dteTypeCode:  string,
  hasCreditNote: boolean,
): boolean {
  return dteStatus === "ACCEPTED" && dteTypeCode === "03" && !hasCreditNote;
}

export function canInvalidate(
  dteStatus:             string,
  hasActiveInvalidation: boolean,
): boolean {
  // "activa" = cualquier evento de invalidación en estado distinto a CANCELLED
  return dteStatus === "ACCEPTED" && !hasActiveInvalidation;
}

export function canDeliverExternalDte(
  dteStatus:        string,
  dteTypeCode:      string,
  receptionStamp:   string | null,
  externalDelivery: DteOutgoingDeliverySummary,
): boolean {
  return (
    isFiscallyReceivedByMh(dteStatus, receptionStamp) &&
    EXTERNAL_DELIVERY_TYPES.has(dteTypeCode) &&
    !externalDelivery.hasSuccessfulDelivery
  );
}

export function canDeliverExternalInvalidation(
  invalidationEvents:          DteOutgoingInvalidationSummary[],
  externalInvalidationDelivery: DteOutgoingDeliverySummary,
): boolean {
  const hasAcceptedEvent = invalidationEvents.some((ev) => ev.status === "ACCEPTED");
  return hasAcceptedEvent && !externalInvalidationDelivery.hasSuccessfulDelivery;
}

// ── Helpers de acciones de pipeline DTE ──────────────────────────

export function canGenerateJson(dteStatus: string): boolean {
  return dteStatus === "PENDING_GENERATION";
}

export function canValidateSchema(dteStatus: string): boolean {
  return dteStatus === "GENERATED";
}

export function canSign(dteStatus: string): boolean {
  return dteStatus === "SCHEMA_VALIDATED";
}

export function canTransmit(dteStatus: string): boolean {
  return dteStatus === "SIGNED";
}
