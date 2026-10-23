// ─────────────────────────────────────────────────────────────────
// GYM-5B — modelo de lectura de "Mi progreso" (audiencia CLIENT).
//
// El caller ya pasó por openPortalContext (runtime, gym.weekly_plans, rol
// LIVE client, Client desde la sesión + tenant). Este servicio NUNCA recibe
// un client_id del navegador: lo recibe del Client resuelto por la sesión.
//
// Privacidad (select explícito en todas las consultas):
//  - ClassAttendance: solo id, estado y datos públicos de la sesión; nunca
//    notes, training_notes, actividades ni quién registró;
//  - ClientPlanDayExecution: estados, fecha y trainer_feedback (visible para
//    el alumno desde GYM-5A); nunca ids de usuarios, rol, motivos ni bitácora;
//  - ClientWeeklyPlan: sin `notes` (no se muestran al alumno en el portal).
//
// Consultas (sin N+1):
//  - planes que se cruzan con el período (todos, hasta un tope de seguridad)
//    + los PROGRESS_PLANS_LIMIT más recientes para el historial;
//  - ejecuciones de esos planes + inicio del seguimiento del tenant
//    (primera ejecución registrada, convertida a fecha local);
//  - asistencias del período en una consulta liviana (solo id/estado/fecha)
//    y las RECENT_CLASSES_LIMIT últimas asistidas aparte (solo con
//    gym.classes habilitado). Si se alcanza un tope, se avisa en vez de
//    mostrar cifras recortadas en silencio.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { addDays, dateKey, gymToday, type ExecutionRef } from "@/modules/weekly-plans/training-tracking-rules";
import { dateColumn } from "./portal-schedule";
import { getLastExpiredMembership, hasActiveMembership } from "./queries";
import { plansVisibleForMembership } from "./plan-visibility";
import {
  attendanceFrequency,
  attendanceQueryStart,
  complianceInRange,
  governingSegments,
  planPhase,
  progressBuckets,
  upcomingOccurrences,
  type AttendanceFrequency,
  type ComplianceCounts,
  type PlanPhase,
  type ProgressBucket,
  type ProgressPlanInput,
  type ProgressRange,
} from "./progress-rules";

export const PROGRESS_PLANS_LIMIT = 24;
export const RECENT_CLASSES_LIMIT = 8;
export const RECENT_FEEDBACK_LIMIT = 5;
/** Topes de seguridad: muy por encima del uso real (13 meses de planes y clases). */
export const WINDOW_PLANS_CAP = 200;
export const ATTENDANCE_ROWS_CAP = 5000;

export interface ProgressPlanView {
  planId: string;
  name: string;
  trainerName: string | null;
  start: string;
  end: string;
  phase: PlanPhase;
  /** false: plan heredado sin tenant (anterior al seguimiento por fecha); no se calcula. */
  trackable: boolean;
  /** Algún día conserva un estado heredado (anterior a GYM-5A), mostrado sin reinterpretar. */
  hasLegacyRecords: boolean;
  /** Parte de su período la gobierna un plan más reciente (solape heredado): esas fechas cuentan una sola vez en el resumen. */
  overlapped: boolean;
  counts: ComplianceCounts | null;
  upcoming: number;
}

export interface ProgressFeedbackView {
  date: string;
  sessionName: string | null;
  feedback: string;
}

export interface ProgressClassView {
  date: string;
  startTime: string;
  title: string;
  typeName: string | null;
  late: boolean;
}

export interface PortalProgress {
  range: ProgressRange;
  today: string;
  buckets: ProgressBucket[];
  /** null cuando la política de membresía oculta los planes. */
  training: {
    summary: ComplianceCounts;
    perBucket: ComplianceCounts[];
    plans: ProgressPlanView[];
    feedback: ProgressFeedbackView[];
    /** La base runtime aún no tiene las tablas de GYM-5A (P2021): sin cálculo. */
    trackingUnavailable: boolean;
    /** Primer día local con seguimiento en el tenant; null si aún no hay registros. */
    trackingStart: string | null;
    /** Se alcanzó WINDOW_PLANS_CAP: el resumen podría estar incompleto. */
    incomplete: boolean;
  } | null;
  plansHiddenByMembership: { expiredOn: string } | null;
  /** null si gym.classes no está habilitado (no se consultó asistencia). */
  attendance: { frequency: AttendanceFrequency; recent: ProgressClassView[]; incomplete: boolean } | null;
}

/** Política vigente de visibilidad de planes (la misma de /portal/plan-semanal). */
export async function resolvePlansVisibility(db: PrismaClient, clientId: string, today: string) {
  if (await hasActiveMembership(clientId, db, today)) return { visible: true, expiredOn: null };
  const lastExpired = await getLastExpiredMembership(clientId, db, today);
  if (!lastExpired) return { visible: true, expiredOn: null };
  const expiredOn = dateKey(lastExpired.end_date);
  return { visible: plansVisibleForMembership({ hasActiveMembership: false, lastExpiredEnd: expiredOn, today }), expiredOn };
}

