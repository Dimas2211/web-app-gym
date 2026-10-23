// ─────────────────────────────────────────────────────────────────
// GYM-5C — reglas PURAS del panel "Seguimiento de mis alumnos".
//
// No hay otra fórmula: cada plan se calcula con complianceInRange (GYM-5B),
// que llama a summarizeCompliance (GYM-5A) sobre el período completo del
// plan, y los indicadores generales SUMAN conteos y aplican compliancePct.
//
// Conceptos (no se mezclan):
//  - ALUMNO       = Client con al menos un plan asignado al entrenador;
//  - PLAN         = ClientWeeklyPlan con trainer_id = perfil del entrenador;
//  - OCURRENCIA   = fecha local de un weekday del plan dentro de su período;
//  - EJECUCIÓN    = ClientPlanDayExecution de (día del plan, fecha local);
//  - ASISTENCIA   = ClassAttendance attended|late (GYM-4), solo conteo.
//
// Estados de una ocurrencia vencida (fecha local ≤ hoy):
//  - SIN_REGISTRO: no hay estado efectivo (ni autorreporte ni entrenador);
//  - POR_REVISAR:  client_status existe y trainer_status es NULL;
//  - REVISADO:     trainer_status existe (prevalece sobre el autorreporte).
// Una ocurrencia futura nunca es pendiente. Un autorreporte no es asistencia.
//
// Indicadores generales: solo planes VIGENTES (activos y con hoy dentro del
// período). Entre planes heredados solapados de un mismo alumno cada fecha
// cuenta una vez, gobernada por el plan más reciente (criterio de GYM-5B).
// ─────────────────────────────────────────────────────────────────

import {
  complianceInRange,
  displayablePct,
  governingSegments,
  planPhase,
  type ComplianceCounts,
  type DateSegment,
  type PlanPhase,
} from "@/modules/client-portal/progress-rules";
import { effectiveStatus, occurrenceDates, type ExecutionRef, type PlanDayRef } from "./training-tracking-rules";

export type OccurrenceState = "SIN_REGISTRO" | "POR_REVISAR" | "REVISADO";

export interface FollowUpPlanInput {
  id: string;
  clientId: string;
  firstName: string;
  lastName: string;
  planName: string;
  branchName: string;
  start: string;
  end: string;
  status: string;
  createdAt: number;
  days: (PlanDayRef & { sessionName: string | null })[];
  executions: ExecutionRef[];
}

export interface ClassifiedOccurrence {
  planId: string;
  dayId: string;
  date: string;
  state: OccurrenceState;
}

/** Ocurrencias vencidas de los tramos indicados, clasificadas con el estado efectivo de GYM-5A. */
export function classifyOccurrences(
  plan: Pick<FollowUpPlanInput, "id" | "days" | "executions">,
  segments: DateSegment[],
  today: string
): ClassifiedOccurrence[] {
  const byKey = new Map(plan.executions.map((e) => [`${e.plan_day_id}|${e.local_date}`, e]));
  const out: ClassifiedOccurrence[] = [];
  for (const seg of segments) {
    const dueEnd = seg.end < today ? seg.end : today;
    for (const day of plan.days) {
      for (const date of occurrenceDates(seg.start, dueEnd, day.weekday)) {
        const eff = effectiveStatus(byKey.get(`${day.id}|${date}`));
        out.push({
          planId: plan.id,
          dayId: day.id,
          date,
          state: !eff ? "SIN_REGISTRO" : eff.source === "TRAINER" ? "REVISADO" : "POR_REVISAR",
        });
      }
    }
  }
  return out;
}

// ── Fila por plan ────────────────────────────────────────────────

export interface FollowUpRow {
  planId: string;
  clientId: string;
  /** "Apellido, Nombre" (mismo formato que la lista de planes). */
  clientName: string;
  /** Nombre y apellido normalizados (sin tildes ni mayúsculas) para la búsqueda. */
  searchKey: string;
  planName: string;
  branchName: string;
  start: string;
  end: string;
  phase: PlanPhase;
  /** Cálculo de GYM-5A sobre el período completo del plan; null si no hay métricas disponibles. */
  counts: ComplianceCounts | null;
  /** Porcentaje mostrable (política de suficiencia de GYM-5B). */
  pct: number | null;
  toReview: number;
  oldestPending: string | null;
  lastRecord: string | null;
  /** Asistencias confirmadas en el período del plan; null si gym.classes no está habilitado o no se pudo leer. */
  attendance: number | null;
}

