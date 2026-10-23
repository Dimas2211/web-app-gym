// ─────────────────────────────────────────────────────────────────
// GYM-5D — reglas PURAS de "Analítica de entrenamiento" (gerencial).
//
// No hay otra fórmula: todo cumplimiento sale de complianceInRange (GYM-5B),
// que llama a summarizeCompliance (GYM-5A); los grupos (gimnasio, sucursal,
// entrenador, modalidad, semana/mes) SUMAN conteos y aplican compliancePct.
// Nunca se promedian porcentajes. Suficiencia: displayablePct (GYM-5B).
//
// Conceptos (no se mezclan):
//  - ALUMNO      = Client con plan (solo se cuenta; nunca se nombra);
//  - PLAN        = ClientWeeklyPlan del tenant en el alcance autorizado;
//  - OCURRENCIA  = fecha local de un weekday del plan dentro de su período;
//  - EJECUCIÓN   = ClientPlanDayExecution (entrenador prevalece sobre el
//                  autorreporte; autorreporte sin entrenador = por revisar);
//  - ASISTENCIA  = ClassAttendance (GYM-4), solo conteos; nunca suma al
//                  cumplimiento y un autorreporte nunca es asistencia.
//
// Panorama, sucursales, entrenadores y modalidades: planes VIGENTES (activos
// con hoy dentro del período), desde el inicio de cada plan hasta hoy — el
// mismo contrato que los indicadores de GYM-5C. Evolución: planes activos que
// se cruzan con el período consultado — el mismo contrato que GYM-5B. En
// ambos casos, entre planes heredados solapados de un mismo alumno cada fecha
// cuenta una vez, gobernada por el plan más reciente (governingSegments).
//
// Atribuciones:
//  - plan → entrenador por ClientWeeklyPlan.trainer_id (no por clases
//    impartidas ni por Client.assigned_trainer_id);
//  - plan → modalidad por Client.modality (modalidad ACTUAL del alumno; no
//    es ClientWeeklyPlan.assignment_type, que solo es individual/segmented);
//  - asistencia → sucursal y tipo por ScheduledClass.branch_id y
//    ScheduledClass.session_kind (la sesión donde ocurrió).
// ─────────────────────────────────────────────────────────────────

import type { GymClientModality, GymSessionKind } from "@prisma/client";
import {
  complianceInRange,
  displayablePct,
  governingSegments,
  parseProgressRange,
  planPhase,
  type ComplianceCounts,
  type DateSegment,
  type ProgressBucket,
  type ProgressRange,
} from "@/modules/client-portal/progress-rules";
import { byPrecedence } from "./trainer-follow-up-rules";
import { addDays, type ExecutionRef, type PlanDayRef } from "./training-tracking-rules";

export interface AnalyticsPlanInput {
  id: string;
  clientId: string;
  branchId: string;
  trainerId: string | null;
  /** Client.modality al momento de la consulta. */
  modality: GymClientModality;
  start: string;
  end: string;
  status: string;
  createdAt: number;
  days: PlanDayRef[];
  executions: ExecutionRef[];
}

export type GovernedPlan = AnalyticsPlanInput & { segments: DateSegment[] };

/**
 * Reparte las fechas de los planes de cada alumno (precedencia de GYM-5B).
 * `crossBranchOverlap`: algún alumno tiene planes solapados de sucursales
 * distintas DENTRO de los planes recibidos. Solo se detecta con lo ya leído
 * (nunca se consultan otras sedes): en una vista de una sede es siempre false.
 */
export function governPlans(plans: AnalyticsPlanInput[]): { governed: GovernedPlan[]; overlap: boolean; crossBranchOverlap: boolean } {
  const byClient = new Map<string, AnalyticsPlanInput[]>();
  for (const p of plans) byClient.set(p.clientId, [...(byClient.get(p.clientId) ?? []), p]);
  const governed: GovernedPlan[] = [];
  let overlap = false;
  let crossBranchOverlap = false;
  for (const list of byClient.values()) {
    const sorted = [...list].sort(byPrecedence);
    const segs = governingSegments(sorted.map((p) => ({ id: p.id, start: p.start, end: p.end })));
    for (const p of sorted) {
      const own = segs.get(p.id) ?? [];
      if (!(own.length === 1 && own[0].start === p.start && own[0].end === p.end)) overlap = true;
      governed.push({ ...p, segments: own });
    }
    if (!crossBranchOverlap)
      crossBranchOverlap = sorted.some((a, i) => sorted.slice(i + 1).some((b) => a.branchId !== b.branchId && a.start <= b.end && b.start <= a.end));
  }
  return { governed, overlap, crossBranchOverlap };
}

