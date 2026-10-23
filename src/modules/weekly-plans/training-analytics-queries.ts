// ─────────────────────────────────────────────────────────────────
// GYM-5D — modelo de lectura de "Analítica de entrenamiento" (gerencial).
//
// Autorización (resolveTrainingAnalyticsAccess, ANTES de leer datos):
//  - rol LIVE (resolveLiveClassViewer; sede LIVE en RUNTIME_CLIENT) y
//    identidad vigente en la base efectiva (assertLiveIdentity, LIVE-3:
//    también en PLATFORM_NATIVE, donde el JWT no se revalida);
//  - solo super_admin (todas las sucursales del tenant efectivo) y
//    branch_admin (únicamente su sede vigente). Recepción, entrenador y
//    alumno: aviso y cero datos. Ningún parámetro del navegador amplía el
//    alcance: `sede` solo filtra DENTRO de las sucursales autorizadas.
// Módulos: gym.weekly_plans lo exige la página; gym.classes es opcional y,
// apagado, no se consulta class_attendance.
//
// Privacidad (select explícito): ni nombres ni datos de contacto de alumnos
// (solo ids para contar), ni ClientWeeklyPlan.notes, comentarios,
// retroalimentación, quién registró, motivos, bitácora, training_notes,
// notas de asistencia ni actividades.
//
// Consultas (sin N+1): sucursales; planes activos del período (paginados por
// id); ejecuciones de esos planes en lote + inicio del seguimiento del
// tenant; entrenadores de esos planes en lote; con gym.classes, asistencias
// del período en lote. Si una lectura supera su máximo, el bloque se marca
// incompleto y la UI muestra "Datos incompletos" EN LUGAR de cifras.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/permissions/guards";
import { resolveLiveClassViewer } from "@/modules/classes/trainer/trainer-access";
import { dateColumn } from "@/modules/client-portal/portal-schedule";
import { progressBuckets, type ProgressBucket, type ProgressRange } from "@/modules/client-portal/progress-rules";
import type { RuntimeMode } from "@/modules/platform/runtime/effective-tenant-context";
import { assertLiveIdentity, LIVE_IDENTITY_CHANGED_MESSAGE } from "@/modules/platform/runtime/require-live-operational-context";
import { addDays, dateKey, gymToday, type ExecutionRef } from "./training-tracking-rules";
import {
  attendanceAnalytics,
  currentAnalytics,
  evolution,
  type AnalyticsPlanInput,
  type AttendanceAnalytics,
  type CurrentAnalytics,
  type Evolution,
} from "./training-analytics-rules";

export const ANALYTICS_ONLY_ADMINS_MESSAGE =
  "La analítica de entrenamiento es exclusiva de la administración del gimnasio (super administrador y administrador de sucursal).";

export interface AnalyticsBranch {
  id: string;
  name: string;
  active: boolean;
}

export type TrainingAnalyticsAccess =
  | { ok: true; role: "super_admin" | "branch_admin"; branches: AnalyticsBranch[] }
  | { ok: false; message: string; kind: "IDENTITY" | "NOT_ADMIN" };

type AnalyticsContext = {
  tenantId: string;
  client?: PrismaClient;
  locationId: string | null;
  runtimeMode: RuntimeMode;
  effectiveRole: string;
  readOnly: boolean;
};

