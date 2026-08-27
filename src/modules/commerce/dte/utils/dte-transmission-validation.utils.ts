// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-transmission-validation.utils.ts
//
// validateDteTransmissionInput — validación central y reutilizable de
// la combinación transmission_type_code / contingency_type_code /
// contingency_reason al crear un DteOutgoingDocument.
//
// Reglas (Bloque A — Evento de Contingencia MH):
//   NORMAL ("1"):
//     - contingency_type_code y contingency_reason deben quedar null.
//   CONTINGENCIA ("2"):
//     - solo habilitado para dte_type_code "01" (FE) y "03" (CCFE) en
//       esta certificación (whitelist explícita — CAT-023 completo
//       queda fuera de esta microfase).
//     - contingency_type_code obligatorio, uno de "1".."5".
//     - si "5": contingency_reason obligatorio, trim no vacío, máximo
//       500 caracteres (límite de persistencia; el schema JSON del MH
//       aplica además su propio límite de motivoContin al construir el
//       JSON — ver dte-contingency-identification.utils.ts).
//     - si "1".."4": no se acepta contingency_reason arbitrario.
//
// No confía en valores del cliente: debe llamarse siempre server-side
// antes de persistir un DteOutgoingDocument.
// ─────────────────────────────────────────────────────────────────

export const DTE_CONTINGENCY_TYPE_CODES = ["1", "2", "3", "4", "5"] as const;
export type DteContingencyTypeCode = typeof DTE_CONTINGENCY_TYPE_CODES[number];

// Whitelist explícita para esta certificación — NC 05, ND 06, FEX 11,
// FSE 14 y cualquier otro tipo quedan fuera hasta integrar CAT-023 formalmente.
export const DTE_CONTINGENCY_ENABLED_TYPE_CODES = ["01", "03"] as const;

export const DTE_CONTINGENCY_REASON_MAX_LENGTH = 500;

export interface DteTransmissionInput {
  transmission_type_code?: "1" | "2";
  contingency_type_code?: DteContingencyTypeCode | null;
  contingency_reason?: string | null;
}

export interface NormalizedDteTransmission {
  transmission_type_code: "1" | "2";
  contingency_type_code: DteContingencyTypeCode | null;
  contingency_reason: string | null;
}

export type ValidateDteTransmissionResult =
  | { ok: true; data: NormalizedDteTransmission }
  | { ok: false; error: string };

export function validateDteTransmissionInput(
  dte_type_code: string,
  input: DteTransmissionInput,
): ValidateDteTransmissionResult {
  const transmissionTypeCode = input.transmission_type_code ?? "1";

  if (transmissionTypeCode !== "1" && transmissionTypeCode !== "2") {
    return { ok: false, error: `transmission_type_code inválido: "${transmissionTypeCode}". Debe ser "1" o "2".` };
  }

  // ── Transmisión normal ────────────────────────────────────────
  if (transmissionTypeCode === "1") {
    if (input.contingency_type_code != null) {
      return {
        ok:    false,
        error: "No se puede indicar contingency_type_code cuando transmission_type_code es \"1\" (transmisión normal).",
      };
    }
    if (input.contingency_reason != null && input.contingency_reason.trim() !== "") {
      return {
        ok:    false,
        error: "No se puede indicar contingency_reason cuando transmission_type_code es \"1\" (transmisión normal).",
      };
    }
    return {
      ok:   true,
      data: { transmission_type_code: "1", contingency_type_code: null, contingency_reason: null },
    };
  }

  // ── Transmisión por contingencia ──────────────────────────────
  if (!DTE_CONTINGENCY_ENABLED_TYPE_CODES.includes(dte_type_code as typeof DTE_CONTINGENCY_ENABLED_TYPE_CODES[number])) {
    return {
      ok:    false,
      error: `La transmisión por contingencia solo está habilitada para FE 01 y CCFE 03 en esta certificación. Tipo recibido: "${dte_type_code}".`,
    };
  }

  const contingencyTypeCode = input.contingency_type_code ?? null;
  if (!contingencyTypeCode) {
    return {
      ok:    false,
      error: "contingency_type_code es obligatorio cuando transmission_type_code es \"2\" (contingencia).",
    };
  }
  if (!DTE_CONTINGENCY_TYPE_CODES.includes(contingencyTypeCode)) {
    return {
      ok:    false,
      error: `contingency_type_code inválido: "${contingencyTypeCode}". Debe ser uno de: ${DTE_CONTINGENCY_TYPE_CODES.join(", ")}.`,
    };
  }

  if (contingencyTypeCode === "5") {
    const reason = (input.contingency_reason ?? "").trim();
    if (!reason) {
      return {
        ok:    false,
        error: "contingency_reason es obligatorio y no puede estar vacío cuando contingency_type_code es \"5\".",
      };
    }
    if (reason.length > DTE_CONTINGENCY_REASON_MAX_LENGTH) {
      return {
        ok:    false,
        error: `contingency_reason no puede exceder ${DTE_CONTINGENCY_REASON_MAX_LENGTH} caracteres.`,
      };
    }
    return {
      ok:   true,
      data: { transmission_type_code: "2", contingency_type_code: "5", contingency_reason: reason },
    };
  }

  // Causas "1".."4" — motivo libre no aplica; evita persistir una razón
  // arbitraria que el schema MH vigente no exige de forma consistente.
  if (input.contingency_reason != null && input.contingency_reason.trim() !== "") {
    return {
      ok:    false,
      error: `contingency_reason no aplica para contingency_type_code "${contingencyTypeCode}". Solo la causa "5" (Otras) admite motivo libre.`,
    };
  }

  return {
    ok:   true,
    data: { transmission_type_code: "2", contingency_type_code: contingencyTypeCode, contingency_reason: null },
  };
}
