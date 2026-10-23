// ─────────────────────────────────────────────────────────────────
// GYM-5B — reglas PURAS de "Mi progreso" del alumno.
//
// No hay una segunda fórmula: el cumplimiento de cualquier intervalo se
// obtiene llamando a summarizeCompliance (GYM-5A) con el período del plan
// recortado al intervalo, y varios planes/intervalos se agregan SUMANDO
// conteos y aplicando compliancePct (nunca promediando porcentajes).
//
// Contrato de datos:
//  - PROGRAMADO = ocurrencia (weekday del plan) con fecha local ≤ hoy dentro
//    del período del plan y del intervalo consultado. Las futuras no entran
//    en el denominador.
//  - EJECUCIÓN = ClientPlanDayExecution; estado efectivo del entrenador sobre
//    el autorreporte (autorreporte sin entrenador = no verificado).
//  - ASISTENCIA = ClassAttendance attended|late, una por (sesión, alumno);
//    nunca se suma a las ejecuciones ni las ejecuciones a la asistencia.
//  - "Sin datos suficientes": no hay programados vencidos, o los hay pero
//    ninguno tiene registro efectivo. En ese caso NO se muestra porcentaje.
//  - INICIO DEL SEGUIMIENTO: primera ejecución registrada en el tenant. El
//    denominador NO cambia (es el de GYM-5A: todas las ocurrencias vencidas);
//    los pendientes anteriores a esa fecha solo se IDENTIFICAN aparte
//    (pendingBeforeTracking), sin otro porcentaje.
//  - PLANES SOLAPADOS (heredados, anteriores al lock de GYM-5A): en los
//    indicadores generales cada fecha cuenta una sola vez, gobernada por el
//    plan más reciente (inicio mayor, luego creación mayor).
//
// Fechas: cadenas calendario "YYYY-MM-DD" en la zona del gimnasio
// (GymSettings.timezone); semanas de lunes a domingo; meses calendario.
// ─────────────────────────────────────────────────────────────────

import {
  addDays,
  compliancePct,
  summarizeCompliance,
  type ExecutionRef,
  type PlanDayRef,
} from "@/modules/weekly-plans/training-tracking-rules";
import { weekStart } from "./portal-schedule";

// ── Períodos de consulta ─────────────────────────────────────────

export const PROGRESS_RANGES = {
  semanas: { label: "8 semanas", granularity: "week", buckets: 8 },
  meses: { label: "6 meses", granularity: "month", buckets: 6 },
  anio: { label: "12 meses", granularity: "month", buckets: 12 },
} as const;

export type ProgressRange = keyof typeof PROGRESS_RANGES;
export const DEFAULT_PROGRESS_RANGE: ProgressRange = "semanas";

/** Lista blanca: cualquier otro valor del navegador cae en el período por defecto. */
export function parseProgressRange(value: unknown): ProgressRange {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PROGRESS_RANGES, value)
    ? (value as ProgressRange)
    : DEFAULT_PROGRESS_RANGE;
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(firstOfMonth: string, months: number): string {
  const y = Number(firstOfMonth.slice(0, 4));
  const m = Number(firstOfMonth.slice(5, 7)) - 1 + months;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12;
  return `${String(ny).padStart(4, "0")}-${String(nm + 1).padStart(2, "0")}-01`;
}

export interface ProgressBucket {
  /** Inicio del intervalo (lunes o día 1). */
  start: string;
  /** Fin calendario del intervalo (puede ser posterior a hoy en el intervalo actual). */
  end: string;
  granularity: "week" | "month";
  isCurrent: boolean;
}

/** Intervalos del período, del más antiguo al actual (que contiene `today`). */
export function progressBuckets(range: ProgressRange, today: string): ProgressBucket[] {
  const cfg = PROGRESS_RANGES[range];
  const out: ProgressBucket[] = [];
  if (cfg.granularity === "week") {
    const current = weekStart(today);
    for (let i = cfg.buckets - 1; i >= 0; i--) {
      const start = addDays(current, -7 * i);
      out.push({ start, end: addDays(start, 6), granularity: "week", isCurrent: i === 0 });
    }
  } else {
    const current = monthStart(today);
    for (let i = cfg.buckets - 1; i >= 0; i--) {
      const start = addMonths(current, -i);
      out.push({ start, end: addDays(addMonths(start, 1), -1), granularity: "month", isCurrent: i === 0 });
    }
  }
  return out;
}

// ── Cumplimiento por intervalo ───────────────────────────────────

export interface DateSegment {
  start: string;
  end: string;
}

