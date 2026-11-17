// ─────────────────────────────────────────────────────────────────
// platform/dte-onboarding/mh-test-runs — mh-test-run.engine.ts
//
// DTE-MH-TEST-RUNS — motor de avance por TRAMOS acotados.
//
// Cada invocación (tick HTTPS desde la VPS) toma el lease de una corrida,
// avanza ítems mientras quede presupuesto de tiempo y libera el lease.
//
// Reglas de seguridad fiscal:
//   - Verdad = base runtime. Cada ítem se re-sincroniza leyendo el
//     documento/evento real por certification_item_key / id antes de
//     decidir. Si el Control Plane perdió una escritura, se recupera.
//   - Una transmisión solo se inicia tras RECLAMAR el ítem (claim con
//     fencing por lease_epoch). Un proceso que perdió el lease no puede
//     reclamar → no inicia una segunda transmisión.
//   - Resultado incierto (timeout, 5xx, excepción, proceso caído durante
//     TRANSMITTING) → UNCERTAIN. Para DTE se concilia con la consulta MH
//     (reconcileDteWithMh); SOLO QUERY_PROCESSED resuelve. Nunca hay
//     retransmisión automática ni documento sustituto.
//   - Único reintento automático de envío: *_AUTH_FAILED registrado en el
//     log (el adapter falla al obtener el token, ANTES de enviar).
//   - Eventos (invalidación/contingencia) sin servicio de consulta: un
//     fallo incierto pasa a NEEDS_REVIEW (decisión del operador).
//   - No se promete exactly-once: la decisión RETRANSMIT_SAME del operador
//     reenvía el MISMO documento (mismo número de control y código).
// ─────────────────────────────────────────────────────────────────

import type { MhTestScenarioCode } from "@/modules/commerce/dte/mh-test-runs/mh-test-scenarios";
import { mhTestItemKey } from "@/modules/commerce/dte/mh-test-runs/mh-test-key";
import type { MhTestRuntimePort } from "./mh-test-run.runtime-port";
import type { MhTestLease, MhTestRunRepository, MhTestItemPatch } from "./mh-test-run.repository";
import {
  MH_TEST_ITEM_REVIEW_STEPS,
  MH_TEST_ITEM_SUCCESS_STEPS,
  MH_TEST_ITEM_TERMINAL_STEPS,
  type MhTestRunItemRecord,
  type MhTestRunItemStep,
  type MhTestRunRecord,
} from "./mh-test-run.types";

export const MH_TEST_LEASE_TTL_MS = 120_000;
export const MH_TEST_DEFAULT_BUDGET_MS = 45_000;
/** Margen mínimo para iniciar un paso (firma 10 s + MH 8 s + escrituras). */
export const MH_TEST_MIN_STEP_MS = 20_000;
export const MH_TEST_MAX_PRE_SEND_RETRIES = 3;
export const MH_TEST_MAX_QUERY_ATTEMPTS = 6;
export const MH_TEST_MAX_STEP_FAILURES = 3;

const PRE_SEND_AUTH_CODES = {
  SEND:                 "MH_TRANSMISSION_AUTH_FAILED",
  INVALIDATE:           "MH_INVALIDATION_AUTH_FAILED",
  CONTINGENCY_TRANSMIT: "MH_CONTINGENCY_AUTH_FAILED",
} as const;

export interface AdvanceDeps {
  repo:     MhTestRunRepository;
  runtime:  (run: MhTestRunRecord) => MhTestRuntimePort;
  now?:     () => Date;
  owner:    string;
  budgetMs?: number;
  /** Para tests: corta tras N acciones. */
  maxActions?: number;
}

export type AdvanceOutcome =
  | { status: "LEASE_BUSY" | "NOT_FOUND" | "NOT_PROCESSABLE" }
  | { status: "LEASE_LOST"; actions: number }
  | { status: "PREFLIGHT_FAILED"; errors: string[] }
  | { status: "ADVANCED"; actions: number; runStatus: string };

type Act = "progress" | "wait" | "lease_lost";

