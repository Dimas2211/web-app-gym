"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import {
  requireAdmin,
  requireClassViewer,
  canManageBranch,
} from "@/lib/permissions/guards";
import type { SessionUser } from "@/lib/permissions/guards";
import {
  createTemplateSchema,
  updateTemplateSchema,
  upsertTemplateDaySchema,
  createClientPlanSchema,
  updateClientPlanSchema,
  updateClientPlanDaySchema,
  markDaySchema,
} from "./schemas";
import { getLinkedTrainerId } from "./queries";

export type WeeklyPlanActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

function n(v: FormDataEntryValue | null): string | null {
  const s = v as string | null;
  return !s || s.trim() === "" ? null : s.trim();
}

// ── Helpers de scope ──────────────────────────────────────────

function canManageTemplate(
  user: SessionUser,
  template: { branch_id: string | null }
): boolean {
  if (user.role === "super_admin") return true;
  if (user.role === "branch_admin") {
    return (
      template.branch_id === null || template.branch_id === user.branch_id
    );
  }
  return false;
}

function canManageClientPlan(
  user: SessionUser,
  plan: { branch_id: string; trainer_id: string | null }
): boolean {
  if (user.role === "super_admin") return true;
  if (user.role === "branch_admin" || user.role === "reception") {
    return plan.branch_id === user.branch_id;
  }
  // trainer: verifica el campo trainer_id más abajo con linked trainer
  return false;
}

async function canTrainerManagePlan(
  user: SessionUser,
  plan: { branch_id: string; trainer_id: string | null }
): Promise<boolean> {
  if (user.role !== "trainer") return false;
  const linked = await getLinkedTrainerId(user.id, user.gym_id);
  if (!linked) return false;
  return plan.trainer_id === linked && plan.branch_id === user.branch_id;
}

// ══════════════════════════════════════════════
// WEEKLY PLAN TEMPLATES
// ══════════════════════════════════════════════

export async function createTemplateAction(
  _prev: WeeklyPlanActionState,
  formData: FormData
): Promise<WeeklyPlanActionState> {
  const sessionUser = await requireAdmin();

  const raw = {
    code: n(formData.get("code")),
    name: formData.get("name"),
    description: n(formData.get("description")),
    branch_id: n(formData.get("branch_id")),
    target_gender: n(formData.get("target_gender")),
    target_sport_id: n(formData.get("target_sport_id")),
    target_goal_id: n(formData.get("target_goal_id")),
    target_level: n(formData.get("target_level")),
  };

  // branch_admin solo puede crear en su sucursal o global (null)
  if (
    sessionUser.role === "branch_admin" &&
    raw.branch_id !== null &&
    raw.branch_id !== sessionUser.branch_id
  ) {
    return { error: "Solo puedes crear plantillas en tu propia sucursal." };
  }

  const parsed = createTemplateSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  await prisma.weeklyPlanTemplate.create({
    data: {
      gym_id: sessionUser.gym_id,
      created_by: sessionUser.id,
      status: "active",
      ...parsed.data,
    },
  });

  revalidatePath("/dashboard/weekly-plans/templates");
  redirect("/dashboard/weekly-plans/templates");
}

export async function updateTemplateAction(
  _prev: WeeklyPlanActionState,
  formData: FormData
): Promise<WeeklyPlanActionState> {
  const sessionUser = await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return { error: "ID requerido." };

  const existing = await prisma.weeklyPlanTemplate.findFirst({
    where: { id, gym_id: sessionUser.gym_id },
  });
  if (!existing) return { error: "Plantilla no encontrada." };
  if (!canManageTemplate(sessionUser, existing)) {
    return { error: "Sin permiso para editar esta plantilla." };
  }

  const raw = {
    code: n(formData.get("code")),
    name: formData.get("name"),
    description: n(formData.get("description")),
    branch_id: n(formData.get("branch_id")),
    target_gender: n(formData.get("target_gender")),
    target_sport_id: n(formData.get("target_sport_id")),
    target_goal_id: n(formData.get("target_goal_id")),
    target_level: n(formData.get("target_level")),
  };

  const parsed = updateTemplateSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  await prisma.weeklyPlanTemplate.update({ where: { id }, data: parsed.data });

  revalidatePath("/dashboard/weekly-plans/templates");
  revalidatePath(`/dashboard/weekly-plans/templates/${id}`);
  redirect(`/dashboard/weekly-plans/templates/${id}`);
}

export async function toggleTemplateStatusAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;

  const target = await prisma.weeklyPlanTemplate.findFirst({
    where: { id, gym_id: sessionUser.gym_id },
  });
  if (!target || !canManageTemplate(sessionUser, target)) return;

  await prisma.weeklyPlanTemplate.update({
    where: { id },
    data: { status: target.status === "active" ? "inactive" : "active" },
  });
  revalidatePath("/dashboard/weekly-plans/templates");
  revalidatePath(`/dashboard/weekly-plans/templates/${id}`);
}

