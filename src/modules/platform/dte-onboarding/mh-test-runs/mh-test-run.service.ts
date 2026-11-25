// ─────────────────────────────────────────────────────────────────
// platform/dte-onboarding/mh-test-runs — mh-test-run.service.ts
//
// DTE-MH-TEST-RUNS — procesamiento de corridas vencidas (tick) y
// decisiones del operador.
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import { advanceMhTestRun, MH_TEST_DEFAULT_BUDGET_MS, MH_TEST_MIN_STEP_MS, type AdvanceOutcome } from "./mh-test-run.engine";
import type { MhTestRunRepository, MhTestItemPatch, MhTestRunProfileRecord } from "./mh-test-run.repository";
import type { MhTestRuntimePort } from "./mh-test-run.runtime-port";
import type { MhTestOperatorDecision, MhTestRunItemRecord, MhTestRunItemStep, MhTestRunRecord } from "./mh-test-run.types";

export interface ProcessDueDeps {
  repo:      MhTestRunRepository;
  runtime:   (run: MhTestRunRecord, runProfile?: MhTestRunProfileRecord | null) => MhTestRuntimePort;
  budgetMs?: number;
  now?:      () => Date;
  owner?:    string;
}

export interface ProcessDueSummary {
  owner:   string;
  results: Array<{ runId: string; outcome: AdvanceOutcome | { status: "ERROR"; error: string } }>;
}

/** Tick: avanza las corridas QUEUED/RUNNING sin lease vigente dentro del presupuesto total. */
export async function processDueMhTestRuns(deps: ProcessDueDeps): Promise<ProcessDueSummary> {
  const now = deps.now ?? (() => new Date());
  const owner = deps.owner ?? `tick:${randomUUID()}`;
  const budget = deps.budgetMs ?? MH_TEST_DEFAULT_BUDGET_MS;
  const started = now().getTime();
  const ids = await deps.repo.listProcessableRunIds(now(), 5);
  const results: ProcessDueSummary["results"] = [];
  for (const runId of ids) {
    const remaining = budget - (now().getTime() - started);
    if (remaining < MH_TEST_MIN_STEP_MS) break;
    try {
      const outcome = await advanceMhTestRun(runId, { repo: deps.repo, runtime: deps.runtime, now, owner, budgetMs: remaining });
      results.push({ runId, outcome });
    } catch (err) {
      // El lease se libera en el finally del motor; la corrida se reintenta en el
      // próximo tick (la verdad runtime se re-sincroniza). No detiene a las demás.
      results.push({ runId, outcome: { status: "ERROR", error: err instanceof Error ? err.name : "Error" } });
    }
  }
  return { owner, results };
}

// ── Decisiones del operador ───────────────────────────────────────

export type DecisionPlan =
  | { ok: true; fromSteps: readonly MhTestRunItemStep[]; patch: MhTestItemPatch }
  | { ok: false; error: string };

/**
 * Traduce una decisión explícita del operador a un cambio de paso.
 *   - RETRANSMIT_SAME: reenvío del MISMO documento/evento (mismo número de
 *     control y código de generación) tras un resultado incierto. Nunca crea
 *     un documento sustituto. Es la única vía de retransmisión ante
 *     incertidumbre y siempre es manual.
 *   - RETRY_STEP: solo desde FAILED (fallos previos al envío: no hubo
 *     transmisión). El motor re-sincroniza desde el estado runtime.
 *   - ABANDON: cierra el ítem; el número de control queda consumido.
 */
export function planOperatorDecision(item: MhTestRunItemRecord, decision: MhTestOperatorDecision): DecisionPlan {
  const base = { operator_decision: decision, last_error_code: null, last_error_message: null } as const;
  switch (decision) {
    case "RETRANSMIT_SAME":
      if (item.kind === "DTE") {
        if (!["UNCERTAIN", "NEEDS_REVIEW"].includes(item.step) || !item.runtime_dte_document_id) {
          return { ok: false, error: "Solo se retransmite un documento incierto o en revisión ya materializado." };
        }
        return { ok: true, fromSteps: ["UNCERTAIN", "NEEDS_REVIEW"], patch: { ...base, step: "SIGNED", query_attempts: 0, attempts: 0 } };
      }
      if (item.step !== "NEEDS_REVIEW" || !(item.runtime_invalidation_event_id ?? item.runtime_contingency_event_id)) {
        return { ok: false, error: "Solo se retransmite un evento en revisión ya creado en el runtime." };
      }
      return { ok: true, fromSteps: ["NEEDS_REVIEW"], patch: { ...base, step: "EVENT_SIGNED", attempts: 0 } };
    case "RETRY_STEP":
      if (item.step !== "FAILED") return { ok: false, error: "Reintentar paso solo aplica a ítems FAILED (sin envío)." };
      if (item.kind === "DTE") return { ok: true, fromSteps: ["FAILED"], patch: { ...base, step: "MATERIALIZED", attempts: 0 } };
      return {
        ok: true, fromSteps: ["FAILED"],
        patch: { ...base, step: (item.runtime_invalidation_event_id ?? item.runtime_contingency_event_id) ? "EVENT_CREATED" : "PLANNED", attempts: 0 },
      };
    case "ABANDON": {
      const allowed: MhTestRunItemStep[] = ["PLANNED", "MATERIALIZED", "GENERATED", "VALIDATED", "SIGNED", "EVENT_CREATED", "EVENT_BUILT", "EVENT_SIGNED", "UNCERTAIN", "NEEDS_REVIEW", "FAILED"];
      if (!allowed.includes(item.step)) return { ok: false, error: `No se puede abandonar un ítem en ${item.step}.` };
      // Antes de materializar, el bloque de correlativos es contiguo: se cancela la corrida, no un ítem.
      if (item.kind === "DTE" && item.step === "PLANNED") return { ok: false, error: "Antes de reservar correlativos, cancele la corrida completa." };
      return { ok: true, fromSteps: allowed, patch: { ...base, step: "ABANDONED" } };
    }
  }
}
