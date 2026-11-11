// ─────────────────────────────────────────────────────────────────
// platform/dte-onboarding — signer-provisioning.presenter.ts
//
// FISCAL-ONBOARDING — presentación del estado del firmador. Separa dos
// conceptos que la UI mezclaba:
//   - Última inspección (conectividad/observación del VPS, solo lectura).
//   - Aprovisionamiento (status de la fila, gobernado por APPLY/VERIFY/
//     ROLLBACK). Un INSPECT exitoso NUNCA lo promueve.
// last_error se conserva como evidencia y se etiqueta con su origen.
// Puro y sin dependencias de servidor: lo usa el panel cliente.
// ─────────────────────────────────────────────────────────────────

import type { ObservedDigest, SignerRunDigest } from "./signer-provisioning.service";

export type Tone = "ok" | "warning" | "error" | "neutral";

export interface SignerStatePresentation {
  inspection:   { tone: Tone; text: string; at: Date | null; current: boolean };
  provisioning: { tone: Tone; text: string };
  pending:      string[];
  lastApply:    { tone: Tone; text: string; at: Date } | null;
  /** last_error con su origen; historical=true si un INSPECT posterior es exitoso. */
  lastError:    { text: string; origin: string; fromLastApply: boolean; historical: boolean } | null;
}

export interface SignerStateInput {
  status:           string;
  last_error:       string | null;
  last_inspect_run: SignerRunDigest | null;
  last_apply_run:   SignerRunDigest | null;
  observed:         ObservedDigest | null;
}

const COMMUNICATION_INTERRUPTION = /^(EXECUTOR_UNREACHABLE|EXECUTOR_TIMEOUT|APPLY_UNCERTAIN|APPLY_PARTIAL)\b/;

const time = (d: Date | string) => new Date(d).getTime();

export function presentSignerState(s: SignerStateInput): SignerStatePresentation {
  const insp = s.last_inspect_run;
  const apply = s.last_apply_run;

  const inspection: SignerStatePresentation["inspection"] = !insp
    ? { tone: "neutral", text: "Sin INSPECT registrado.", at: null, current: false }
    : insp.status === "SUCCESS"
      ? { tone: "ok", text: "Exitosa: el ejecutor del VPS respondió.", at: new Date(insp.started_at), current: true }
      : { tone: "error", text: `Falló: ${insp.error_message ?? "sin detalle"}`, at: new Date(insp.started_at), current: true };

  const provisioning: SignerStatePresentation["provisioning"] =
    s.status === "SIGNER_READY" ? { tone: "ok", text: "Completo y verificado (SIGNER_READY)." }
    : s.status === "INFRA_READY" ? { tone: "warning", text: "Infraestructura aplicada; falta VERIFY (INFRA_READY)." }
    : s.status === "NOT_REGISTERED" ? { tone: "neutral", text: "Sin firmador registrado." }
    : { tone: s.status === "FAILED" ? "error" : "warning", text: `Incompleto (${s.status}).` };

  const pending: string[] = [];
  const o = s.observed;
  if (o && s.status !== "SIGNER_READY") {
    if (o.container_running === false) pending.push("Contenedor del firmador en ejecución");
    if (o.cert_present === false) pending.push("Certificado fiscal en el VPS");
    if (o.api_key_present === false) pending.push("API Key en el VPS");
    if (o.compose_matches === false) pending.push("Docker Compose administrado por Zolvi");
    if (o.vhost_present === false || o.vhost_matches === false) pending.push("Configuración HTTPS del firmador (include Apache)");
  }

  const lastApply: SignerStatePresentation["lastApply"] = !apply ? null
    : apply.status === "SUCCESS" ? { tone: "ok", text: "Exitoso.", at: new Date(apply.started_at) }
    : apply.status === "BLOCKED" ? { tone: "warning", text: `Bloqueado: ${apply.error_message ?? "sin detalle"}`, at: new Date(apply.started_at) }
    : COMMUNICATION_INTERRUPTION.test(apply.error_message ?? "")
      ? { tone: "error", text: `Falló por interrupción de comunicación — ${apply.error_message}`, at: new Date(apply.started_at) }
      : { tone: "error", text: `Falló — ${apply.error_message ?? "sin detalle"}`, at: new Date(apply.started_at) };

  let lastError: SignerStatePresentation["lastError"] = null;
  if (s.last_error) {
    const fromApply = !!apply && apply.error_message === s.last_error;
    const reference = fromApply ? time(apply!.started_at) : null;
    const laterInspectOk = !!insp && insp.status === "SUCCESS" && (reference === null || time(insp.started_at) > reference);
    lastError = {
      text:       s.last_error,
      origin:     fromApply ? "último APPLY" : "última operación de aprovisionamiento",
      fromLastApply: fromApply,
      historical: laterInspectOk,
    };
  }

  return { inspection, provisioning, pending, lastApply, lastError };
}
