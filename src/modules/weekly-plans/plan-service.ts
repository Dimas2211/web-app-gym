// ─────────────────────────────────────────────────────────────────
// GYM-5A §6 — creación y edición consistente de planes semanales de alumno.
//
// - Referencias (alumno, sede, entrenador, plantilla) validadas contra el
//   tenant del contexto y entre sí (sede del plan = sede del alumno;
//   entrenador activo de esa sede; plantilla activa y aplicable a la sede).
// - Plan + días se crean en UNA transacción (sin planes huérfanos).
// - El solapamiento se valida bajo bloqueo de la fila del alumno
//   (SELECT … FOR UPDATE sobre clients): dos solicitudes concurrentes para el
//   mismo alumno se serializan; cada transacción bloquea UNA sola fila, por
//   lo que no introduce deadlocks entre alumnos.
// ─────────────────────────────────────────────────────────────────

import type { Client, ClientWeeklyPlan, Prisma, PrismaClient, Trainer, WeeklyPlanTemplate, WeeklyPlanTemplateDay } from "@prisma/client";

export const PLAN_OVERLAP_MESSAGE = "Ya existe un plan activo para este cliente que se solapa con las fechas indicadas.";

export type TxClient = Prisma.TransactionClient;

export function isoToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Bloquea la fila del alumno hasta el fin de la transacción (serializa planes del mismo alumno). */
export async function lockClientRow(tx: TxClient, clientId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM clients WHERE id = ${clientId} FOR UPDATE`;
}

export async function findOverlappingPlan(
  db: PrismaClient | TxClient,
  clientId: string,
  startDate: string,
  endDate: string,
  excludePlanId?: string
) {
  return db.clientWeeklyPlan.findFirst({
    where: {
      client_id: clientId,
      status: { in: ["active", "suspended"] },
      ...(excludePlanId ? { id: { not: excludePlanId } } : {}),
      start_date: { lte: isoToDate(endDate) },
      end_date: { gte: isoToDate(startDate) },
    },
    select: { id: true, start_date: true, end_date: true, status: true },
  });
}

export type RefResult<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Entrenador asignable: del tenant, activo y de la sede del plan. */
export async function resolveAssignableTrainer(
  db: PrismaClient | TxClient,
  tenantId: string,
  trainerId: string,
  branchId: string
): Promise<RefResult<{ trainer: Trainer }>> {
  const trainer = await db.trainer.findFirst({ where: { id: trainerId, tenant_id: tenantId } });
  if (!trainer) return { ok: false, error: "Entrenador no encontrado." };
  if (trainer.status !== "active") return { ok: false, error: "El entrenador seleccionado está inactivo." };
  if (trainer.branch_id !== branchId) return { ok: false, error: "El entrenador no pertenece a la sede del plan." };
  return { ok: true, trainer };
}

/** Plantilla aplicable: del tenant, activa y global o de la sede del plan. */
export async function resolveApplicableTemplate(
  db: PrismaClient | TxClient,
  tenantId: string,
  templateId: string,
  branchId: string
): Promise<RefResult<{ template: WeeklyPlanTemplate & { days: WeeklyPlanTemplateDay[] } }>> {
  const template = await db.weeklyPlanTemplate.findFirst({
    where: { id: templateId, tenant_id: tenantId },
    include: { days: true },
  });
  if (!template) return { ok: false, error: "Plantilla no encontrada." };
  if (template.status !== "active") return { ok: false, error: "La plantilla está inactiva." };
  if (template.branch_id !== null && template.branch_id !== branchId) {
    return { ok: false, error: "La plantilla no es aplicable a la sede del plan." };
  }
  return { ok: true, template };
}

/** Sede del tenant, activa. */
export async function resolveTenantBranch(db: PrismaClient | TxClient, tenantId: string, branchId: string) {
  return db.branch.findFirst({ where: { id: branchId, tenant_id: tenantId, status: "active" }, select: { id: true } });
}

export interface CreatePlanInput {
  gymId: string;
  tenantId: string;
  branchId: string;
  clientId: string;
  trainerId: string | null;
  template: (WeeklyPlanTemplate & { days: WeeklyPlanTemplateDay[] }) | null;
  startDate: string;
  endDate: string;
  notes: string | null;
  assignmentType: "individual" | "segmented";
}

export type CreatePlanResult = { ok: true; plan: ClientWeeklyPlan } | { ok: false; code: "OVERLAP" };

/** Plan + días en una transacción, con el solapamiento validado bajo bloqueo del alumno. */
export async function createPlanWithDays(db: PrismaClient, input: CreatePlanInput): Promise<CreatePlanResult> {
  return db.$transaction(async (tx) => {
    await lockClientRow(tx, input.clientId);
    const overlap = await findOverlappingPlan(tx, input.clientId, input.startDate, input.endDate);
    if (overlap) return { ok: false, code: "OVERLAP" } as const;

    const plan = await tx.clientWeeklyPlan.create({
      data: {
        gym_id: input.gymId,
        tenant_id: input.tenantId,
        branch_id: input.branchId,
        client_id: input.clientId,
        trainer_id: input.trainerId,
        template_id: input.template?.id ?? null,
        start_date: isoToDate(input.startDate),
        end_date: isoToDate(input.endDate),
        notes: input.notes,
        status: "active",
        assignment_type: input.assignmentType,
      },
    });
    if (input.template && input.template.days.length > 0) {
      await tx.clientWeeklyPlanDay.createMany({
        data: input.template.days.map((d) => ({
          client_weekly_plan_id: plan.id,
          weekday: d.weekday,
          session_name: d.session_name,
          focus_area: d.focus_area,
          duration_minutes: d.duration_minutes,
          exercise_block: d.exercise_block,
          execution_status: "pending" as const,
        })),
      });
    }
    return { ok: true, plan } as const;
  });
}

export interface UpdatePlanInput {
  planId: string;
  clientId: string;
  trainerId: string | null;
  startDate: string;
  endDate: string;
  status: "active" | "inactive" | "suspended" | "deleted";
  notes: string | null;
}

/** Actualiza el plan revalidando el solapamiento bajo bloqueo del alumno cuando queda vigente. */
export async function updatePlanChecked(db: PrismaClient, input: UpdatePlanInput): Promise<{ ok: true } | { ok: false; code: "OVERLAP" }> {
  return db.$transaction(async (tx) => {
    await lockClientRow(tx, input.clientId);
    if (input.status === "active" || input.status === "suspended") {
      const overlap = await findOverlappingPlan(tx, input.clientId, input.startDate, input.endDate, input.planId);
      if (overlap) return { ok: false, code: "OVERLAP" } as const;
    }
    await tx.clientWeeklyPlan.update({
      where: { id: input.planId },
      data: {
        trainer_id: input.trainerId,
        start_date: isoToDate(input.startDate),
        end_date: isoToDate(input.endDate),
        status: input.status,
        notes: input.notes,
      },
    });
    return { ok: true } as const;
  });
}

/** Cambia active↔inactive; al activar revalida el solapamiento bajo bloqueo del alumno. */
export async function togglePlanStatusChecked(
  db: PrismaClient,
  plan: Pick<ClientWeeklyPlan, "id" | "client_id">
): Promise<{ ok: true } | { ok: false; code: "OVERLAP" }> {
  return db.$transaction(async (tx) => {
    await lockClientRow(tx, plan.client_id);
    const current = await tx.clientWeeklyPlan.findUniqueOrThrow({ where: { id: plan.id } });
    const next = current.status === "active" ? "inactive" : "active";
    if (next === "active") {
      const overlap = await findOverlappingPlan(
        tx,
        plan.client_id,
        current.start_date.toISOString().slice(0, 10),
        current.end_date.toISOString().slice(0, 10),
        plan.id
      );
      if (overlap) return { ok: false, code: "OVERLAP" } as const;
    }
    await tx.clientWeeklyPlan.update({ where: { id: plan.id }, data: { status: next } });
    return { ok: true } as const;
  });
}

export type { Client };