export interface ProgressPlanInput {
  id: string;
  start: string;
  end: string;
  days: PlanDayRef[];
  executions: ExecutionRef[];
  /** Tramos del período que cuentan (por defecto, el período completo). Ver governingSegments. */
  segments?: DateSegment[];
}

export type Sufficiency = "NONE_SCHEDULED" | "NO_RECORDS" | "OK";

export interface ComplianceCounts {
  scheduled: number;
  completed: number;
  partial: number;
  skipped: number;
  pending: number;
  selfReportedOnly: number;
  /**
   * De los `pending`, cuántos son anteriores al inicio del seguimiento (no se
   * podían registrar). Informativo: siguen en el denominador, como en GYM-5A.
   */
  pendingBeforeTracking: number;
  /** Fórmula de GYM-5A sobre los conteos sumados; null si no hay programados vencidos. */
  compliancePct: number | null;
  sufficiency: Sufficiency;
}

export function emptyCounts(): ComplianceCounts {
  return { scheduled: 0, completed: 0, partial: 0, skipped: 0, pending: 0, selfReportedOnly: 0, pendingBeforeTracking: 0, compliancePct: null, sufficiency: "NONE_SCHEDULED" };
}

/** Porcentaje que se puede mostrar: solo con datos suficientes. */
export function displayablePct(c: ComplianceCounts): number | null {
  return c.sufficiency === "OK" ? c.compliancePct : null;
}

export interface ComplianceOptions {
  /**
   * Primer día con seguimiento por fecha (local). Solo sirve para identificar
   * los pendientes anteriores (pendingBeforeTracking); no altera los conteos.
   * undefined = sin identificación.
   */
  trackingStart?: string;
}

function addSummary(total: ComplianceCounts, s: ReturnType<typeof summarizeCompliance>) {
  total.scheduled += s.scheduled;
  total.completed += s.completed;
  total.partial += s.partial;
  total.skipped += s.skipped;
  total.pending += s.pending;
  total.selfReportedOnly += s.selfReportedOnly;
}

/**
 * Cumplimiento de uno o varios planes dentro de [range.start, range.end]:
 * cada plan conserva su propio período (o sus tramos gobernados, recortados
 * al intervalo) y sus propias ejecuciones; luego se suman los conteos.
 */
export function complianceInRange(
  plans: ProgressPlanInput[],
  range: DateSegment,
  today: string,
  options: ComplianceOptions = {}
): ComplianceCounts {
  const total = emptyCounts();
  const { trackingStart } = options;
  for (const p of plans) {
    for (const seg of p.segments ?? [{ start: p.start, end: p.end }]) {
      const start = seg.start > range.start ? seg.start : range.start;
      const end = seg.end < range.end ? seg.end : range.end;
      if (start > end || start > today) continue;
      addSummary(total, summarizeCompliance(p.days, { start, end }, today, p.executions));
      if (trackingStart && start < trackingStart) {
        const preEnd = addDays(trackingStart, -1) < end ? addDays(trackingStart, -1) : end;
        total.pendingBeforeTracking += summarizeCompliance(p.days, { start, end: preEnd }, today, p.executions).pending;
      }
    }
  }
  total.compliancePct = compliancePct(total);
  const recorded = total.completed + total.partial + total.skipped;
  total.sufficiency = total.scheduled === 0 ? "NONE_SCHEDULED" : recorded === 0 ? "NO_RECORDS" : "OK";
  return total;
}

// ── Planes solapados ─────────────────────────────────────────────

/**
 * Reparte las fechas entre planes que se solapan (solo posible en planes
 * heredados, anteriores al lock de GYM-5A): cada fecha la gobierna el plan
 * de mayor precedencia. `plans` debe venir ordenado de mayor a menor
 * precedencia. Devuelve, por plan, los tramos de su período que le quedan.
 */
export function governingSegments(plans: { id: string; start: string; end: string }[]): Map<string, DateSegment[]> {
  const claimed: DateSegment[] = [];
  const out = new Map<string, DateSegment[]>();
  for (const p of plans) {
    let free: DateSegment[] = p.start <= p.end ? [{ start: p.start, end: p.end }] : [];
    for (const c of claimed) {
      free = free.flatMap((f) => {
        if (c.end < f.start || c.start > f.end) return [f];
        const parts: DateSegment[] = [];
        if (c.start > f.start) parts.push({ start: f.start, end: addDays(c.start, -1) });
        if (c.end < f.end) parts.push({ start: addDays(c.end, 1), end: f.end });
        return parts;
      });
    }
    out.set(p.id, free);
    if (p.start <= p.end) claimed.push({ start: p.start, end: p.end });
  }
  return out;
}