// ══════════════════════════════════════════════
// TEMPLATE DAYS
// ══════════════════════════════════════════════

export async function upsertTemplateDayAction(
  _prev: WeeklyPlanActionState,
  formData: FormData
): Promise<WeeklyPlanActionState> {
  const sessionUser = await requireAdmin();
  const template_id = formData.get("template_id") as string;
  if (!template_id) return { error: "Plantilla requerida." };

  const template = await prisma.weeklyPlanTemplate.findFirst({
    where: { id: template_id, gym_id: sessionUser.gym_id },
  });
  if (!template) return { error: "Plantilla no encontrada." };
  if (!canManageTemplate(sessionUser, template)) {
    return { error: "Sin permiso para editar esta plantilla." };
  }

  const raw = {
    weekday: formData.get("weekday"),
    session_name: n(formData.get("session_name")),
    focus_area: n(formData.get("focus_area")),
    duration_minutes: formData.get("duration_minutes"),
    exercise_block: n(formData.get("exercise_block")),
    trainer_notes: n(formData.get("trainer_notes")),
  };

  const parsed = upsertTemplateDaySchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  await prisma.weeklyPlanTemplateDay.upsert({
    where: {
      template_id_weekday: {
        template_id,
        weekday: parsed.data.weekday,
      },
    },
    create: { template_id, ...parsed.data },
    update: parsed.data,
  });

  revalidatePath(`/dashboard/weekly-plans/templates/${template_id}`);
  redirect(`/dashboard/weekly-plans/templates/${template_id}`);
}

export async function deleteTemplateDayAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireAdmin();
  const id = formData.get("id") as string;
  const template_id = formData.get("template_id") as string;
  if (!id || !template_id) return;

  const day = await prisma.weeklyPlanTemplateDay.findFirst({
    where: { id },
    include: { template: { select: { gym_id: true, branch_id: true } } },
  });
  if (!day || day.template.gym_id !== sessionUser.gym_id) return;
  if (!canManageTemplate(sessionUser, day.template)) return;

  await prisma.weeklyPlanTemplateDay.delete({ where: { id } });
  revalidatePath(`/dashboard/weekly-plans/templates/${template_id}`);
}

// ══════════════════════════════════════════════
// CLIENT WEEKLY PLANS
// ══════════════════════════════════════════════