const isTerminal = (s: MhTestRunItemStep) => MH_TEST_ITEM_TERMINAL_STEPS.includes(s);
const isSuccess = (s: MhTestRunItemStep) => MH_TEST_ITEM_SUCCESS_STEPS.includes(s);

function docStatusToStep(status: string): MhTestRunItemStep | null {
  switch (status) {
    case "PENDING_GENERATION": return "MATERIALIZED";
    case "GENERATED":          return "GENERATED";
    case "SCHEMA_VALIDATED":   return "VALIDATED";
    case "SIGNED":             return "SIGNED";
    case "ACCEPTED":
    case "INVALIDATION_PENDING":
    case "INVALIDATED":        return "ACCEPTED";
    case "OBSERVED":           return "OBSERVED";
    case "REJECTED":           return "REJECTED";
    case "CANCELLED":          return "SKIPPED";
    default:                   return null;
  }
}

const PRE_TRANSMIT_DTE_STEPS: readonly MhTestRunItemStep[] = ["MATERIALIZED", "GENERATED", "VALIDATED", "SIGNED"];

export async function advanceMhTestRun(runId: string, deps: AdvanceDeps): Promise<AdvanceOutcome> {
  const now = deps.now ?? (() => new Date());
  const started = now().getTime();
  const budget = deps.budgetMs ?? MH_TEST_DEFAULT_BUDGET_MS;
  const hasTime = () => now().getTime() - started + MH_TEST_MIN_STEP_MS <= budget;

  const lease = await deps.repo.acquireLease(runId, deps.owner, MH_TEST_LEASE_TTL_MS, now());
  if (!lease) {
    const run = await deps.repo.getRun(runId);
    if (!run) return { status: "NOT_FOUND" };
    return { status: run.status === "QUEUED" || run.status === "RUNNING" ? "LEASE_BUSY" : "NOT_PROCESSABLE" };
  }

  let actions = 0;
  try {
    let run = await deps.repo.getRun(runId);
    if (!run) return { status: "NOT_FOUND" };
    const rt = deps.runtime(run);

    const pre = await rt.preflight();
    if (!pre.ok) {
      await deps.repo.updateRun(lease, { status: "NEEDS_REVIEW", last_error: `Preflight: ${pre.errors.join(" · ")}` }, now());
      return { status: "PREFLIGHT_FAILED", errors: pre.errors };
    }
    if (run.status === "QUEUED") {
      if (!(await deps.repo.updateRun(lease, { status: "RUNNING", started_at: now(), last_error: null }, now()))) return { status: "LEASE_LOST", actions };
    }

    // ── Materialización (reserva de correlativos + documentos) ─────
    const planned = run.items.filter((i) => i.kind === "DTE" && i.step === "PLANNED");
    if (planned.length > 0) {
      const res = await rt.materialize(
        planned.map((i) => ({
          key: mhTestItemKey(run!.id, i.seq),
          dteTypeCode: i.dte_type_code as "01" | "03" | "05" | "11" | "14",
          plannedSequence: i.planned_sequence!,
          contingency: i.scenario_code.startsWith("CONT"),
        })),
        run.plan.contingency,
      );
      actions++;
      if (!res.ok) {
        const next = res.nextAvailable ? ` Siguiente disponible: ${JSON.stringify(res.nextAvailable)}.` : "";
        await deps.repo.updateRun(lease, { status: "NEEDS_REVIEW", last_error: `${res.code}: ${res.error}${next}` }, now());
        return { status: "ADVANCED", actions, runStatus: "NEEDS_REVIEW" };
      }
      const byKey = new Map(res.docs.map((d) => [d.key, d]));
      for (const item of planned) {
        const d = byKey.get(mhTestItemKey(run.id, item.seq));
        if (!d) continue;
        const ok = await deps.repo.updateItem(lease, item.id, ["PLANNED"], {
          step: "MATERIALIZED", runtime_dte_document_id: d.dteDocumentId, control_number: d.controlNumber, generation_code: d.generationCode,
        }, now());
        if (!ok) return { status: "LEASE_LOST", actions };
      }
    }

    // ── Avance por ítems ───────────────────────────────────────────
    const queried = new Set<string>(); // una consulta MH por ítem incierto y tick
    let progressed = true;
    while (progressed && hasTime() && (deps.maxActions == null || actions < deps.maxActions)) {
      progressed = false;
      run = (await deps.repo.getRun(runId))!;
      for (const item of run.items) {
        if (!hasTime() || (deps.maxActions != null && actions >= deps.maxActions)) break;
        if (isTerminal(item.step) || MH_TEST_ITEM_REVIEW_STEPS.includes(item.step)) continue;
        const act = await stepItem(run, item, { lease, rt, repo: deps.repo, now, queried });
        if (act === "lease_lost") return { status: "LEASE_LOST", actions };
        if (act === "progress") {
          actions++;
          progressed = true;
          run = (await deps.repo.getRun(runId))!;
        }
      }
    }

    // ── Estado de la corrida ───────────────────────────────────────
    run = (await deps.repo.getRun(runId))!;
    const runStatus = computeRunStatus(run);
    if (runStatus !== run.status) {
      await deps.repo.updateRun(lease, {
        status: runStatus,
        ...(runStatus === "COMPLETED" || runStatus === "COMPLETED_WITH_FAILURES" ? { finished_at: now() } : {}),
      }, now());
    }
    return { status: "ADVANCED", actions, runStatus };
  } finally {
    await deps.repo.releaseLease(lease);
  }
}