// ── Estado de cada plan en el historial ──────────────────────────

export type PlanPhase = "CURRENT" | "UPCOMING" | "FINISHED" | "INACTIVE";

export function planPhase(p: { start: string; end: string; status: string }, today: string): PlanPhase {
  if (p.status !== "active") return "INACTIVE";
  if (p.start > today) return "UPCOMING";
  if (p.end < today) return "FINISHED";
  return "CURRENT";
}

/** Ocurrencias aún no vencidas del plan (informativas; no entran en el cumplimiento). */
export function upcomingOccurrences(p: ProgressPlanInput, today: string): number {
  return summarizeCompliance(p.days, { start: p.start, end: p.end }, today, []).upcoming;
}

// ── Asistencia confirmada a clases (GYM-4) ───────────────────────

export const CONFIRMED_ATTENDANCE = ["attended", "late"] as const;

export interface AttendanceRef {
  id: string;
  /** class_date de la sesión ("YYYY-MM-DD", calendario del gimnasio). */
  date: string;
  status: string;
}

export interface AttendanceBucket {
  start: string;
  confirmed: number;
  late: number;
}

export interface AttendanceFrequency {
  /** attended + late en el período (una por sesión). */
  confirmed: number;
  /** De las confirmadas, cuántas fueron tardías. */
  late: number;
  /** Ausencias registradas (absent): informativas, no son un denominador. */
  absent: number;
  thisWeek: number;
  thisMonth: number;
  /** Semanas calendario (lun–dom) del período hasta hoy, incluida la actual. */
  weeks: number;
  /** confirmed ÷ weeks con un decimal; null sin asistencias (no se muestra "0 por semana"). */
  weeklyAverage: number | null;
  perBucket: AttendanceBucket[];
}

function isConfirmed(status: string): boolean {
  return (CONFIRMED_ATTENDANCE as readonly string[]).includes(status);
}

/**
 * Frecuencia de asistencia confirmada. Sin denominador de "clases esperadas":
 * el sistema no registra cuántas clases debía tomar el alumno, por lo que se
 * informan CONTEOS, nunca un porcentaje. Días sin sesiones y sesiones sin
 * reserva no suman ni restan; las ausencias se cuentan aparte; cancelled no
 * cuenta; fechas futuras se ignoran; ids repetidos se cuentan una vez.
 */
export function attendanceFrequency(
  rows: AttendanceRef[],
  buckets: ProgressBucket[],
  today: string
): AttendanceFrequency {
  const windowStart = buckets[0]?.start ?? today;
  const seen = new Set<string>();
  const thisWeekStart = weekStart(today);
  const thisMonthStart = monthStart(today);
  const f: AttendanceFrequency = {
    confirmed: 0,
    late: 0,
    absent: 0,
    thisWeek: 0,
    thisMonth: 0,
    weeks: 0,
    weeklyAverage: null,
    perBucket: buckets.map((b) => ({ start: b.start, confirmed: 0, late: 0 })),
  };
  for (const r of rows) {
    if (seen.has(r.id) || r.date > today) continue;
    seen.add(r.id);
    const confirmed = isConfirmed(r.status);
    if (confirmed && r.date >= thisWeekStart) f.thisWeek++;
    if (confirmed && r.date >= thisMonthStart) f.thisMonth++;
    if (r.date < windowStart) continue;
    if (r.status === "absent") {
      f.absent++;
      continue;
    }
    if (!confirmed) continue;
    f.confirmed++;
    if (r.status === "late") f.late++;
    const i = buckets.findIndex((b) => r.date >= b.start && r.date <= b.end);
    if (i >= 0) {
      f.perBucket[i].confirmed++;
      if (r.status === "late") f.perBucket[i].late++;
    }
  }
  f.weeks = Math.round((Date.parse(`${thisWeekStart}T00:00:00Z`) - Date.parse(`${weekStart(windowStart)}T00:00:00Z`)) / (7 * 86_400_000)) + 1;
  f.weeklyAverage = f.confirmed > 0 ? Math.round((10 * f.confirmed) / f.weeks) / 10 : null;
  return f;
}

/** Desde qué fecha hay que leer asistencias para cubrir el período y "este mes". */
export function attendanceQueryStart(buckets: ProgressBucket[], today: string): string {
  const windowStart = buckets[0]?.start ?? today;
  const m = monthStart(today);
  const w = weekStart(today);
  return [windowStart, m, w].sort()[0];
}