/** Valida que no exista un plan activo que se solape en el periodo dado para ese cliente */
async function validatePlanOverlap(
  client_id: string,
  start_date: string,
  end_date: string,
  excludeId?: string
) {
  const start = new Date(start_date + "T00:00:00.000Z");
  const end = new Date(end_date + "T00:00:00.000Z");

  const overlap = await prisma.clientWeeklyPlan.findFirst({
    where: {
      client_id,
      status: { in: ["active", "suspended"] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      start_date: { lte: end },
      end_date: { gte: start },
    },
    select: { id: true, start_date: true, end_date: true, status: true },
  });
  return overlap;
}

export async function createClientPlanAction(
  _prev: WeeklyPlanActionState,
  formData: FormData
): Promise<WeeklyPlanActionState> {
  const sessionUser = await requireClassViewer();

  const raw = {
    client_id: formData.get("client_id"),
    branch_id: formData.get("branch_id"),
    trainer_id: n(formData.get("trainer_id")),
    template_id: n(formData.get("template_id")),
    start_date: formData.get("start_date"),
    end_date: formData.get("end_date"),
    notes: n(formData.get("notes")),
  };

  // Scope: branch_admin/reception solo crean en su sucursal
  if (
    (sessionUser.role === "branch_admin" || sessionUser.role === "reception") &&
    raw.branch_id !== sessionUser.branch_id
  ) {
    return { error: "Solo puedes asignar planes en tu propia sucursal." };
  }

  const parsed = createClientPlanSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { client_id, branch_id, trainer_id, template_id, start_date, end_date, notes } =
    parsed.data;

  // Validar cliente en scope
  const client = await prisma.client.findFirst({
    where: { id: client_id, gym_id: sessionUser.gym_id },
  });
  if (!client) return { error: "Cliente no encontrado." };
  if (
    (sessionUser.role === "branch_admin" || sessionUser.role === "reception") &&
    client.branch_id !== sessionUser.branch_id
  ) {
    return { error: "El cliente no pertenece a tu sucursal." };
  }

  // Validar trainer si se indicó
  if (trainer_id) {
    const trainer = await prisma.trainer.findFirst({
      where: { id: trainer_id, gym_id: sessionUser.gym_id },
    });
    if (!trainer) return { error: "Entrenador no encontrado." };
  }

  // Validar solapamiento
  const overlap = await validatePlanOverlap(client_id, start_date, end_date);
  if (overlap) {
    return {
      errors: {
        start_date: [
          `Ya existe un plan activo para este cliente que se solapa con las fechas indicadas.`,
        ],
      },
    };
  }

  // Crear el plan
  const newPlan = await prisma.clientWeeklyPlan.create({
    data: {
      gym_id: sessionUser.gym_id,
      branch_id,
      client_id,
      trainer_id,
      template_id,
      start_date: new Date(start_date + "T00:00:00.000Z"),
      end_date: new Date(end_date + "T00:00:00.000Z"),
      notes,
      status: "active",
    },
  });

  // Si hay plantilla, copiar los días al plan del cliente
  if (template_id) {
    const templateDays = await prisma.weeklyPlanTemplateDay.findMany({
      where: { template_id },
    });

    if (templateDays.length > 0) {
      await prisma.clientWeeklyPlanDay.createMany({
        data: templateDays.map((d) => ({
          client_weekly_plan_id: newPlan.id,
          weekday: d.weekday,
          session_name: d.session_name,
          focus_area: d.focus_area,
          duration_minutes: d.duration_minutes,
          exercise_block: d.exercise_block,
          execution_status: "pending",
        })),
      });
    }
  }

  revalidatePath("/dashboard/weekly-plans/client-plans");
  redirect(`/dashboard/weekly-plans/client-plans/${newPlan.id}`);
}

export async function updateClientPlanAction(
  _prev: WeeklyPlanActionState,
  formData: FormData
): Promise<WeeklyPlanActionState> {
  const sessionUser = await requireClassViewer();
  const id = formData.get("id") as string;
  if (!id) return { error: "ID requerido." };

  const plan = await prisma.clientWeeklyPlan.findFirst({
    where: { id, gym_id: sessionUser.gym_id },
  });
  if (!plan) return { error: "Plan no encontrado." };

  // Verificar permiso
  const hasDirectAccess = canManageClientPlan(sessionUser, plan);
  const hasTrainerAccess = !hasDirectAccess
    ? await canTrainerManagePlan(sessionUser, plan)
    : false;
  if (!hasDirectAccess && !hasTrainerAccess) {
    return { error: "Sin permiso para editar este plan." };
  }

  const raw = {
    trainer_id: n(formData.get("trainer_id")),
    start_date: formData.get("start_date"),
    end_date: formData.get("end_date"),
    status: formData.get("status"),
    notes: n(formData.get("notes")),
  };

  const parsed = updateClientPlanSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { start_date, end_date } = parsed.data;

  // Validar solapamiento (excluyendo este plan)
  if (parsed.data.status === "active") {
    const overlap = await validatePlanOverlap(plan.client_id, start_date, end_date, id);
    if (overlap) {
      return {
        errors: {
          start_date: [
            `Ya existe un plan activo para este cliente que se solapa con las fechas indicadas.`,
          ],
        },
      };
    }
  }

  await prisma.clientWeeklyPlan.update({
    where: { id },
    data: {
      trainer_id: parsed.data.trainer_id,
      start_date: new Date(start_date + "T00:00:00.000Z"),
      end_date: new Date(end_date + "T00:00:00.000Z"),
      status: parsed.data.status,
      notes: parsed.data.notes,
    },
  });

  revalidatePath("/dashboard/weekly-plans/client-plans");
  revalidatePath(`/dashboard/weekly-plans/client-plans/${id}`);
  redirect(`/dashboard/weekly-plans/client-plans/${id}`);
}

export async function toggleClientPlanStatusAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireClassViewer();
  const id = formData.get("id") as string;
  if (!id) return;

  const plan = await prisma.clientWeeklyPlan.findFirst({
    where: { id, gym_id: sessionUser.gym_id },
  });
  if (!plan) return;

  const hasDirectAccess = canManageClientPlan(sessionUser, plan);
  const hasTrainerAccess = !hasDirectAccess
    ? await canTrainerManagePlan(sessionUser, plan)
    : false;
  if (!hasDirectAccess && !hasTrainerAccess) return;

  await prisma.clientWeeklyPlan.update({
    where: { id },
    data: { status: plan.status === "active" ? "inactive" : "active" },
  });

  revalidatePath("/dashboard/weekly-plans/client-plans");
  revalidatePath(`/dashboard/weekly-plans/client-plans/${id}`);
}

// ══════════════════════════════════════════════
// CLIENT WEEKLY PLAN DAYS
// ══════════════════════════════════════════════

