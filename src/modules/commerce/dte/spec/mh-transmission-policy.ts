// ─────────────────────────────────────────────────────────────────
// commerce/dte — spec/mh-transmission-policy.ts
//
// MH20 (Fase 6, IMP20-025) — política de transmisión MH (Manual Técnico
// v2 §3.3 "Política de Reintentos", §3 token; MH20-020/021/023/083).
//
//   1. Umbral de espera: 8 s (DTE_MH_TIMEOUT_MS, por defecto 8000).
//   2. Sin respuesta (timeout) o fallo del emisor al procesar la respuesta:
//        a. CONSULTAR el estado del documento (consultadte);
//        b. solo si no fue recibido, reenviar; máximo 2 veces.
//      Agotados los reintentos → el documento queda CANDIDATO a
//      contingencia, nunca en contingencia automática (Fase 6.1):
//      declarar contingencia exige comprobar las condiciones normativas
//      (tipo CAT-005, causa, ventana y evento), que son independientes del
//      límite técnico de reintentos. Con MH_2_0 la contingencia sigue
//      bloqueada (INC-005, R20-PEND-01).
//   3. Con respuesta de recepción o rechazo: no retransmitir de forma
//      redundante (MH20-021). Tras un rechazo, se corrige y se retransmite
//      con el MISMO código de generación (y mismo número de control).
//   4. Token: vigencia 48 h TEST / 24 h PRODUCTION; la caché local nunca
//      debe superarla.
//
// Funciones puras. No implementan endpoints nuevos.
// ─────────────────────────────────────────────────────────────────

export const MH_TRANSMISSION_TIMEOUT_MS = 8_000;
export const MH_MAX_RETRANSMISSIONS     = 2;
export const MH_TOKEN_VALIDITY_MS: Readonly<Record<"TEST" | "PRODUCTION", number>> = Object.freeze({
  TEST:       48 * 3_600_000,
  PRODUCTION: 24 * 3_600_000,
});

/** Clasificación del resultado de un intento de transmisión. */
export type MhTransmissionOutcome =
  | "ACCEPTED"            // PROCESADO (con o sin observaciones) → sello
  | "REJECTED"            // RECHAZADO: respuesta fiscal definitiva del intento
  | "NOT_SENT"            // fallo antes de enviar el documento (autenticación, configuración)
  | "UNCERTAIN";          // timeout, conexión caída, respuesta ilegible o estado inesperado

/** Códigos técnicos que garantizan que el documento NO llegó a recepción. */
const NOT_SENT_CODES = new Set([
  "MH_TRANSMISSION_AUTH_FAILED", "MH_INVALIDATION_AUTH_FAILED", "MH_CONTINGENCY_AUTH_FAILED",
  "MH_EVENT_ENDPOINT_UNDOCUMENTED",
]);

export function classifyMhTransmissionOutcome(
  r: { ok: true; mhEstado: string } | { ok: false; errorCode?: string | null },
): MhTransmissionOutcome {
  if (r.ok) {
    if (r.mhEstado === "PROCESADO") return "ACCEPTED";
    if (r.mhEstado === "RECHAZADO") return "REJECTED";
    return "UNCERTAIN";
  }
  return r.errorCode && NOT_SENT_CODES.has(r.errorCode) ? "NOT_SENT" : "UNCERTAIN";
}

/** Un intento previo, reconstruido desde DteTransmissionLog. */
export interface MhAttemptRecord {
  kind:      "SEND" | "QUERY";
  outcome?:  MhTransmissionOutcome;
  /** Para QUERY: el documento consta como recibido en MH. */
  received?: boolean | null;
  at:        Date;
}

export type MhRetransmissionDecision =
  | { action: "TRANSMIT"; attemptsAfterUncertain: number }
  | { action: "QUERY_FIRST"; reason: string }
  | { action: "RECONCILE"; reason: string }
  /**
   * Fase 6.1: límite TÉCNICO agotado. No declara contingencia: solo marca
   * al documento como candidato, sujeto a la verificación normativa
   * (assessMhContingencyEligibility). El documento conserva código de
   * generación y número de control.
   */
  | { action: "RETRIES_EXHAUSTED"; reason: string; contingencyCandidate: true };

/**
 * Decide si se permite un nuevo envío del MISMO documento (mismo código
 * de generación y número de control; nunca se regeneran en un reintento).
 */