function isMissingTable(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2021";
}

export async function loadPortalProgress(input: {
  db: PrismaClient;
  tenantId: string;
  gymId: string | null;
  /** Client resuelto por openPortalContext (nunca del navegador). */
  clientId: string;
  /** Fecha local del gimnasio. */
  today: string;
  /** Zona IANA del gimnasio (para fechar el inicio del seguimiento). */
  timezone: string;
  range: ProgressRange;
  includeClasses: boolean;
}): Promise<PortalProgress> {
  const { db, tenantId, clientId, today, range } = input;
  const buckets = progressBuckets(range, today);
  const visibility = await resolvePlansVisibility(db, clientId, today);

  let training: PortalProgress["training"] = null;
  if (visibility.visible) training = await loadTraining(input, buckets);

  let attendance: PortalProgress["attendance"] = null;
  if (input.includeClasses) {
    const scope = { client_id: clientId, OR: [{ tenant_id: tenantId }, { tenant_id: null }] };
    const [rows, recentRows] = await Promise.all([
      db.classAttendance.findMany({
        where: {
          ...scope,
          attendance_status: { in: ["attended", "late", "absent"] },
          scheduled_class: { class_date: { gte: dateColumn(attendanceQueryStart(buckets, today)), lte: dateColumn(today) } },
        },
        select: { id: true, attendance_status: true, scheduled_class: { select: { class_date: true } } },
        take: ATTENDANCE_ROWS_CAP,
      }),
      db.classAttendance.findMany({
        where: {
          ...scope,
          attendance_status: { in: ["attended", "late"] },
          scheduled_class: { class_date: { lte: dateColumn(today) } },
        },
        select: {
          attendance_status: true,
          scheduled_class: { select: { title: true, class_date: true, start_time: true, class_type: { select: { name: true } } } },
        },
        orderBy: [{ scheduled_class: { class_date: "desc" } }, { scheduled_class: { start_time: "desc" } }],
        take: RECENT_CLASSES_LIMIT,
      }),
    ]);
    const frequency = attendanceFrequency(
      rows.map((r) => ({ id: r.id, date: dateKey(r.scheduled_class.class_date), status: r.attendance_status })),
      buckets,
      today
    );
    const recent = recentRows.map((r) => ({
      date: dateKey(r.scheduled_class.class_date),
      startTime: r.scheduled_class.start_time,
      title: r.scheduled_class.title,
      typeName: r.scheduled_class.class_type?.name ?? null,
      late: r.attendance_status === "late",
    }));
    attendance = { frequency, recent, incomplete: rows.length >= ATTENDANCE_ROWS_CAP };
  }

  return {
    range,
    today,
    buckets,
    training,
    plansHiddenByMembership: visibility.visible || !visibility.expiredOn ? null : { expiredOn: visibility.expiredOn },
    attendance,
  };
}