export function computeRunStatus(run: MhTestRunRecord): MhTestRunRecord["status"] {
  const steps = run.items.map((i) => i.step);
  if (steps.every(isTerminal)) {
    return run.items.every((i) => isSuccess(i.step)) ? "COMPLETED" : "COMPLETED_WITH_FAILURES";
  }
  // Si lo único que queda pendiente requiere al operador → NEEDS_REVIEW.
  const pending = run.items.filter((i) => !isTerminal(i.step));
  const blocked = pending.every((i) => MH_TEST_ITEM_REVIEW_STEPS.includes(i.step) || dependsOnReview(run, i));
  if (blocked) return "NEEDS_REVIEW";
  return "RUNNING";
}

function dependsOnReview(run: MhTestRunRecord, item: MhTestRunItemRecord): boolean {
  const byId = new Map(run.items.map((i) => [i.id, i]));
  let cur = item.depends_on_item_id ? byId.get(item.depends_on_item_id) : undefined;
  for (let guard = 0; cur && guard < 5; guard++) {
    if (MH_TEST_ITEM_REVIEW_STEPS.includes(cur.step)) return true;
    cur = cur.depends_on_item_id ? byId.get(cur.depends_on_item_id) : undefined;
  }
  // Evento de contingencia esperando documentos en revisión.
  if (item.kind === "CONTINGENCY_EVENT") {
    return run.items.some((i) => i.depends_on_item_id === item.id && MH_TEST_ITEM_REVIEW_STEPS.includes(i.step));
  }
  return false;
}

// ── Paso por ítem ─────────────────────────────────────────────────

interface StepCtx {
  lease:   MhTestLease;
  rt:      MhTestRuntimePort;
  repo:    MhTestRunRepository;
  now:     () => Date;
  queried: Set<string>;
}

async function setItem(c: StepCtx, item: MhTestRunItemRecord, patch: MhTestItemPatch): Promise<Act> {
  return (await c.repo.updateItem(c.lease, item.id, [item.step], patch, c.now())) ? "progress" : "lease_lost";
}

/**
 * Fallo de un paso previo al envío (generar, NC, firmar, crear/armar/firmar
 * evento). Hasta MH_TEST_MAX_STEP_FAILURES se reintenta en ticks
 * posteriores (no en el mismo tick); luego FAILED (revisión del operador).
 * `attempts` cuenta todos los intentos del ítem (pasos y reclamos de envío).
 */
