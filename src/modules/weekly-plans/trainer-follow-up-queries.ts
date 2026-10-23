// ─────────────────────────────────────────────────────────────────
// GYM-5C — modelo de lectura del panel "Seguimiento de mis alumnos".
//
// Autorización (la hace resolveTrainerFollowUpAccess ANTES de leer datos):
//  - módulo gym.weekly_plans (lo exige la página con requireOrganizationModule);
//  - rol LIVE (resolveLiveClassViewer) = "trainer"; ningún otro rol obtiene el
//    panel (administración conserva sus vistas actuales);
//  - perfil Trainer ACTIVO vinculado al usuario en el tenant efectivo
//    (resolveLinkedTrainer), leído en la base runtime (context.client).
// Alcance de datos = el mismo predicado que authorizePlan aplica al rol
// trainer: tenant_id del contexto, trainer_id = perfil vinculado y
// branch_id = sede del perfil. Client.assigned_trainer_id, las clases
// impartidas o compartir sede NO dan acceso. Ningún id del navegador entra
// en las consultas.
//
// Privacidad (select explícito): nunca ClientWeeklyPlan.notes, comentarios
// del alumno, retroalimentación, ids/rol de quien registró, motivos de
// corrección, bitácora, training_notes ni notas o actividades de clases.
//
// Consultas (sin N+1, sin loadPlanTracking por alumno):
//  1. planes del entrenador (paginados por id hasta un máximo);
//  2. ejecuciones de esos planes en lote (solo estados y fecha);
//  3. con gym.classes: asistencias confirmadas de esos alumnos en lote
//     (solo id, alumno y fecha de la sesión).
// Si una lectura supera su máximo, el bloque se marca incompleto y la UI
// muestra "Datos incompletos" EN LUGAR de cifras.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions/guards";
import { resolveLinkedTrainer, resolveLiveClassViewer, TRAINER_PROFILE_MISSING_MESSAGE, type LinkedTrainer } from "@/modules/classes/trainer/trainer-access";
import type { RuntimeMode } from "@/modules/platform/runtime/effective-tenant-context";
import { planPhase } from "@/modules/client-portal/progress-rules";
import { dateKey } from "./training-tracking-rules";
import {
  attendanceByPlan,
  buildFollowUpRow,
  summarizeFollowUp,
  type FollowUpPlanInput,
  type FollowUpRow,
  type FollowUpSummary,
} from "./trainer-follow-up-rules";

export const FOLLOW_UP_ONLY_TRAINERS_MESSAGE =
  "Este panel es exclusivo para entrenadores. Consulta los planes desde «Planes semanales».";

export type TrainerFollowUpAccess = { ok: true; trainer: LinkedTrainer } | { ok: false; message: string; kind: "IDENTITY" | "NOT_TRAINER" | "NO_PROFILE" };

/** Rol LIVE trainer + perfil activo vinculado en el tenant efectivo. Sin esto: aviso y cero datos. */
export async function resolveTrainerFollowUpAccess(
  sessionUser: SessionUser,
  context: { tenantId: string; client?: PrismaClient; locationId: string | null; runtimeMode: RuntimeMode; effectiveRole: string }
): Promise<TrainerFollowUpAccess> {
  const live = await resolveLiveClassViewer(sessionUser, context);
  if (!live.ok) return { ok: false, message: live.message, kind: "IDENTITY" };
  if (live.user.role !== "trainer") return { ok: false, message: FOLLOW_UP_ONLY_TRAINERS_MESSAGE, kind: "NOT_TRAINER" };
  const trainer = await resolveLinkedTrainer(context.client, sessionUser.id, context.tenantId);
  if (!trainer) return { ok: false, message: TRAINER_PROFILE_MISSING_MESSAGE, kind: "NO_PROFILE" };
  return { ok: true, trainer };
}

/** Paginación controlada (por id). Mutable solo para pruebas. */
export const FOLLOW_UP_QUERY_LIMITS = { pageSize: 1000, maxPlans: 2000, maxExecutions: 100_000, maxAttendance: 50_000 };