/** Rol LIVE super_admin / branch_admin con identidad vigente; devuelve las sucursales autorizadas. */
export async function resolveTrainingAnalyticsAccess(sessionUser: SessionUser, context: AnalyticsContext): Promise<TrainingAnalyticsAccess> {
  const live = await resolveLiveClassViewer(sessionUser, context);
  if (!live.ok) return { ok: false, message: live.message, kind: "IDENTITY" };
  const role = live.user.role;
  if (role !== "super_admin" && role !== "branch_admin") return { ok: false, message: ANALYTICS_ONLY_ADMINS_MESSAGE, kind: "NOT_ADMIN" };

  const db = context.client ?? prisma;
  const denied = await assertLiveIdentity({
    effectiveUser: { id: sessionUser.id, role, tenant_id: context.tenantId, location_id: live.user.location_id, auth_scope: sessionUser.auth_scope },
    tenantId: context.tenantId,
    locationId: live.user.location_id,
    client: db,
    readOnly: context.readOnly,
  });
  if (denied) return { ok: false, message: denied, kind: "IDENTITY" };

  if (role === "branch_admin") {
    if (!live.user.location_id) return { ok: false, message: LIVE_IDENTITY_CHANGED_MESSAGE, kind: "IDENTITY" };
    const branch = await db.branch.findFirst({
      where: { id: live.user.location_id, tenant_id: context.tenantId, status: "active" },
      select: { id: true, name: true },
    });
    if (!branch) return { ok: false, message: LIVE_IDENTITY_CHANGED_MESSAGE, kind: "IDENTITY" };
    return { ok: true, role, branches: [{ ...branch, active: true }] };
  }
  const branches = await db.branch.findMany({
    where: { tenant_id: context.tenantId },
    select: { id: true, name: true, status: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return { ok: true, role, branches: branches.map((b) => ({ id: b.id, name: b.name, active: b.status === "active" })) };
}

/** Paginación controlada (por id). Mutable solo para pruebas. */
export const ANALYTICS_QUERY_LIMITS = { pageSize: 1000, maxPlans: 5000, maxExecutions: 200_000, maxAttendance: 100_000 };

async function readAllPaged<T extends { id: string }>(
  page: (args: { take: number; cursor?: { id: string }; skip?: number }) => Promise<T[]>,
  max: number
): Promise<{ rows: T[]; complete: boolean }> {
  const rows: T[] = [];
  let cursor: string | undefined;
  for (;;) {
    const take = Math.min(ANALYTICS_QUERY_LIMITS.pageSize, max + 1 - rows.length);
    const batch = await page({ take, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    rows.push(...batch);
    if (rows.length > max) return { rows: rows.slice(0, max), complete: false };
    if (batch.length < take) return { rows, complete: true };
    cursor = batch[batch.length - 1].id;
  }
}

function isMissingTable(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2021";
}

export interface AnalyticsTrainer {
  name: string;
  active: boolean;
}

export interface TrainingAnalytics {
  today: string;
  range: ProgressRange;
  buckets: ProgressBucket[];
  /** Sucursales de la consulta (todas las autorizadas, o la filtrada). */
  branches: AnalyticsBranch[];
  /** Planes y conteos de planes/alumnos; null si hay más planes que el máximo legible. */
  current: CurrentAnalytics | null;
  evolution: Evolution | null;
  /** Hay cifras de cumplimiento (planes y ejecuciones completos y la tabla de 5A existe). */
  compliance: boolean;
  /** Más planes o ejecuciones que el máximo legible. */
  incomplete: boolean;
  /** La base runtime aún no tiene las tablas de GYM-5A (P2021). */
  trackingUnavailable: boolean;
  /** Primer día local con seguimiento por fecha en el tenant; null si aún no hay registros. */
  trackingStart: string | null;
  trainers: Map<string, AnalyticsTrainer>;
  /** null si gym.classes no está habilitado (no se consultó asistencia). */
  attendance: { data: AttendanceAnalytics | null; incomplete: boolean } | null;
}

export async function loadTrainingAnalytics(
  db: PrismaClient,
  input: {
    tenantId: string;
    /** Sucursales autorizadas de la consulta (nunca del navegador sin validar). */
    branches: AnalyticsBranch[];
    /** true = todas las sucursales del tenant (super_admin sin filtro). */
    wholeTenant: boolean;
    today: string;
    timezone: string;
    range: ProgressRange;
    includeClasses: boolean;
  }
): Promise<TrainingAnalytics> {
  const { tenantId, today } = input;
  const buckets = progressBuckets(input.range, today);
  const windowStart = buckets[0].start;
  const branchFilter = input.wholeTenant ? {} : { branch_id: { in: input.branches.map((b) => b.id) } };

  // Planes activos que se cruzan con el período (incluye todos los vigentes).
  const plansRead = await readAllPaged(
    (page) =>
      db.clientWeeklyPlan.findMany({
        where: {
          tenant_id: tenantId,
          ...branchFilter,
          status: "active",
          start_date: { lte: dateColumn(today) },
          end_date: { gte: dateColumn(windowStart) },
        },
        select: {
          id: true,
          client_id: true,
          branch_id: true,
          trainer_id: true,
          start_date: true,
          end_date: true,
          status: true,
          created_at: true,
          client: { select: { modality: true } },
          days: { select: { id: true, weekday: true } },
        },
        orderBy: { id: "asc" },
        ...page,
      }),
    ANALYTICS_QUERY_LIMITS.maxPlans
  );
  const planIds = plansRead.rows.map((p) => p.id);

  let trackingUnavailable = false;
  let executionsComplete = true;
  let trackingStart: string | null = null;
  const byPlan = new Map<string, ExecutionRef[]>();
  if (plansRead.complete && planIds.length > 0) {
    try {
      const [read, first] = await Promise.all([
        readAllPaged(
          (page) =>
            db.clientPlanDayExecution.findMany({
              where: { tenant_id: tenantId, plan_id: { in: planIds } },
              select: { id: true, plan_id: true, plan_day_id: true, local_date: true, client_status: true, trainer_status: true },
              orderBy: { id: "asc" },
              ...page,
            }),
          ANALYTICS_QUERY_LIMITS.maxExecutions
        ),
        // Inicio del seguimiento (criterio de GYM-5B): primera ejecución del tenant, solo una fecha.
        db.clientPlanDayExecution.aggregate({ where: { tenant_id: tenantId }, _min: { created_at: true } }),
      ]);
      executionsComplete = read.complete;
      trackingStart = first._min.created_at ? gymToday(input.timezone, first._min.created_at) : null;
      for (const e of read.rows) {
        const list = byPlan.get(e.plan_id) ?? [];
        list.push({ plan_day_id: e.plan_day_id, local_date: dateKey(e.local_date), client_status: e.client_status, trainer_status: e.trainer_status });
        byPlan.set(e.plan_id, list);
      }
    } catch (err) {
      if (!isMissingTable(err)) throw err;
      trackingUnavailable = true;
    }
  }

  const plans: AnalyticsPlanInput[] = plansRead.rows.map((p) => ({
    id: p.id,
    clientId: p.client_id,
    branchId: p.branch_id,
    trainerId: p.trainer_id,
    modality: p.client.modality,
    start: dateKey(p.start_date),
    end: dateKey(p.end_date),
    status: p.status,
    createdAt: p.created_at.getTime(),
    days: p.days,
    executions: byPlan.get(p.id) ?? [],
  }));

  // Entrenadores de los planes, en lote (solo nombre y estado).
  const trainerIds = [...new Set(plans.map((p) => p.trainerId).filter((t): t is string => t !== null))];
  const trainerRows =
    plansRead.complete && trainerIds.length > 0
      ? await db.trainer.findMany({
          where: { tenant_id: tenantId, id: { in: trainerIds } },
          select: { id: true, first_name: true, last_name: true, status: true },
        })
      : [];
  const trainers = new Map(trainerRows.map((t) => [t.id, { name: `${t.last_name}, ${t.first_name}`, active: t.status === "active" }]));

  // Asistencia GYM-4 del período: solo con gym.classes; solo id/estado/fecha/sede/tipo.
  let attendance: TrainingAnalytics["attendance"] = null;
  if (input.includeClasses) {
    const read = await readAllPaged(
      (page) =>
        db.classAttendance.findMany({
          where: {
            tenant_id: tenantId,
            attendance_status: { in: ["attended", "late", "absent"] },
            scheduled_class: { tenant_id: tenantId, ...branchFilter, class_date: { gte: dateColumn(windowStart), lte: dateColumn(today) } },
          },
          select: { id: true, attendance_status: true, scheduled_class: { select: { class_date: true, branch_id: true, session_kind: true } } },
          orderBy: { id: "asc" },
          ...page,
        }),
      ANALYTICS_QUERY_LIMITS.maxAttendance
    );
    attendance = {
      incomplete: !read.complete,
      data: read.complete
        ? attendanceAnalytics(
            read.rows.map((r) => ({
              id: r.id,
              status: r.attendance_status,
              date: dateKey(r.scheduled_class.class_date),
              branchId: r.scheduled_class.branch_id,
              kind: r.scheduled_class.session_kind,
            })),
            buckets,
            today
          )
        : null,
    };
  }

  const incomplete = !plansRead.complete || !executionsComplete;
  const compliance = !incomplete && !trackingUnavailable;
  // Criterio de GYM-5B: sin registros en el tenant el corte es mañana (pendientes previos solo se identifican).
  const cut = trackingStart ?? addDays(today, 1);
  return {
    today,
    range: input.range,
    buckets,
    branches: input.branches,
    current: plansRead.complete ? currentAnalytics(plans, today, cut) : null,
    evolution: compliance ? evolution(plans, buckets, today, trackingStart) : null,
    compliance,
    incomplete,
    trackingUnavailable,
    trackingStart,
    trainers,
    attendance,
  };
}