async function failItem(c: StepCtx, item: MhTestRunItemRecord, code: string, message: string): Promise<Act> {
  const failures = item.attempts + 1;
  const final = failures >= MH_TEST_MAX_STEP_FAILURES;
  const ok = await c.repo.updateItem(c.lease, item.id, [item.step], final
    ? { step: "FAILED", attempts: failures, last_error_code: code, last_error_message: message }
    : { attempts: failures, last_error_code: code, last_error_message: message }, c.now());
  if (!ok) return "lease_lost";
  return final ? "progress" : "wait";
}

async function stepItem(run: MhTestRunRecord, item: MhTestRunItemRecord, c: StepCtx): Promise<Act> {
  switch (item.kind) {
    case "DTE":               return stepDte(run, item, c);
    case "INVALIDATION":      return stepInvalidation(run, item, c);
    case "CONTINGENCY_EVENT": return stepContingency(run, item, c);
  }
}

function dependency(run: MhTestRunRecord, item: MhTestRunItemRecord): MhTestRunItemRecord | null {
  return item.depends_on_item_id ? run.items.find((i) => i.id === item.depends_on_item_id) ?? null : null;
}

async function stepDte(run: MhTestRunRecord, item: MhTestRunItemRecord, c: StepCtx): Promise<Act> {
  const key = mhTestItemKey(run.id, item.seq);
  const doc = await c.rt.readDoc(key);
  if (!doc) return setItem(c, item, { step: "NEEDS_REVIEW", last_error_code: "DOC_NOT_FOUND", last_error_message: "El documento de prueba no existe en el runtime." });

  const truth = docStatusToStep(doc.dte_status);
  const evidence = { controlNumber: doc.control_number, generationCode: doc.generation_code, dteStatus: doc.dte_status };

  // Terminal en runtime → sincronizar (recupera escrituras perdidas del CP y transmisiones de un proceso viejo).
  if (truth && isTerminal(truth)) {
    const patch: MhTestItemPatch = { step: truth, reception_stamp: doc.reception_stamp, evidence };
    if (item.step === "TRANSMITTING") {
      // Puede ser el propio resultado de una transmisión cuyo registro falló.
      if (await c.repo.recordTransmitOutcome(item.id, item.claim_epoch ?? -1, patch)) return "progress";
    }
    return setItem(c, item, patch);
  }

  // TRANSMITTING de un epoch anterior (proceso caído o lease perdido) → incierto, nunca reenviar.
  if (item.step === "TRANSMITTING") {
    if (item.claim_epoch === c.lease.epoch) return "wait";
    return setItem(c, item, { step: "UNCERTAIN", last_error_code: "STALE_TRANSMISSION", last_error_message: "Transmisión iniciada por un proceso anterior sin resultado registrado." });
  }

  if (item.step === "UNCERTAIN") return reconcileDte(item, doc.id, c);

  // Re-sincronizar pasos previos al envío con la verdad runtime.
  if (truth && PRE_TRANSMIT_DTE_STEPS.includes(truth) && truth !== item.step && PRE_TRANSMIT_DTE_STEPS.includes(item.step)) {
    return setItem(c, item, { step: truth });
  }

  const scenario = item.scenario_code as MhTestScenarioCode;
  const dep = dependency(run, item);

  switch (doc.dte_status) {
    case "PENDING_GENERATION": {
      if (scenario === "NC05_SOBRE_CCFE") {
        if (!dep) return setItem(c, item, { step: "NEEDS_REVIEW", last_error_code: "NC_WITHOUT_CCFE", last_error_message: "NC sin CCFE relacionado en el plan." });
        if (dep.step !== "ACCEPTED") {
          if (isTerminal(dep.step)) {
            await c.rt.cancelUnsigned(key);
            return setItem(c, item, { step: "SKIPPED", last_error_code: "CCFE_NOT_ACCEPTED", last_error_message: `El CCFE relacionado terminó en ${dep.step}.` });
          }
          return "wait";
        }
        const r = await c.rt.prepareCreditNote(key, mhTestItemKey(run.id, dep.seq));
        return r.ok ? setItem(c, item, { step: "GENERATED", last_error_code: null, last_error_message: null }) : failItem(c, item, r.code ?? "NC_FAILED", r.error);
      }
      const r = await c.rt.generate({ key, scenario, index: item.seq, receptors: run.plan.receptors });
      return r.ok ? setItem(c, item, { step: "GENERATED", last_error_code: null, last_error_message: null }) : failItem(c, item, r.code ?? "GENERATION_FAILED", r.error);
    }
    case "GENERATED": {
      const r = await c.rt.validate(doc.id);
      // Error de schema: determinista → revisión inmediata.
      return r.ok ? setItem(c, item, { step: "VALIDATED", last_error_code: null, last_error_message: null }) : setItem(c, item, { step: "FAILED", last_error_code: "SCHEMA_INVALID", last_error_message: r.error });
    }
    case "SCHEMA_VALIDATED": {
      const r = await c.rt.sign(doc.id);
      return r.ok ? setItem(c, item, { step: "SIGNED", last_error_code: null, last_error_message: null }) : failItem(c, item, "SIGN_FAILED", r.error);
    }
    case "SIGNED": {
      if (item.step !== "SIGNED") return setItem(c, item, { step: "SIGNED" });
      // Documentos de contingencia: se transmiten después del Evento aceptado.
      if (scenario.startsWith("CONT")) {
        if (!dep) return setItem(c, item, { step: "NEEDS_REVIEW", last_error_code: "CONTINGENCY_WITHOUT_EVENT", last_error_message: "Documento de contingencia sin evento en el plan." });
        if (dep.step !== "ACCEPTED") {
          return isTerminal(dep.step)
            ? setItem(c, item, { step: "SKIPPED", last_error_code: "CONTINGENCY_EVENT_NOT_ACCEPTED", last_error_message: `El Evento de Contingencia terminó en ${dep.step}.` })
            : "wait";
        }
      }
      return transmitDte(item, doc.id, c);
    }
    default:
      return setItem(c, item, { step: "NEEDS_REVIEW", last_error_code: "UNEXPECTED_DOC_STATUS", last_error_message: `Estado runtime inesperado: ${doc.dte_status}.` });
  }
}