function displayName(p: Pick<FollowUpPlanInput, "firstName" | "lastName">): string {
  return `${p.lastName}, ${p.firstName}`;
}

export function buildFollowUpRow(
  plan: FollowUpPlanInput,
  today: string,
  opts: { metrics: boolean; attendance: number | null }
): FollowUpRow {
  const base = {
    planId: plan.id,
    clientId: plan.clientId,
    clientName: displayName(plan),
    searchKey: normalizeSearch(`${plan.firstName} ${plan.lastName}`),
    planName: plan.planName,
    branchName: plan.branchName,
    start: plan.start,
    end: plan.end,
    phase: planPhase(plan, today),
    attendance: opts.attendance,
  };
  if (!opts.metrics) return { ...base, counts: null, pct: null, toReview: 0, oldestPending: null, lastRecord: null };

  const counts = complianceInRange([plan], { start: plan.start, end: plan.end }, today);
  let oldestPending: string | null = null;
  let lastRecord: string | null = null;
  for (const o of classifyOccurrences(plan, [{ start: plan.start, end: plan.end }], today)) {
    if (o.state === "SIN_REGISTRO") {
      if (oldestPending === null || o.date < oldestPending) oldestPending = o.date;
    } else if (lastRecord === null || o.date > lastRecord) {
      lastRecord = o.date;
    }
  }
  return { ...base, counts, pct: displayablePct(counts), toReview: counts.selfReportedOnly, oldestPending, lastRecord };
}

// ── Indicadores generales (planes vigentes) ──────────────────────

export interface QueueItem extends ClassifiedOccurrence {
  clientName: string;
  planName: string;
  sessionName: string | null;
}

export interface FollowUpSummary {
  /** Alumnos distintos con al menos un plan vigente. */
  students: number;
  currentPlans: number;
  /** Conteos sumados (fórmula de GYM-5A); cada fecha una sola vez entre planes solapados. */
  counts: ComplianceCounts;
  pct: number | null;
  /** Ocurrencias con registro del entrenador (REVISADO). */
  trainerRecorded: number;
  /** Algún alumno tiene planes vigentes solapados (heredados). */
  overlap: boolean;
  /** Ordenados por fecha local (más antiguo primero). */
  review: QueueItem[];
  pending: QueueItem[];
}

/** Precedencia de GYM-5B: inicio más reciente, luego creación más reciente, luego id. */
function byPrecedence(a: FollowUpPlanInput, b: FollowUpPlanInput): number {
  return b.start.localeCompare(a.start) || b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

export function summarizeFollowUp(plans: FollowUpPlanInput[], today: string): FollowUpSummary {
  const current = plans.filter((p) => planPhase(p, today) === "CURRENT");
  const byClient = new Map<string, FollowUpPlanInput[]>();
  for (const p of current) byClient.set(p.clientId, [...(byClient.get(p.clientId) ?? []), p]);

  const governed: (FollowUpPlanInput & { segments: DateSegment[] })[] = [];
  let overlap = false;
  for (const list of byClient.values()) {
    const sorted = [...list].sort(byPrecedence);
    const segs = governingSegments(sorted.map((p) => ({ id: p.id, start: p.start, end: p.end })));
    for (const p of sorted) {
      const own = segs.get(p.id) ?? [];
      if (!(own.length === 1 && own[0].start === p.start && own[0].end === p.end)) overlap = true;
      governed.push({ ...p, segments: own });
    }
  }

  const counts = complianceInRange(governed, { start: "0000-01-01", end: today }, today);
  const review: QueueItem[] = [];
  const pending: QueueItem[] = [];
  let trainerRecorded = 0;
  for (const p of governed) {
    const sessions = new Map(p.days.map((d) => [d.id, d.sessionName]));
    for (const o of classifyOccurrences(p, p.segments, today)) {
      if (o.state === "REVISADO") {
        trainerRecorded++;
        continue;
      }
      const item = { ...o, clientName: displayName(p), planName: p.planName, sessionName: sessions.get(o.dayId) ?? null };
      (o.state === "POR_REVISAR" ? review : pending).push(item);
    }
  }
  const byDate = (a: QueueItem, b: QueueItem) =>
    a.date.localeCompare(b.date) || a.clientName.localeCompare(b.clientName, "es") || a.dayId.localeCompare(b.dayId);
  review.sort(byDate);
  pending.sort(byDate);

  return {
    students: byClient.size,
    currentPlans: current.length,
    counts,
    pct: displayablePct(counts),
    trainerRecorded,
    overlap,
    review,
    pending,
  };
}

// ── Asistencia confirmada (GYM-4), solo conteos ──────────────────

export interface AttendanceDateRef {
  id: string;
  clientId: string;
  date: string;
}

/** Asistencias confirmadas del alumno dentro del período vencido de cada plan (ids únicos). */
export function attendanceByPlan(
  plans: Pick<FollowUpPlanInput, "id" | "clientId" | "start" | "end">[],
  rows: AttendanceDateRef[],
  today: string
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const p of plans) {
    const dueEnd = p.end < today ? p.end : today;
    const ids = new Set<string>();
    for (const r of rows) if (r.clientId === p.clientId && r.date >= p.start && r.date <= dueEnd) ids.add(r.id);
    out.set(p.id, ids);
  }
  return out;
}

