// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — dte-action-availability.utils.ts
//
// Cálculo servidor de DteOutgoingActionAvailability.
// Se invoca desde get-dte-outgoing-detail-by-id.ts NUNCA desde el cliente.
// ─────────────────────────────────────────────────────────────────

import type { DteOutgoingActionAvailability } from "../types";

// ── Tipo de entrada mínima ────────────────────────────────────────
// No acepta DteOutgoingDetail completo para evitar dependencia circular.

export interface ActionAvailabilityInput {
  dte_status:    string;
  dte_type_code: string;
  related_nc:           { dte_status: string } | null;
  latest_invalidation:  { status: string } | null;
  delivery:             { hasSuccessfulDelivery: boolean };
  invalidation_delivery: { hasSuccessfulDelivery: boolean };
}

// ─────────────────────────────────────────────────────────────────

export function computeDteOutgoingActionAvailability(
  d: ActionAvailabilityInput,
): DteOutgoingActionAvailability {
  const status   = d.dte_status;
  const typeCode = d.dte_type_code;

  // NC activa: existe y no está en estado terminal negativo
  const hasActiveNc =
    d.related_nc !== null &&
    !["REJECTED", "INVALIDATED", "CANCELLED"].includes(d.related_nc.dte_status);

  const hasAcceptedNc = d.related_nc?.dte_status === "ACCEPTED";

  // Invalidación activa: existe y no está rechazada/cancelada
  const hasActiveInvalidation =
    d.latest_invalidation !== null &&
    !["REJECTED", "CANCELLED"].includes(d.latest_invalidation.status);

  const hasAcceptedInvalidation = d.latest_invalidation?.status === "ACCEPTED";

  // ── Disponibilidad ────────────────────────────────────────────────

  const canGenerateJson  = status === "PENDING_GENERATION";
  const canValidateSchema = status === "GENERATED";
  const canSign          = status === "SCHEMA_VALIDATED";
  const canTransmit      = status === "SIGNED";

  const canCreateCreditNote =
    status    === "ACCEPTED" &&
    typeCode  === "03"       &&
    !hasActiveNc             &&
    !hasAcceptedInvalidation;

  const canInvalidate =
    status === "ACCEPTED" &&
    !hasActiveInvalidation &&
    !hasAcceptedNc;

  const canDeliverExternal =
    status === "ACCEPTED" &&
    !d.delivery.hasSuccessfulDelivery;

  // Requires DTE_STATUS=INVALIDATED (implica invalidación aceptada) +
  // validación explícita del evento + delivery no completado
  const canDeliverExternalInvalidation =
    status === "INVALIDATED" &&
    hasAcceptedInvalidation &&
    !d.invalidation_delivery.hasSuccessfulDelivery;

  // ── Razones de bloqueo ────────────────────────────────────────────

  const reasons: DteOutgoingActionAvailability["reasons"] = {};

  if (!canSign) {
    if (["SIGNED", "SENT", "ACCEPTED", "INVALIDATION_PENDING", "INVALIDATED"].includes(status)) {
      reasons.sign = `No disponible: DTE ya pasó el estado de firma (${status})`;
    } else if (status === "REJECTED") {
      reasons.sign = "No disponible: DTE rechazado por Hacienda";
    } else {
      reasons.sign = `Requiere estado SCHEMA_VALIDATED — actual: ${status}`;
    }
  }

  if (!canTransmit) {
    if (["ACCEPTED", "INVALIDATED"].includes(status)) {
      reasons.transmit = `No disponible: DTE ya fue procesado por Hacienda (${status})`;
    } else if (status === "REJECTED") {
      reasons.transmit = "No disponible: DTE rechazado por Hacienda";
    } else {
      reasons.transmit = `Requiere estado SIGNED — actual: ${status}`;
    }
  }

  if (!canCreateCreditNote) {
    if (typeCode !== "03") {
      reasons.createCreditNote = `Solo disponible para CCFE 03 — tipo actual: ${typeCode}`;
    } else if (status !== "ACCEPTED") {
      reasons.createCreditNote = `Requiere estado ACCEPTED — actual: ${status}`;
    } else if (hasAcceptedInvalidation) {
      reasons.createCreditNote = "No disponible: el DTE fue invalidado por Hacienda";
    } else if (hasActiveNc) {
      reasons.createCreditNote = "Ya existe una Nota de Crédito activa sobre este DTE";
    }
  }

  if (!canInvalidate) {
    if (status !== "ACCEPTED") {
      reasons.invalidate = `Requiere estado ACCEPTED — actual: ${status}`;
    } else if (hasAcceptedNc) {
      reasons.invalidate = "No disponible: existe una NC aceptada vinculada a este DTE";
    } else if (hasActiveInvalidation) {
      reasons.invalidate = "Ya existe un proceso de invalidación activo para este DTE";
    }
  }

  if (!canDeliverExternal) {
    if (status !== "ACCEPTED") {
      reasons.sendExternalDte = `Requiere estado ACCEPTED — actual: ${status}`;
    } else if (d.delivery.hasSuccessfulDelivery) {
      reasons.sendExternalDte = "DTE ya fue entregado exitosamente al sistema externo";
    }
  }

  if (!canDeliverExternalInvalidation) {
    if (status !== "INVALIDATED") {
      reasons.sendExternalInvalidation = `Requiere DTE en estado INVALIDATED — actual: ${status}`;
    } else if (!hasAcceptedInvalidation) {
      reasons.sendExternalInvalidation = "No existe invalidación aceptada por Hacienda para enviar";
    } else if (d.invalidation_delivery.hasSuccessfulDelivery) {
      reasons.sendExternalInvalidation = "La invalidación ya fue entregada exitosamente al sistema externo";
    }
  }

  return {
    canGenerateJson,
    canValidateSchema,
    canSign,
    canTransmit,
    canCreateCreditNote,
    canInvalidate,
    canDeliverExternal,
    canDeliverExternalInvalidation,
    reasons,
  };
}