async function transmitDte(item: MhTestRunItemRecord, docId: string, c: StepCtx): Promise<Act> {
  const before = await c.rt.lastLog(docId, "SEND");
  if (!(await c.repo.claimForTransmit(c.lease, item.id, ["SIGNED"], c.now()))) return "lease_lost";
  const epoch = c.lease.epoch;

  let res: Awaited<ReturnType<MhTestRuntimePort["transmit"]>>;
  try {
    res = await c.rt.transmit(docId);
  } catch (err) {
    // Excepción no controlada: el envío pudo haber ocurrido → incierto.
    await c.repo.recordTransmitOutcome(item.id, epoch, { step: "UNCERTAIN", last_error_code: "TRANSMIT_EXCEPTION", last_error_message: err instanceof Error ? err.message : String(err) });
    return "progress";
  }

  if (res.ok) {
    const doc = await c.rt.readDoc(mhTestItemKey(item.run_id, item.seq)).catch(() => null);
    await c.repo.recordTransmitOutcome(item.id, epoch, {
      step: res.dteStatus, mh_estado: res.mhEstado, mh_descripcion: res.descripcionMsg, reception_stamp: res.selloRecibido ?? doc?.reception_stamp ?? null,
      last_error_code: null, last_error_message: null,
    });
    return "progress";
  }

  const after = await c.rt.lastLog(docId, "SEND");
  if (after.count === before.count) {
    // El servicio devolvió error sin registrar intento: falla de negocio previa al adapter (no hubo envío).
    await c.repo.recordTransmitOutcome(item.id, epoch, { step: "FAILED", last_error_code: "PRE_SEND_REJECTED", last_error_message: res.error });
  } else if (after.errorCode === PRE_SEND_AUTH_CODES.SEND) {
    // Pre-envío verificable (token no obtenido): se permite reintentar el MISMO documento.
    await c.repo.recordTransmitOutcome(item.id, epoch, {
      step: item.attempts + 1 >= MH_TEST_MAX_PRE_SEND_RETRIES ? "NEEDS_REVIEW" : "SIGNED",
      last_error_code: after.errorCode, last_error_message: res.error,
    });
  } else {
    await c.repo.recordTransmitOutcome(item.id, epoch, { step: "UNCERTAIN", last_error_code: after.errorCode ?? "UNCERTAIN_RESULT", last_error_message: res.error });
  }
  return "progress";
}

