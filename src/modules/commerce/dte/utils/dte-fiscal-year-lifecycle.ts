// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-fiscal-year-lifecycle.ts
//
// COR-01 (Fase 9.1) — qué se permite con un documento cuyo numeroControl se
// reservó en un ejercicio fiscal anterior, según la etapa de su ciclo de vida.
//
//   DRAFT             PENDING_GENERATION: sin JSON ni firma. Único caso donde
//                     aplica DTE_FISCAL_YEAR_MISMATCH. Puede cancelarse y
//                     emitirse uno nuevo (decisión del operador, no automática).
//   GENERATED         JSON generado (GENERATED / SCHEMA_VALIDATED) sin firma ni
//                     intento de envío. Conserva número/código/JSON; la guarda
//                     de año NO aplica a firma ni transmisión.
//   SIGNED_PENDING    Firmado, sin intento de transmisión. Se recupera y
//                     transmite con su número, código, JSON y firma.
//   UNCERTAIN         Hubo al menos un intento de envío sin resultado definitivo
//                     (SENT, o SIGNED/SCHEMA_VALIDATED con intento previo). No se
//                     cancela ni reemite: primero consulta/conciliación con MH.
//   ACCEPTED          ACCEPTED / OBSERVED. Inmutable.
//   TERMINAL          CANCELLED / NOT_REQUIRED / INVALIDATED / REJECTED /
//                     INVALIDATION_PENDING / CONTINGENCY_PENDING: los gobiernan
//                     sus propios flujos; COR-01 no les añade reglas.
//
// Nunca se renumera, regenera ni re-firma un documento por cambio de año.
// COR-03 no se modifica. Puro y sin BD.
// ─────────────────────────────────────────────────────────────────

export type DteFiscalYearStage =
  | "DRAFT"
  | "GENERATED"
  | "SIGNED_PENDING"
  | "UNCERTAIN"
  | "ACCEPTED"
  | "TERMINAL";

export interface DteFiscalYearLifecycleInput {
  dte_status: string;
  /** true si DteTransmissionLog registra al menos un SEND para el documento. */
  has_transmission_attempt?: boolean;
}

export function classifyDteFiscalYearStage(doc: DteFiscalYearLifecycleInput): DteFiscalYearStage {
  const attempted = doc.has_transmission_attempt === true;
  switch (doc.dte_status) {
    case "PENDING_GENERATION":
      return "DRAFT";
    case "GENERATED":
    case "SCHEMA_VALIDATED":
      return attempted ? "UNCERTAIN" : "GENERATED";
    case "SIGNED":
      return attempted ? "UNCERTAIN" : "SIGNED_PENDING";
    case "SENT":
      return "UNCERTAIN";
    case "ACCEPTED":
    case "OBSERVED":
      return "ACCEPTED";
    default:
      return "TERMINAL";
  }
}

export interface DteCrossYearPolicy {
  stage: DteFiscalYearStage;
  /** La guarda DTE_FISCAL_YEAR_MISMATCH puede bloquear esta etapa. */
  fiscalYearGuardApplies: boolean;
  /** Firma / transmisión / recuperación pueden continuar con el número original. */
  mayContinueTransmission: boolean;
  /** El operador puede cancelar y emitir un documento nuevo. Nunca automático. */
  mayCancelAndReissue: boolean;
  /** Número, código de generación, JSON y firma se conservan sin cambios. */
  preserveIdentity: true;
  /** Exige consulta/conciliación con MH antes de cualquier otra acción. */
  requiresMhReconciliation: boolean;
}

/**
 * Política de cruce de año (`crossesFiscalYear` = el año SV de reserva difiere
 * del año SV actual). Sin cruce, no hay restricción COR-01.
 */
export function decideDteCrossYearPolicy(
  doc: DteFiscalYearLifecycleInput,
  crossesFiscalYear: boolean,
): DteCrossYearPolicy {
  const stage = classifyDteFiscalYearStage(doc);
  const base = { stage, preserveIdentity: true as const };
  switch (stage) {
    case "DRAFT":
      return { ...base, fiscalYearGuardApplies: crossesFiscalYear, mayContinueTransmission: false,
        mayCancelAndReissue: true, requiresMhReconciliation: false };
    case "GENERATED":
    case "SIGNED_PENDING":
      return { ...base, fiscalYearGuardApplies: false, mayContinueTransmission: true,
        mayCancelAndReissue: false, requiresMhReconciliation: false };
    case "UNCERTAIN":
      return { ...base, fiscalYearGuardApplies: false, mayContinueTransmission: false,
        mayCancelAndReissue: false, requiresMhReconciliation: true };
    case "ACCEPTED":
    case "TERMINAL":
      return { ...base, fiscalYearGuardApplies: false, mayContinueTransmission: false,
        mayCancelAndReissue: false, requiresMhReconciliation: false };
  }
}