// ── Filtros y orden ──────────────────────────────────────────────

export const FOLLOW_UP_SCOPES = {
  vigentes: "Vigentes",
  todos: "Todos los planes asignados",
  finalizados: "Finalizados",
} as const;

export type FollowUpScope = keyof typeof FOLLOW_UP_SCOPES;
export const DEFAULT_FOLLOW_UP_SCOPE: FollowUpScope = "vigentes";
export const FOLLOW_UP_PAGE_SIZE = 25;
export const SEARCH_MAX = 100;

export interface FollowUpFilters {
  q: string;
  scope: FollowUpScope;
  pending: boolean;
  review: boolean;
  page: number;
}

type Params = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Lista blanca de parámetros del navegador; ninguno identifica entrenador, alumno ni tenant. */
export function parseFollowUpFilters(sp: Params): FollowUpFilters {
  const scope = first(sp.estado);
  const page = Number.parseInt(first(sp.pagina) ?? "1", 10);
  return {
    q: (first(sp.q) ?? "").trim().slice(0, SEARCH_MAX),
    scope: scope && Object.prototype.hasOwnProperty.call(FOLLOW_UP_SCOPES, scope) ? (scope as FollowUpScope) : DEFAULT_FOLLOW_UP_SCOPE,
    pending: first(sp.pendientes) === "1",
    review: first(sp.revisar) === "1",
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  };
}

export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesSearch(row: FollowUpRow, q: string): boolean {
  const terms = normalizeSearch(q);
  return terms === "" || terms.split(" ").every((t) => row.searchKey.includes(t));
}

function matchesScope(row: FollowUpRow, scope: FollowUpScope): boolean {
  if (scope === "vigentes") return row.phase === "CURRENT";
  if (scope === "finalizados") return row.phase === "FINISHED";
  return true;
}

/**
 * Orden: 1) con autorreportes por revisar; 2) pendiente sin registro más
 * antiguo; 3) registro más reciente; 4) nombre alfabético.
 */
export function compareFollowUpRows(a: FollowUpRow, b: FollowUpRow): number {
  const r = Number(b.toReview > 0) - Number(a.toReview > 0);
  if (r !== 0) return r;
  if (a.oldestPending !== b.oldestPending) {
    if (a.oldestPending === null) return 1;
    if (b.oldestPending === null) return -1;
    return a.oldestPending.localeCompare(b.oldestPending);
  }
  if (a.lastRecord !== b.lastRecord) {
    if (a.lastRecord === null) return 1;
    if (b.lastRecord === null) return -1;
    return b.lastRecord.localeCompare(a.lastRecord);
  }
  return a.clientName.localeCompare(b.clientName, "es") || b.start.localeCompare(a.start) || a.planId.localeCompare(b.planId);
}

export interface FilteredRows {
  rows: FollowUpRow[];
  total: number;
  page: number;
  pages: number;
}

/** Filtra (combinable), ordena y pagina. Los filtros de pendientes/revisión requieren métricas. */
export function applyFollowUpFilters(all: FollowUpRow[], f: FollowUpFilters, metrics: boolean): FilteredRows {
  const filtered = all
    .filter((r) => matchesScope(r, f.scope) && matchesSearch(r, f.q))
    .filter((r) => !metrics || !f.pending || (r.counts?.pending ?? 0) > 0)
    .filter((r) => !metrics || !f.review || r.toReview > 0)
    .sort(compareFollowUpRows);
  const pages = Math.max(1, Math.ceil(filtered.length / FOLLOW_UP_PAGE_SIZE));
  const page = Math.min(f.page, pages);
  return {
    rows: filtered.slice((page - 1) * FOLLOW_UP_PAGE_SIZE, page * FOLLOW_UP_PAGE_SIZE),
    total: filtered.length,
    page,
    pages,
  };
}