export interface GroupMetrics {
  /** Alumnos distintos del grupo. */
  students: number;
  plans: number;
  /** Conteos sumados (fórmula de GYM-5A), cada fecha una vez. */
  counts: ComplianceCounts;
  /** Porcentaje mostrable (suficiencia de GYM-5B). */
  pct: number | null;
  /** Ocurrencias vencidas con solo autorreporte (pendientes de revisión). */
  toReview: number;
  /** Ocurrencias vencidas con registro del entrenador. */
  trainerRecorded: number;
}

/** Métricas de un grupo de planes ya gobernados, desde su inicio hasta hoy. */
export function groupMetrics(governed: GovernedPlan[], today: string, trackingStart?: string): GroupMetrics {
  const counts = complianceInRange(governed, { start: "0000-01-01", end: today }, today, { trackingStart });
  return {
    students: new Set(governed.map((p) => p.clientId)).size,
    plans: governed.length,
    counts,
    pct: displayablePct(counts),
    toReview: counts.selfReportedOnly,
    trainerRecorded: counts.completed + counts.partial + counts.skipped - counts.selfReportedOnly,
  };
}

// ── Panorama y agrupaciones (planes vigentes) ────────────────────

export interface GroupRow<K extends string> {
  key: K;
  metrics: GroupMetrics;
}

export const MODALITIES: readonly GymClientModality[] = ["NORMAL", "PERSONALIZED", "GROUP"];
export const NO_TRAINER = "__none__";

export interface CurrentAnalytics {
  overview: GroupMetrics;
  overlap: boolean;
  /** Solapes de un mismo alumno entre sucursales, entre los planes del alcance consultado. */
  crossBranchOverlap: boolean;
  byBranch: Map<string, GroupMetrics>;
  /** Clave = trainer_id o NO_TRAINER. */
  byTrainer: Map<string, GroupMetrics>;
  byModality: GroupRow<GymClientModality>[];
}

function groupBy<K>(governed: GovernedPlan[], key: (p: GovernedPlan) => K): Map<K, GovernedPlan[]> {
  const out = new Map<K, GovernedPlan[]>();
  for (const p of governed) out.set(key(p), [...(out.get(key(p)) ?? []), p]);
  return out;
}

/**
 * Planes vigentes del alcance. Los tramos se gobiernan UNA vez para todo el
 * alcance y luego se reparten por grupo: la suma de los grupos de una misma
 * dimensión es exactamente el panorama (alumnos aparte: un alumno con planes
 * en dos grupos cuenta en ambos).
 */
export function currentAnalytics(plans: AnalyticsPlanInput[], today: string, trackingStart?: string): CurrentAnalytics {
  const current = plans.filter((p) => planPhase(p, today) === "CURRENT");
  const { governed, overlap, crossBranchOverlap } = governPlans(current);
  const metricsOf = (list: GovernedPlan[]) => groupMetrics(list, today, trackingStart);
  const map = <K>(m: Map<K, GovernedPlan[]>) => new Map([...m].map(([k, v]) => [k, metricsOf(v)] as const));
  const modality = groupBy(governed, (p) => p.modality);
  return {
    overview: metricsOf(governed),
    overlap,
    crossBranchOverlap,
    byBranch: map(groupBy(governed, (p) => p.branchId)),
    byTrainer: map(groupBy(governed, (p) => p.trainerId ?? NO_TRAINER)),
    byModality: MODALITIES.map((m) => ({ key: m, metrics: metricsOf(modality.get(m) ?? []) })),
  };
}

// ── Evolución (planes activos del período) ───────────────────────

export interface EvolutionBucket {
  bucket: ProgressBucket;
  counts: ComplianceCounts;
  pct: number | null;
  /** Sin registros y anterior al inicio del seguimiento por fecha (regla de GYM-5B). */
  beforeTracking: boolean;
}

export interface Evolution {
  total: ComplianceCounts;
  totalPct: number | null;
  buckets: EvolutionBucket[];
  overlap: boolean;
}

/** Regla de la evolución de GYM-5B: sin registros y el intervalo termina antes del inicio del seguimiento. */
export function bucketBeforeTracking(bucket: ProgressBucket, counts: ComplianceCounts, trackingStart: string | null): boolean {
  return counts.sufficiency === "NO_RECORDS" && (trackingStart === null || bucket.end < trackingStart);
}