async function reconcileDte(item: MhTestRunItemRecord, docId: string, c: StepCtx): Promise<Act> {
  if (c.queried.has(item.id)) return "wait";
  c.queried.add(item.id);
  const r = await c.rt.reconcile(docId);
  switch (r.status) {
    case "RESOLVED":
    case "REPAIRED_LOCAL": {
      const doc = await c.rt.readDoc(mhTestItemKey(item.run_id, item.seq));
      return setItem(c, item, { step: r.dteStatus, reception_stamp: doc?.reception_stamp ?? null, query_attempts: item.query_attempts + 1, last_error_code: null, last_error_message: null });
    }
    case "PENDING_UNCHANGED": {
      const attempts = item.query_attempts + 1;
      return setItem(c, item, attempts >= MH_TEST_MAX_QUERY_ATTEMPTS
        ? { step: "NEEDS_REVIEW", query_attempts: attempts, last_error_code: `QUERY_${r.queryKind}`, last_error_message: "La consulta MH no confirma el documento. Decisión del operador requerida." }
        : { query_attempts: attempts, last_error_code: `QUERY_${r.queryKind}` });
    }
    case "NO_OP": {
      // ALREADY_RESOLVED: el próximo tick sincroniza desde runtime. NOT_APPLICABLE
      // persistente (estado no conciliable) termina en revisión.
      const attempts = item.query_attempts + 1;
      return setItem(c, item, attempts >= MH_TEST_MAX_QUERY_ATTEMPTS
        ? { step: "NEEDS_REVIEW", query_attempts: attempts, last_error_code: `RECONCILE_${r.reason}`, last_error_message: `Estado runtime ${r.dteStatus} no conciliable.` }
        : { query_attempts: attempts });
    }
    default:
      return setItem(c, item, { step: "NEEDS_REVIEW", last_error_code: r.status, last_error_message: "detail" in r ? r.detail : "error" in r ? r.error : "Resultado de conciliación no esperado." });
  }
}

// ── Invalidación ──────────────────────────────────────────────────

async function stepInvalidation(run: MhTestRunRecord, item: MhTestRunItemRecord, c: StepCtx): Promise<Act> {
  const target = dependency(run, item);
  if (!target) return setItem(c, item, { step: "NEEDS_REVIEW", last_error_code: "NO_TARGET", last_error_message: "Invalidación sin documento objetivo." });
  if (target.step !== "ACCEPTED") {
    return isTerminal(target.step)
      ? setItem(c, item, { step: "SKIPPED", last_error_code: "TARGET_NOT_ACCEPTED", last_error_message: `El documento objetivo terminó en ${target.step}.` })
      : "wait";
  }
  if (!target.runtime_dte_document_id) return "wait";
  if (!run.plan.responsible) return setItem(c, item, { step: "NEEDS_REVIEW", last_error_code: "NO_RESPONSIBLE", last_error_message: "Falta responsable de eventos." });

  const ev = await c.rt.findInvalidation(target.runtime_dte_document_id, item.runtime_invalidation_event_id);
  if (!ev) {
    if (item.step !== "PLANNED") return setItem(c, item, { step: "NEEDS_REVIEW", last_error_code: "EVENT_MISSING", last_error_message: "El evento de invalidación registrado no existe en el runtime." });
    const r = await c.rt.createInvalidation(target.runtime_dte_document_id, run.plan.responsible);
    return r.ok
      ? setItem(c, item, { step: "EVENT_CREATED", runtime_invalidation_event_id: r.eventId, last_error_code: null, last_error_message: null })
      : failItem(c, item, "INVALIDATION_CREATE_FAILED", r.error);
  }
  // Recuperación: el evento existe aunque el CP no lo haya registrado.
  if (item.runtime_invalidation_event_id !== ev.id) return setItem(c, item, { runtime_invalidation_event_id: ev.id });
  return driveEvent(item, ev, c, {
    operation: "INVALIDATE",
    docIdForLog: target.runtime_dte_document_id,
    build: null,
    sign: () => c.rt.signInvalidation(ev.id),
    transmit: () => c.rt.transmitInvalidation(ev.id),
  });
}