export function decideMhRetransmission(history: readonly MhAttemptRecord[]): MhRetransmissionDecision {
  const sorted = [...history].sort((a, b) => a.at.getTime() - b.at.getTime());
  let uncertainSends = 0;
  let pendingQuery   = false;
  for (const h of sorted) {
    if (h.kind === "SEND") {
      if (h.outcome === "UNCERTAIN") { uncertainSends += 1; pendingQuery = true; }
      else if (h.outcome === "ACCEPTED") return { action: "RECONCILE", reason: "El documento ya tiene respuesta de recepción: no se retransmite (MH20-021)." };
      else if (h.outcome === "REJECTED") { uncertainSends = 0; pendingQuery = false; }
    } else {
      if (h.received === true) return { action: "RECONCILE", reason: "La consulta indica que MH ya recibió el documento: conciliar, no reenviar." };
      if (h.received === false) pendingQuery = false;
    }
  }
  if (pendingQuery) {
    return { action: "QUERY_FIRST", reason: "El último envío tuvo resultado incierto: consulte el estado en MH (consultadte) antes de reenviar." };
  }
  // El primer envío no es reintento; los incertidumbres posteriores sí.
  const retries = Math.max(0, uncertainSends);
  if (retries > MH_MAX_RETRANSMISSIONS) {
    return {
      action: "RETRIES_EXHAUSTED",
      contingencyCandidate: true,
      reason:
        `Se agotaron los ${MH_MAX_RETRANSMISSIONS} reintentos tras consulta (MT v2 §3.3). El documento conserva su ` +
        "código de generación y número de control. No se declara contingencia automáticamente: verifique las " +
        "condiciones normativas de contingencia antes de operar en esa modalidad.",
    };
  }
  return { action: "TRANSMIT", attemptsAfterUncertain: retries };
}

// ── Condiciones normativas de contingencia (Fase 6.1) ─────────────

export type MhContingencyEligibility =
  | { eligible: true }
  | { eligible: false; code: "CONTINGENCY_MH20_BLOCKED" | "CONTINGENCY_TYPE_REQUIRED" | "CONTINGENCY_NOT_RETRY_EXHAUSTED" | "CONTINGENCY_ALREADY_ACCEPTED"; reason: string };

/**
 * Separa la decisión técnica (reintentos) de la normativa. Solo un operador
 * puede declarar contingencia y únicamente si:
 *   - el documento no tiene sello (nunca se duplica un DTE aceptado);
 *   - hay una causa CAT-005 explícita (tipo de contingencia) declarada;
 *   - el perfil no es MH_2_0 (contingencia 2.0 bloqueada: INC-005);
 *   - o bien se agotaron los reintentos, o la causa no depende de MH
 *     (p. ej. fallo de conectividad del emisor, tipos distintos de 1).
 * No consulta red ni BD; el llamador aporta los hechos.
 */
export function assessMhContingencyEligibility(params: {
  profile:             "MH_1_2" | "MH_2_0";
  hasReceptionStamp:   boolean;
  contingencyTypeCode: string | null | undefined;
  decision:            MhRetransmissionDecision;
}): MhContingencyEligibility {
  const { profile, hasReceptionStamp, contingencyTypeCode, decision } = params;
  if (hasReceptionStamp || decision.action === "RECONCILE") {
    return { eligible: false, code: "CONTINGENCY_ALREADY_ACCEPTED", reason: "El documento tiene o puede tener sello de recepción: conciliar, no emitir en contingencia." };
  }
  if (profile === "MH_2_0") {
    return { eligible: false, code: "CONTINGENCY_MH20_BLOCKED", reason: "Contingencia 2.0 bloqueada hasta confirmar la versión del evento (INC-005, R20-PEND-01)." };
  }
  if (!contingencyTypeCode || !/^[1-5]$/.test(contingencyTypeCode)) {
    return { eligible: false, code: "CONTINGENCY_TYPE_REQUIRED", reason: "Debe declararse explícitamente el tipo de contingencia (CAT-005)." };
  }
  // Tipo 1 (falla de MH): exige haber agotado los reintentos técnicos.
  if (contingencyTypeCode === "1" && decision.action !== "RETRIES_EXHAUSTED") {
    return { eligible: false, code: "CONTINGENCY_NOT_RETRY_EXHAUSTED", reason: "La contingencia por falla del MH exige haber agotado los reintentos con consulta previa." };
  }
  return { eligible: true };
}

/** ¿La caché local del token respeta la vigencia oficial del ambiente? */
export function isMhTokenCacheTtlCompliant(cacheTtlMs: number, environment: "TEST" | "PRODUCTION"): boolean {
  return cacheTtlMs > 0 && cacheTtlMs <= MH_TOKEN_VALIDITY_MS[environment];
}