export function evolution(
  plans: AnalyticsPlanInput[],
  buckets: ProgressBucket[],
  today: string,
  trackingStart: string | null
): Evolution {
  const windowStart = buckets[0]?.start ?? today;
  const active = plans.filter((p) => p.status === "active" && p.start <= today && p.end >= windowStart);
  const { governed, overlap } = governPlans(active);
  // Criterio de GYM-5B: sin registros en el tenant el corte es mañana.
  const options = { trackingStart: trackingStart ?? addDays(today, 1) };
  const total = complianceInRange(governed, { start: windowStart, end: today }, today, options);
  return {
    total,
    totalPct: displayablePct(total),
    overlap,
    buckets: buckets.map((b) => {
      const counts = complianceInRange(governed, { start: b.start, end: b.end }, today, options);
      return { bucket: b, counts, pct: displayablePct(counts), beforeTracking: bucketBeforeTracking(b, counts, trackingStart) };
    }),
  };
}

// ── Asistencia (GYM-4), solo conteos ─────────────────────────────

export interface AnalyticsAttendanceRef {
  id: string;
  /** attended | late | absent (cancelled no se lee). */
  status: string;
  /** class_date de la sesión ("YYYY-MM-DD", calendario del gimnasio). */
  date: string;
  branchId: string;
  kind: GymSessionKind;
}

export interface AttendanceCounts {
  attended: number;
  late: number;
  absent: number;
  /** attended + late. */
  confirmed: number;
}

export const SESSION_KINDS: readonly GymSessionKind[] = ["OPEN", "PERSONALIZED", "GROUP"];

export interface AttendanceAnalytics {
  total: AttendanceCounts;
  byBranch: Map<string, AttendanceCounts>;
  byKind: { kind: GymSessionKind; counts: AttendanceCounts }[];
  /** Confirmadas por intervalo de la evolución. */
  perBucket: number[];
}

function emptyAttendance(): AttendanceCounts {
  return { attended: 0, late: 0, absent: 0, confirmed: 0 };
}

function addAttendance(c: AttendanceCounts, status: string) {
  if (status === "attended") c.attended++;
  else if (status === "late") c.late++;
  else if (status === "absent") c.absent++;
  else return;
  if (status !== "absent") c.confirmed++;
}

/**
 * Conteos reales de asistencia del período (sin porcentaje: no existe un
 * denominador de clases esperadas). Ids repetidos una vez; fechas futuras y
 * fuera del período se ignoran; cancelled no cuenta.
 */
export function attendanceAnalytics(rows: AnalyticsAttendanceRef[], buckets: ProgressBucket[], today: string): AttendanceAnalytics {
  const windowStart = buckets[0]?.start ?? today;
  const seen = new Set<string>();
  const total = emptyAttendance();
  const byBranch = new Map<string, AttendanceCounts>();
  const byKind = new Map<GymSessionKind, AttendanceCounts>(SESSION_KINDS.map((k) => [k, emptyAttendance()]));
  const perBucket = buckets.map(() => 0);
  for (const r of rows) {
    if (seen.has(r.id) || r.date > today || r.date < windowStart) continue;
    if (r.status !== "attended" && r.status !== "late" && r.status !== "absent") continue;
    seen.add(r.id);
    addAttendance(total, r.status);
    const branch = byBranch.get(r.branchId) ?? emptyAttendance();
    addAttendance(branch, r.status);
    byBranch.set(r.branchId, branch);
    const kind = byKind.get(r.kind) ?? emptyAttendance();
    addAttendance(kind, r.status);
    byKind.set(r.kind, kind);
    if (r.status !== "absent") {
      const i = buckets.findIndex((b) => r.date >= b.start && r.date <= b.end);
      if (i >= 0) perBucket[i]++;
    }
  }
  return { total, byBranch, byKind: SESSION_KINDS.map((k) => ({ kind: k, counts: byKind.get(k) ?? emptyAttendance() })), perBucket };
}

// ── Parámetros del navegador ─────────────────────────────────────

export interface AnalyticsFilters {
  range: ProgressRange;
  /** Sucursal pedida; solo se usa si está entre las autorizadas (la decide el servidor). */
  branch: string | null;
}

type Params = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Lista blanca: `periodo` y `sede`. Ningún otro parámetro (tenant, entrenador, alumno) se lee. */
export function parseAnalyticsFilters(sp: Params): AnalyticsFilters {
  const branch = (first(sp.sede) ?? "").trim();
  return { range: parseProgressRange(first(sp.periodo)), branch: branch === "" || branch.length > 64 ? null : branch };
}

/** La sucursal pedida solo vale si pertenece a las autorizadas; si no, se ignora. */
export function resolveBranchFilter(requested: string | null, authorized: readonly string[]): string | null {
  return requested !== null && authorized.includes(requested) ? requested : null;
}