// ── Contingencia ──────────────────────────────────────────────────

async function stepContingency(run: MhTestRunRecord, item: MhTestRunItemRecord, c: StepCtx): Promise<Act> {
  const docs = run.items.filter((i) => i.depends_on_item_id === item.id);
  if (docs.some((d) => d.step === "ABANDONED" || d.step === "SKIPPED")) {
    if (item.step === "PLANNED") return setItem(c, item, { step: "NEEDS_REVIEW", last_error_code: "CONTINGENCY_DOC_ABANDONED", last_error_message: "Un documento de contingencia fue abandonado antes del evento." });
  }
  if (!run.plan.responsible || !run.plan.contingency) return setItem(c, item, { step: "NEEDS_REVIEW", last_error_code: "NO_CONTINGENCY_SETTINGS", last_error_message: "Falta responsable o configuración de contingencia." });

  const docIds = docs.map((d) => d.runtime_dte_document_id).filter((x): x is string => !!x);
  const ev = await c.rt.findContingency(docIds, item.runtime_contingency_event_id);
  if (!ev) {
    if (item.step !== "PLANNED") return setItem(c, item, { step: "NEEDS_REVIEW", last_error_code: "EVENT_MISSING", last_error_message: "El Evento de Contingencia registrado no existe en el runtime." });
    const window = await c.rt.emissionWindow(docs.map((d) => mhTestItemKey(run.id, d.seq)));
    if (!window.complete || !window.first || !window.last) return "wait"; // documentos aún sin JSON
    const r = await c.rt.createContingency(window.ids, { first: window.first, last: window.last }, run.plan.contingency, run.plan.responsible);
    return r.ok
      ? setItem(c, item, { step: "EVENT_CREATED", runtime_contingency_event_id: r.eventId, last_error_code: null, last_error_message: null })
      : failItem(c, item, "CONTINGENCY_CREATE_FAILED", r.error);
  }
  if (item.runtime_contingency_event_id !== ev.id) return setItem(c, item, { runtime_contingency_event_id: ev.id });
  const refDoc = docIds[0];
  return driveEvent(item, ev, c, {
    operation: "CONTINGENCY_TRANSMIT",
    docIdForLog: refDoc ?? null,
    build: () => c.rt.buildContingency(ev.id, run.plan.responsible!),
    sign: () => c.rt.signContingency(ev.id),
    transmit: () => c.rt.transmitContingency(ev.id),
  });
}