async function readAllPaged<T extends { id: string }>(
  page: (args: { take: number; cursor?: { id: string }; skip?: number }) => Promise<T[]>,
  max: number
): Promise<{ rows: T[]; complete: boolean }> {
  const rows: T[] = [];
  let cursor: string | undefined;
  for (;;) {
    const take = Math.min(FOLLOW_UP_QUERY_LIMITS.pageSize, max + 1 - rows.length);
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

export interface TrainerFollowUp {
  today: string;
  rows: FollowUpRow[];
  /** null si no hay métricas (datos incompletos o seguimiento no disponible). */
  summary: FollowUpSummary | null;
  /** Más planes o ejecuciones que el máximo legible: no se muestran cifras. */
  incomplete: boolean;
  /** La base runtime aún no tiene las tablas de GYM-5A (P2021). */
  trackingUnavailable: boolean;
  /** null si gym.classes no está habilitado (no se consultó asistencia). */
  attendance: { currentPlans: number; incomplete: boolean } | null;
}

export async function loadTrainerFollowUp(
  db: PrismaClient,
  input: { tenantId: string; trainer: Pick<LinkedTrainer, "id" | "branch_id">; today: string; includeClasses: boolean }
): Promise<TrainerFollowUp> {
  const { tenantId, trainer, today } = input;
  const plansRead = await readAllPaged(
    (page) =>
      db.clientWeeklyPlan.findMany({
        where: { tenant_id: tenantId, trainer_id: trainer.id, branch_id: trainer.branch_id, status: { not: "deleted" } },
        select: {
          id: true,
          client_id: true,
          start_date: true,
          end_date: true,
          status: true,
          created_at: true,
          template: { select: { name: true } },
          branch: { select: { name: true } },
          client: { select: { first_name: true, last_name: true } },
          days: { select: { id: true, weekday: true, session_name: true } },
        },
        orderBy: { id: "asc" },
        ...page,
      }),
    FOLLOW_UP_QUERY_LIMITS.maxPlans
  );
  const planIds = plansRead.rows.map((p) => p.id);

  let trackingUnavailable = false;
  let executionsComplete = true;
  const byPlan = new Map<string, FollowUpPlanInput["executions"]>();
  if (planIds.length > 0) {
    try {
      const read = await readAllPaged(
        (page) =>
          db.clientPlanDayExecution.findMany({
            where: { tenant_id: tenantId, plan_id: { in: planIds } },
            select: { id: true, plan_id: true, plan_day_id: true, local_date: true, client_status: true, trainer_status: true },
            orderBy: { id: "asc" },
            ...page,
          }),
        FOLLOW_UP_QUERY_LIMITS.maxExecutions
      );
      executionsComplete = read.complete;
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

  const plans: FollowUpPlanInput[] = plansRead.rows.map((p) => ({
    id: p.id,
    clientId: p.client_id,
    firstName: p.client.first_name,
    lastName: p.client.last_name,
    planName: p.template?.name ?? "Plan personalizado",
    branchName: p.branch.name,
    start: dateKey(p.start_date),
    end: dateKey(p.end_date),
    status: p.status,
    createdAt: p.created_at.getTime(),
    days: p.days.map((d) => ({ id: d.id, weekday: d.weekday, sessionName: d.session_name })),
    executions: byPlan.get(p.id) ?? [],
  }));

  // Asistencia confirmada (GYM-4): solo con gym.classes; solo id/alumno/fecha.
  let attendance: TrainerFollowUp["attendance"] = null;
  let perPlan: Map<string, Set<string>> | null = null;
  if (input.includeClasses && plans.length > 0) {
    const clientIds = [...new Set(plans.map((p) => p.clientId))];
    const from = plans.reduce((m, p) => (p.start < m ? p.start : m), today);
    const read = await readAllPaged(
      (page) =>
        db.classAttendance.findMany({
          where: {
            tenant_id: tenantId,
            client_id: { in: clientIds },
            attendance_status: { in: ["attended", "late"] },
            scheduled_class: { class_date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${today}T00:00:00.000Z`) } },
          },
          select: { id: true, client_id: true, scheduled_class: { select: { class_date: true } } },
          orderBy: { id: "asc" },
          ...page,
        }),
      FOLLOW_UP_QUERY_LIMITS.maxAttendance
    );
    const refs = read.rows.map((r) => ({ id: r.id, clientId: r.client_id, date: dateKey(r.scheduled_class.class_date) }));
    perPlan = attendanceByPlan(plans, refs, today);
    const currentIds = new Set<string>();
    if (read.complete) {
      for (const p of plans) {
        if (planPhase(p, today) === "CURRENT") for (const a of perPlan.get(p.id) ?? []) currentIds.add(a);
      }
    } else {
      perPlan = null;
    }
    attendance = { currentPlans: currentIds.size, incomplete: !read.complete };
  } else if (input.includeClasses) {
    attendance = { currentPlans: 0, incomplete: false };
  }

  const incomplete = !plansRead.complete || !executionsComplete;
  const metrics = !incomplete && !trackingUnavailable;
  return {
    today,
    rows: plans.map((p) => buildFollowUpRow(p, today, { metrics, attendance: perPlan ? perPlan.get(p.id)?.size ?? 0 : null })),
    summary: metrics ? summarizeFollowUp(plans, today) : null,
    incomplete,
    trackingUnavailable,
    attendance,
  };
}