export async function updateClientPlanDayAction(
  _prev: WeeklyPlanActionState,
  formData: FormData
): Promise<WeeklyPlanActionState> {
  const sessionUser = await requireClassViewer();
  const day_id = formData.get("day_id") as string;
  const plan_id = formData.get("plan_id") as string;
  if (!day_id || !plan_id) return { error: "IDs requeridos." };

  const plan = await prisma.clientWeeklyPlan.findFirst({
    where: { id: plan_id, gym_id: sessionUser.gym_id },
  });
  if (!plan) return { error: "Plan no encontrado." };

  const hasDirectAccess = canManageClientPlan(sessionUser, plan);
  const hasTrainerAccess = !hasDirectAccess
    ? await canTrainerManagePlan(sessionUser, plan)
    : false;
  if (!hasDirectAccess && !hasTrainerAccess) {
    return { error: "Sin permiso para editar este día." };
  }

  const raw = {
    session_name: n(formData.get("session_name")),
    focus_area: n(formData.get("focus_area")),
    duration_minutes: formData.get("duration_minutes"),
    exercise_block: n(formData.get("exercise_block")),
    trainer_feedback: n(formData.get("trainer_feedback")),
    client_feedback: n(formData.get("client_feedback")),
  };

  const parsed = updateClientPlanDaySchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  await prisma.clientWeeklyPlanDay.update({
    where: { id: day_id },
    data: parsed.data,
  });

  revalidatePath(`/dashboard/weekly-plans/client-plans/${plan_id}`);
  redirect(`/dashboard/weekly-plans/client-plans/${plan_id}`);
}

export async function markClientPlanDayAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireClassViewer();
  const day_id = formData.get("day_id") as string;
  const plan_id = formData.get("plan_id") as string;
  if (!day_id || !plan_id) return;

  const plan = await prisma.clientWeeklyPlan.findFirst({
    where: { id: plan_id, gym_id: sessionUser.gym_id },
  });
  if (!plan) return;

  const hasDirectAccess = canManageClientPlan(sessionUser, plan);
  const hasTrainerAccess = !hasDirectAccess
    ? await canTrainerManagePlan(sessionUser, plan)
    : false;
  if (!hasDirectAccess && !hasTrainerAccess) return;

  const raw = {
    execution_status: formData.get("execution_status"),
    trainer_feedback: n(formData.get("trainer_feedback")),
    client_feedback: n(formData.get("client_feedback")),
  };

  const parsed = markDaySchema.safeParse(raw);
  if (!parsed.success) return;

  const executed_at =
    parsed.data.execution_status === "completed" ||
    parsed.data.execution_status === "partial"
      ? new Date()
      : null;

  await prisma.clientWeeklyPlanDay.update({
    where: { id: day_id },
    data: {
      execution_status: parsed.data.execution_status,
      executed_at,
      trainer_feedback: parsed.data.trainer_feedback,
      client_feedback: parsed.data.client_feedback,
    },
  });

  revalidatePath(`/dashboard/weekly-plans/client-plans/${plan_id}`);
}

/** Añade un día manualmente al plan del cliente (cuando no vino de plantilla) */
export async function addClientPlanDayAction(
  _prev: WeeklyPlanActionState,
  formData: FormData
): Promise<WeeklyPlanActionState> {
  const sessionUser = await requireClassViewer();
  const plan_id = formData.get("plan_id") as string;
  if (!plan_id) return { error: "Plan requerido." };

  const plan = await prisma.clientWeeklyPlan.findFirst({
    where: { id: plan_id, gym_id: sessionUser.gym_id },
  });
  if (!plan) return { error: "Plan no encontrado." };

  const hasDirectAccess = canManageClientPlan(sessionUser, plan);
  const hasTrainerAccess = !hasDirectAccess
    ? await canTrainerManagePlan(sessionUser, plan)
    : false;
  if (!hasDirectAccess && !hasTrainerAccess) {
    return { error: "Sin permiso." };
  }

  const raw = {
    weekday: formData.get("weekday"),
    session_name: n(formData.get("session_name")),
    focus_area: n(formData.get("focus_area")),
    duration_minutes: formData.get("duration_minutes"),
    exercise_block: n(formData.get("exercise_block")),
    trainer_notes: n(formData.get("trainer_notes")),
  };

  const parsed = upsertTemplateDaySchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const exists = await prisma.clientWeeklyPlanDay.findFirst({
    where: { client_weekly_plan_id: plan_id, weekday: parsed.data.weekday },
  });
  if (exists) {
    return {
      errors: {
        weekday: ["Ya existe un día para ese día de la semana en este plan."],
      },
    };
  }

  await prisma.clientWeeklyPlanDay.create({
    data: {
      client_weekly_plan_id: plan_id,
      weekday: parsed.data.weekday,
      session_name: parsed.data.session_name,
      focus_area: parsed.data.focus_area,
      duration_minutes: parsed.data.duration_minutes,
      exercise_block: parsed.data.exercise_block,
      execution_status: "pending",
    },
  });

  revalidatePath(`/dashboard/weekly-plans/client-plans/${plan_id}`);
  redirect(`/dashboard/weekly-plans/client-plans/${plan_id}`);
}