async function driveEvent(
  item: MhTestRunItemRecord,
  ev: { id: string; status: string; mh_sello_recibido: string | null },
  c: StepCtx,
  ops: {
    operation: "INVALIDATE" | "CONTINGENCY_TRANSMIT";
    docIdForLog: string | null;
    build: (() => Promise<{ ok: true } | { ok: false; error: string }>) | null;
    sign: () => Promise<{ ok: true } | { ok: false; error: string }>;
    transmit: () => ReturnType<MhTestRuntimePort["transmitInvalidation"]>;
  },
): Promise<Act> {
  // Terminal en runtime → sincronizar.
  if (ev.status === "ACCEPTED" || ev.status === "REJECTED") {
    const patch: MhTestItemPatch = { step: ev.status, reception_stamp: ev.mh_sello_recibido, evidence: { eventId: ev.id, status: ev.status } };
    if (item.step === "TRANSMITTING" && (await c.repo.recordTransmitOutcome(item.id, item.claim_epoch ?? -1, patch))) return "progress";
    return setItem(c, item, patch);
  }
  if (item.step === "TRANSMITTING") {
    if (item.claim_epoch === c.lease.epoch) return "wait";
    return setItem(c, item, { step: "NEEDS_REVIEW", last_error_code: "STALE_TRANSMISSION", last_error_message: `Transmisión del evento iniciada por un proceso anterior (estado runtime ${ev.status}).` });
  }
  switch (ev.status) {
    case "DRAFT": {
      if (ops.build) {
        const r = await ops.build();
        return r.ok ? setItem(c, item, { step: "EVENT_BUILT", last_error_code: null, last_error_message: null }) : failItem(c, item, "EVENT_BUILD_FAILED", r.error);
      }
      const r = await ops.sign();
      return r.ok ? setItem(c, item, { step: "EVENT_SIGNED", last_error_code: null, last_error_message: null }) : failItem(c, item, "EVENT_SIGN_FAILED", r.error);
    }
    case "PENDING_SIGNATURE": {
      const r = await ops.sign();
      return r.ok ? setItem(c, item, { step: "EVENT_SIGNED", last_error_code: null, last_error_message: null }) : failItem(c, item, "EVENT_SIGN_FAILED", r.error);
    }
    case "SIGNED": {
      if (item.step !== "EVENT_SIGNED") return setItem(c, item, { step: "EVENT_SIGNED" });
      const before = ops.docIdForLog ? await c.rt.lastLog(ops.docIdForLog, ops.operation) : null;
      if (!(await c.repo.claimForTransmit(c.lease, item.id, ["EVENT_SIGNED"], c.now()))) return "lease_lost";
      const epoch = c.lease.epoch;
      let res: Awaited<ReturnType<typeof ops.transmit>>;
      try {
        res = await ops.transmit();
      } catch (err) {
        await c.repo.recordTransmitOutcome(item.id, epoch, { step: "NEEDS_REVIEW", last_error_code: "TRANSMIT_EXCEPTION", last_error_message: err instanceof Error ? err.message : String(err) });
        return "progress";
      }
      if (res.ok) {
        await c.repo.recordTransmitOutcome(item.id, epoch, { step: res.eventStatus, mh_estado: res.mhEstado, mh_descripcion: res.descripcion, reception_stamp: res.sello, last_error_code: null, last_error_message: null });
        return "progress";
      }
      const after = ops.docIdForLog ? await c.rt.lastLog(ops.docIdForLog, ops.operation) : null;
      if (before && after && after.count === before.count) {
        await c.repo.recordTransmitOutcome(item.id, epoch, { step: "FAILED", last_error_code: "PRE_SEND_REJECTED", last_error_message: res.error });
      } else if (after?.errorCode === PRE_SEND_AUTH_CODES[ops.operation]) {
        await c.repo.recordTransmitOutcome(item.id, epoch, {
          step: item.attempts + 1 >= MH_TEST_MAX_PRE_SEND_RETRIES ? "NEEDS_REVIEW" : "EVENT_SIGNED",
          last_error_code: after.errorCode, last_error_message: res.error,
        });
      } else {
        // Sin servicio de consulta de eventos: incierto → operador.
        await c.repo.recordTransmitOutcome(item.id, epoch, { step: "NEEDS_REVIEW", last_error_code: after?.errorCode ?? "UNCERTAIN_RESULT", last_error_message: res.error });
      }
      return "progress";
    }
    case "SENT":
      return setItem(c, item, { step: "NEEDS_REVIEW", last_error_code: "EVENT_SENT_WITHOUT_RESULT", last_error_message: "El evento quedó en SENT sin resultado registrado." });
    default:
      return setItem(c, item, { step: "NEEDS_REVIEW", last_error_code: "UNEXPECTED_EVENT_STATUS", last_error_message: `Estado de evento inesperado: ${ev.status}.` });
  }
}