async function loadTraining(
  input: { db: PrismaClient; tenantId: string; gymId: string | null; clientId: string; today: string; timezone: string },
  buckets: ProgressBucket[]
): Promise<NonNullable<PortalProgress["training"]>> {
  const { db, tenantId, gymId, clientId, today, timezone } = input;
  const ownPlans = {
    client_id: clientId,
    OR: [{ tenant_id: tenantId }, ...(gymId ? [{ tenant_id: null, gym_id: gymId }] : [])],
  };
  const planSelect = {
    id: true,
    tenant_id: true,
    start_date: true,
    end_date: true,
    status: true,
    created_at: true,
    template: { select: { name: true } },
    trainer: { select: { first_name: true, last_name: true } },
    days: { select: { id: true, weekday: true, session_name: true, execution_status: true } },
  } as const;
  // Planes del período: TODOS los que se cruzan con él (el resumen no puede
  // depender del tope del historial). Historial: los más recientes.
  const [windowPlans, recentPlans] = await Promise.all([
    db.clientWeeklyPlan.findMany({
      where: { ...ownPlans, end_date: { gte: dateColumn(buckets[0].start) }, start_date: { lte: dateColumn(today) } },
      select: planSelect,
      orderBy: { start_date: "desc" },
      take: WINDOW_PLANS_CAP,
    }),
    db.clientWeeklyPlan.findMany({ where: ownPlans, select: planSelect, orderBy: { start_date: "desc" }, take: PROGRESS_PLANS_LIMIT }),
  ]);
  // Precedencia (también orden del historial): inicio desc, creación desc, id desc.
  const plans = [...new Map([...windowPlans, ...recentPlans].map((p) => [p.id, p])).values()].sort(
    (a, b) =>
      b.start_date.getTime() - a.start_date.getTime() ||
      b.created_at.getTime() - a.created_at.getTime() ||
      (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );

  // Solo planes con tenant pueden tener ejecuciones por fecha (FK compuesta de GYM-5A).
  const trackableIds = plans.filter((p) => p.tenant_id === tenantId).map((p) => p.id);
  let trackingUnavailable = false;
  let trackingStart: string | null = null;
  let executions: {
    plan_id: string;
    plan_day_id: string;
    local_date: Date;
    client_status: ExecutionRef["client_status"];
    trainer_status: ExecutionRef["trainer_status"];
    trainer_feedback: string | null;
  }[] = [];
  if (trackableIds.length > 0) {
    try {
      const [rows, first] = await Promise.all([
        db.clientPlanDayExecution.findMany({
          where: { tenant_id: tenantId, client_id: clientId, plan_id: { in: trackableIds } },
          select: { plan_id: true, plan_day_id: true, local_date: true, client_status: true, trainer_status: true, trainer_feedback: true },
        }),
        // Inicio del seguimiento: primera ejecución registrada en el tenant
        // (solo una fecha agregada; ningún dato de otros alumnos).
        db.clientPlanDayExecution.aggregate({ where: { tenant_id: tenantId }, _min: { created_at: true } }),
      ]);
      executions = rows;
      trackingStart = first._min.created_at ? gymToday(timezone, first._min.created_at) : null;
    } catch (err) {
      if (!isMissingTable(err)) throw err;
      trackingUnavailable = true;
    }
  }

  const byPlan = new Map<string, ExecutionRef[]>();
  for (const e of executions) {
    const list = byPlan.get(e.plan_id) ?? [];
    list.push({ plan_day_id: e.plan_day_id, local_date: dateKey(e.local_date), client_status: e.client_status, trainer_status: e.trainer_status });
    byPlan.set(e.plan_id, list);
  }

  // Sin registros en el tenant el seguimiento aún no empezó: el corte es
  // mañana y nada vencido cuenta sin registro.
  const options = { trackingStart: trackingStart ?? addDays(today, 1) };
  // Solo planes activos (no desactivados por el gimnasio) suman a los
  // indicadores generales; entre ellos, cada fecha la gobierna un único plan.
  const governed = plans.filter((p) => p.tenant_id === tenantId && !trackingUnavailable && p.status === "active");
  const segments = governingSegments(governed.map((p) => ({ id: p.id, start: dateKey(p.start_date), end: dateKey(p.end_date) })));

  const views: ProgressPlanView[] = [];
  const aggregate: ProgressPlanInput[] = [];
  for (const p of plans) {
    const start = dateKey(p.start_date);
    const end = dateKey(p.end_date);
    const phase = planPhase({ start, end, status: p.status }, today);
    const trackable = p.tenant_id === tenantId && !trackingUnavailable;
    const planInput: ProgressPlanInput = {
      id: p.id,
      start,
      end,
      days: p.days.map((d) => ({ id: d.id, weekday: d.weekday })),
      executions: byPlan.get(p.id) ?? [],
    };
    const own = segments.get(p.id);
    if (own) aggregate.push({ ...planInput, segments: own });
    views.push({
      planId: p.id,
      name: p.template?.name ?? "Plan personalizado",
      trainerName: p.trainer ? `${p.trainer.first_name} ${p.trainer.last_name}` : null,
      start,
      end,
      phase,
      trackable,
      hasLegacyRecords: p.days.some((d) => d.execution_status !== "pending"),
      overlapped: own !== undefined && !(own.length === 1 && own[0].start === start && own[0].end === end),
      counts: trackable ? complianceInRange([planInput], { start, end }, today, options) : null,
      upcoming: upcomingOccurrences(planInput, today),
    });
  }

  const windowRange = { start: buckets[0].start, end: today };
  const sessionNames = new Map(plans.flatMap((p) => p.days.map((d) => [d.id, d.session_name] as const)));
  const feedback = executions
    .filter((e) => e.trainer_feedback && e.trainer_feedback.trim() !== "")
    .sort((a, b) => b.local_date.getTime() - a.local_date.getTime())
    .slice(0, RECENT_FEEDBACK_LIMIT)
    .map((e) => ({ date: dateKey(e.local_date), sessionName: sessionNames.get(e.plan_day_id) ?? null, feedback: e.trainer_feedback as string }));

  return {
    summary: complianceInRange(aggregate, windowRange, today, options),
    perBucket: buckets.map((b) => complianceInRange(aggregate, { start: b.start, end: b.end }, today, options)),
    plans: views,
    feedback,
    trackingUnavailable,
    trackingStart,
    incomplete: windowPlans.length >= WINDOW_PLANS_CAP,
  };
}

/** Objetivo deportivo configurado (catálogo cualitativo; sin metas numéricas). */
export async function loadProgressGoal(
  db: PrismaClient,
  client: { goal: { id: string; name: string } | null; sport: { id: string; name: string } | null }
) {
  if (!client.goal && !client.sport) return null;
  const goal = client.goal
    ? await db.goal.findUnique({ where: { id: client.goal.id }, select: { name: true, description: true } })
    : null;
  return { goalName: goal?.name ?? null, goalDescription: goal?.description ?? null, sportName: client.sport?.name ?? null };
}
