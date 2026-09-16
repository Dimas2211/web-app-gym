"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PrismaClient, UserRole } from "@prisma/client";
import {
  requireAdmin,
  requireClassViewer,
  canDeleteDirectly,
  getSessionOrRedirect,
} from "@/lib/permissions/guards";
import {
  checkDeleteAuth,
  type DeleteAuthActionState,
} from "@/lib/permissions/delete-authorization";
import {
  createTemplateSchema,
  updateTemplateSchema,
  upsertTemplateDaySchema,
  createClientPlanSchema,
  updateClientPlanSchema,
  updateClientPlanDaySchema,
  markDaySchema,
  assignSegmentedSchema,
} from "./schemas";
import { getLinkedTrainerId } from "./queries";
import {
  requireOperationalContext,
  OperationalContextError,
  type EffectiveOperationalUser,
} from "@/modules/platform/runtime/require-operational-context";

export type WeeklyPlanActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export type AssignSegmentedActionState =
  | {
      errors?: Record<string, string[]>;
      error?: string;
      assigned?: number;
      skipped?: number;
    }
  | undefined;

function n(v: FormDataEntryValue | null): string | null {
  const s = v as string | null;
  return !s || s.trim() === "" ? null : s.trim();
}

// ── Helpers de scope — operan sobre el usuario EFECTIVO (LIVE role/location) ──

function canManageTemplate(
  user: EffectiveOperationalUser,
  template: { branch_id: string | null }
): boolean {
  if (user.role === "super_admin") return true;
  if (user.role === "branch_admin") {
    return (
      template.branch_id === null || template.branch_id === user.location_id
    );
  }
  return false;
}

function canManageClientPlan(
  user: EffectiveOperationalUser,
  plan: { branch_id: string; trainer_id: string | null }
): boolean {
  if (user.role === "super_admin") return true;
  if (user.role === "branch_admin" || user.role === "reception") {
    return plan.branch_id === user.location_id;
  }
  // trainer: verifica el campo trainer_id más abajo con linked trainer
  return false;
}

async function canTrainerManagePlan(
  user: EffectiveOperationalUser,
  plan: { branch_id: string; trainer_id: string | null },
  db: PrismaClient,
): Promise<boolean> {
  if (user.role !== "trainer") return false;
  const linked = await getLinkedTrainerId(user.id, user.tenant_id, db);
  if (!linked) return false;
  return plan.trainer_id === linked && plan.branch_id === user.location_id;
}

// ══════════════════════════════════════════════
// WEEKLY PLAN TEMPLATES
// ══════════════════════════════════════════════

export async function createTemplateAction(
  _prev: WeeklyPlanActionState,
  formData: FormData
): Promise<WeeklyPlanActionState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.weekly_plans", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
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
      context.effectiveUser.role === "branch_admin" &&
      raw.branch_id !== null &&
      raw.branch_id !== context.locationId
    ) {
      return { error: "Solo puedes crear plantillas en tu propia sucursal." };
    }

    const parsed = createTemplateSchema.safeParse(raw);
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

    await context.client.weeklyPlanTemplate.create({
      data: {
        gym_id: context.tenantId,
        tenant_id: context.tenantId,
        created_by: context.effectiveUser.id,
        status: "active",
        ...parsed.data,
      },
    });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/weekly-plans/templates");
  redirect("/dashboard/weekly-plans/templates");
}

export async function updateTemplateAction(
  _prev: WeeklyPlanActionState,
  formData: FormData
): Promise<WeeklyPlanActionState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.weekly_plans", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return { error: "ID requerido." };

    const existing = await context.client.weeklyPlanTemplate.findFirst({
      where: { id, tenant_id: context.tenantId },
    });
    if (!existing) return { error: "Plantilla no encontrada." };
    if (!canManageTemplate(context.effectiveUser, existing)) {
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

    await context.client.weeklyPlanTemplate.update({ where: { id }, data: parsed.data });

    revalidatePath("/dashboard/weekly-plans/templates");
    revalidatePath(`/dashboard/weekly-plans/templates/${id}`);
  } finally {
    await dispose();
  }

  redirect(`/dashboard/weekly-plans/templates/${formData.get("id")}`);
}

export async function toggleTemplateStatusAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.weekly_plans", write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return;

    const target = await context.client.weeklyPlanTemplate.findFirst({
      where: { id, tenant_id: context.tenantId },
    });
    if (!target || !canManageTemplate(context.effectiveUser, target)) return;

    await context.client.weeklyPlanTemplate.update({
      where: { id },
      data: { status: target.status === "active" ? "inactive" : "active" },
    });
    revalidatePath("/dashboard/weekly-plans/templates");
    revalidatePath(`/dashboard/weekly-plans/templates/${id}`);
  } finally {
    await dispose();
  }
}

// ══════════════════════════════════════════════
// TEMPLATE DAYS
// ══════════════════════════════════════════════

export async function upsertTemplateDayAction(
  _prev: WeeklyPlanActionState,
  formData: FormData
): Promise<WeeklyPlanActionState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.weekly_plans", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const template_id = formData.get("template_id") as string;
    if (!template_id) return { error: "Plantilla requerida." };

    const template = await context.client.weeklyPlanTemplate.findFirst({
      where: { id: template_id, tenant_id: context.tenantId },
    });
    if (!template) return { error: "Plantilla no encontrada." };
    if (!canManageTemplate(context.effectiveUser, template)) {
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

    await context.client.weeklyPlanTemplateDay.upsert({
      where: {
        template_id_weekday: {
          template_id,
          weekday: parsed.data.weekday,
        },
      },
      create: { template_id, ...parsed.data },
      update: parsed.data,
    });
  } finally {
    await dispose();
  }

  revalidatePath(`/dashboard/weekly-plans/templates/${formData.get("template_id")}`);
  redirect(`/dashboard/weekly-plans/templates/${formData.get("template_id")}`);
}

export async function deleteTemplateDayAction(
  _prev: DeleteAuthActionState,
  formData: FormData
): Promise<DeleteAuthActionState> {
  const sessionUser = await getSessionOrRedirect();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.weekly_plans", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    const template_id = formData.get("template_id") as string;
    if (!id || !template_id) return { error: "Datos inválidos" };

    const day = await context.client.weeklyPlanTemplateDay.findFirst({
      where: { id },
      include: { template: { select: { tenant_id: true, branch_id: true } } },
    });

    if (!day || day.template.tenant_id !== context.tenantId) {
      return { error: "Registro no encontrado" };
    }

    if (canDeleteDirectly(context.effectiveUser.role as UserRole)) {
      if (!canManageTemplate(context.effectiveUser, day.template)) {
        return { error: "Sin permisos para gestionar esta plantilla" };
      }
    }

    const auth = await checkDeleteAuth(
      formData,
      { role: context.effectiveUser.role as UserRole, tenant_id: context.tenantId },
      context.client,
    );
    if (!auth.ok) return { error: auth.error };

    await context.client.weeklyPlanTemplateDay.delete({ where: { id } });
  } finally {
    await dispose();
  }

  revalidatePath(`/dashboard/weekly-plans/templates/${formData.get("template_id")}`);
  redirect(`/dashboard/weekly-plans/templates/${formData.get("template_id")}`);
}

// ══════════════════════════════════════════════
// CLIENT WEEKLY PLANS
// ══════════════════════════════════════════════

/** Valida que no exista un plan activo que se solape en el periodo dado para ese cliente */
async function validatePlanOverlap(
  db: PrismaClient,
  client_id: string,
  start_date: string,
  end_date: string,
  excludeId?: string
) {
  const start = new Date(start_date + "T00:00:00.000Z");
  const end = new Date(end_date + "T00:00:00.000Z");

  const overlap = await db.clientWeeklyPlan.findFirst({
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

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.weekly_plans", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const effectiveRole = context.effectiveUser.role;
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
      (effectiveRole === "branch_admin" || effectiveRole === "reception") &&
      raw.branch_id !== context.locationId
    ) {
      return { error: "Solo puedes asignar planes en tu propia sucursal." };
    }

    const parsed = createClientPlanSchema.safeParse(raw);
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

    const { client_id, branch_id, trainer_id, template_id, start_date, end_date, notes } =
      parsed.data;

    // Validar cliente en scope
    const client = await context.client.client.findFirst({
      where: { id: client_id, tenant_id: context.tenantId },
    });
    if (!client) return { error: "Cliente no encontrado." };
    if (
      (effectiveRole === "branch_admin" || effectiveRole === "reception") &&
      client.branch_id !== context.locationId
    ) {
      return { error: "El cliente no pertenece a tu sucursal." };
    }

    // Validar trainer si se indicó
    if (trainer_id) {
      const trainer = await context.client.trainer.findFirst({
        where: { id: trainer_id, tenant_id: context.tenantId },
      });
      if (!trainer) return { error: "Entrenador no encontrado." };
    }

    // Validar solapamiento
    const overlap = await validatePlanOverlap(context.client, client_id, start_date, end_date);
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
    const newPlan = await context.client.clientWeeklyPlan.create({
      data: {
        gym_id: context.tenantId,
        tenant_id: context.tenantId,
        branch_id,
        client_id,
        trainer_id,
        template_id,
        start_date: new Date(start_date + "T00:00:00.000Z"),
        end_date: new Date(end_date + "T00:00:00.000Z"),
        notes,
        status: "active",
        assignment_type: "individual",
      },
    });

    // Si hay plantilla, copiar los días al plan del cliente
    if (template_id) {
      const templateDays = await context.client.weeklyPlanTemplateDay.findMany({
        where: { template_id },
      });

      if (templateDays.length > 0) {
        await context.client.clientWeeklyPlanDay.createMany({
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
  } finally {
    await dispose();
  }
}

export async function updateClientPlanAction(
  _prev: WeeklyPlanActionState,
  formData: FormData
): Promise<WeeklyPlanActionState> {
  const sessionUser = await requireClassViewer();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.weekly_plans", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return { error: "ID requerido." };

    const plan = await context.client.clientWeeklyPlan.findFirst({
      where: { id, tenant_id: context.tenantId },
    });
    if (!plan) return { error: "Plan no encontrado." };

    // Verificar permiso
    const hasDirectAccess = canManageClientPlan(context.effectiveUser, plan);
    const hasTrainerAccess = !hasDirectAccess
      ? await canTrainerManagePlan(context.effectiveUser, plan, context.client)
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
      const overlap = await validatePlanOverlap(context.client, plan.client_id, start_date, end_date, id);
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

    await context.client.clientWeeklyPlan.update({
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
  } finally {
    await dispose();
  }

  redirect(`/dashboard/weekly-plans/client-plans/${formData.get("id")}`);
}

export async function toggleClientPlanStatusAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireClassViewer();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.weekly_plans", write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return;

    const plan = await context.client.clientWeeklyPlan.findFirst({
      where: { id, tenant_id: context.tenantId },
    });
    if (!plan) return;

    const hasDirectAccess = canManageClientPlan(context.effectiveUser, plan);
    const hasTrainerAccess = !hasDirectAccess
      ? await canTrainerManagePlan(context.effectiveUser, plan, context.client)
      : false;
    if (!hasDirectAccess && !hasTrainerAccess) return;

    await context.client.clientWeeklyPlan.update({
      where: { id },
      data: { status: plan.status === "active" ? "inactive" : "active" },
    });

    revalidatePath("/dashboard/weekly-plans/client-plans");
    revalidatePath(`/dashboard/weekly-plans/client-plans/${id}`);
  } finally {
    await dispose();
  }
}

// ══════════════════════════════════════════════
// CLIENT WEEKLY PLAN DAYS
// ══════════════════════════════════════════════

export async function updateClientPlanDayAction(
  _prev: WeeklyPlanActionState,
  formData: FormData
): Promise<WeeklyPlanActionState> {
  const sessionUser = await requireClassViewer();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.weekly_plans", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const day_id = formData.get("day_id") as string;
    const plan_id = formData.get("plan_id") as string;
    if (!day_id || !plan_id) return { error: "IDs requeridos." };

    const plan = await context.client.clientWeeklyPlan.findFirst({
      where: { id: plan_id, tenant_id: context.tenantId },
    });
    if (!plan) return { error: "Plan no encontrado." };

    const hasDirectAccess = canManageClientPlan(context.effectiveUser, plan);
    const hasTrainerAccess = !hasDirectAccess
      ? await canTrainerManagePlan(context.effectiveUser, plan, context.client)
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

    await context.client.clientWeeklyPlanDay.update({
      where: { id: day_id },
      data: parsed.data,
    });
  } finally {
    await dispose();
  }

  revalidatePath(`/dashboard/weekly-plans/client-plans/${formData.get("plan_id")}`);
  redirect(`/dashboard/weekly-plans/client-plans/${formData.get("plan_id")}`);
}

export async function markClientPlanDayAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireClassViewer();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.weekly_plans", write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  try {
    const day_id = formData.get("day_id") as string;
    const plan_id = formData.get("plan_id") as string;
    if (!day_id || !plan_id) return;

    const plan = await context.client.clientWeeklyPlan.findFirst({
      where: { id: plan_id, tenant_id: context.tenantId },
    });
    if (!plan) return;

    const hasDirectAccess = canManageClientPlan(context.effectiveUser, plan);
    const hasTrainerAccess = !hasDirectAccess
      ? await canTrainerManagePlan(context.effectiveUser, plan, context.client)
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

    await context.client.clientWeeklyPlanDay.update({
      where: { id: day_id },
      data: {
        execution_status: parsed.data.execution_status,
        executed_at,
        trainer_feedback: parsed.data.trainer_feedback,
        client_feedback: parsed.data.client_feedback,
      },
    });

    revalidatePath(`/dashboard/weekly-plans/client-plans/${plan_id}`);
  } finally {
    await dispose();
  }
}

/** Añade un día manualmente al plan del cliente (cuando no vino de plantilla) */
export async function addClientPlanDayAction(
  _prev: WeeklyPlanActionState,
  formData: FormData
): Promise<WeeklyPlanActionState> {
  const sessionUser = await requireClassViewer();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.weekly_plans", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const plan_id = formData.get("plan_id") as string;
    if (!plan_id) return { error: "Plan requerido." };

    const plan = await context.client.clientWeeklyPlan.findFirst({
      where: { id: plan_id, tenant_id: context.tenantId },
    });
    if (!plan) return { error: "Plan no encontrado." };

    const hasDirectAccess = canManageClientPlan(context.effectiveUser, plan);
    const hasTrainerAccess = !hasDirectAccess
      ? await canTrainerManagePlan(context.effectiveUser, plan, context.client)
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

    const exists = await context.client.clientWeeklyPlanDay.findFirst({
      where: { client_weekly_plan_id: plan_id, weekday: parsed.data.weekday },
    });
    if (exists) {
      return {
        errors: {
          weekday: ["Ya existe un día para ese día de la semana en este plan."],
        },
      };
    }

    await context.client.clientWeeklyPlanDay.create({
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
  } finally {
    await dispose();
  }

  revalidatePath(`/dashboard/weekly-plans/client-plans/${formData.get("plan_id")}`);
  redirect(`/dashboard/weekly-plans/client-plans/${formData.get("plan_id")}`);
}

// ══════════════════════════════════════════════
// ASIGNACIÓN SEGMENTADA / MASIVA
// ══════════════════════════════════════════════

/**
 * Aplica una plantilla a todos los clientes activos con membresía vigente
 * que coincidan con el segmento indicado (sucursal, género, deporte, meta).
 *
 * Clientes con plan solapado en el mismo periodo se omiten (skipped).
 * Solo super_admin y branch_admin pueden ejecutar esta acción.
 */
export async function assignTemplateSegmentedAction(
  _prev: AssignSegmentedActionState,
  formData: FormData
): Promise<AssignSegmentedActionState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.weekly_plans", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const effectiveRole = context.effectiveUser.role;
    const raw = {
      template_id: formData.get("template_id"),
      branch_id: n(formData.get("branch_id")),
      trainer_id: n(formData.get("trainer_id")),
      start_date: formData.get("start_date"),
      end_date: formData.get("end_date"),
      target_gender: n(formData.get("target_gender")),
      target_sport_id: n(formData.get("target_sport_id")),
      target_goal_id: n(formData.get("target_goal_id")),
      notes: n(formData.get("notes")),
    };

    // branch_admin siempre opera en su propia sucursal
    if (effectiveRole === "branch_admin") {
      raw.branch_id = context.locationId ?? null;
    }

    const parsed = assignSegmentedSchema.safeParse(raw);
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

    const {
      template_id,
      branch_id,
      trainer_id,
      start_date,
      end_date,
      target_gender,
      target_sport_id,
      target_goal_id,
      notes,
    } = parsed.data;

    // Validar plantilla: debe existir, estar activa y ser accesible
    const template = await context.client.weeklyPlanTemplate.findFirst({
      where: { id: template_id, tenant_id: context.tenantId, status: "active" },
      include: { days: true },
    });
    if (!template) return { error: "Plantilla no encontrada o inactiva." };
    if (!canManageTemplate(context.effectiveUser, template)) {
      return { error: "Sin permiso para usar esta plantilla." };
    }

    // Validar entrenador si se indicó
    if (trainer_id) {
      const trainer = await context.client.trainer.findFirst({
        where: { id: trainer_id, tenant_id: context.tenantId },
      });
      if (!trainer) return { error: "Entrenador no encontrado." };
    }

    // Construir filtro de clientes
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const clientWhere: Record<string, unknown> = {
      tenant_id: context.tenantId,
      status: "active",
      memberships: {
        some: {
          status: "active",
          payment_status: { in: ["paid", "partial"] },
          start_date: { lte: today },
          end_date: { gte: today },
        },
      },
    };

    if (branch_id) {
      clientWhere.branch_id = branch_id;
    } else if (effectiveRole === "branch_admin") {
      clientWhere.branch_id = context.locationId!;
    }

    if (target_gender) clientWhere.gender = target_gender;
    if (target_sport_id) clientWhere.sport_id = target_sport_id;
    if (target_goal_id) clientWhere.goal_id = target_goal_id;

    const clients = await context.client.client.findMany({
      where: clientWhere,
      select: { id: true, branch_id: true },
    });

    if (clients.length === 0) {
      return {
        error:
          "No se encontraron clientes activos con membresía vigente que coincidan con el segmento indicado.",
      };
    }

    const start = new Date(start_date + "T00:00:00.000Z");
    const end = new Date(end_date + "T00:00:00.000Z");

    let assigned = 0;
    let skipped = 0;

    for (const client of clients) {
      // Verificar solapamiento con plan existente
      const overlap = await context.client.clientWeeklyPlan.findFirst({
        where: {
          client_id: client.id,
          status: { in: ["active", "suspended"] },
          start_date: { lte: end },
          end_date: { gte: start },
        },
        select: { id: true },
      });

      if (overlap) {
        skipped++;
        continue;
      }

      // Crear el plan — branch del cliente si no se especificó scope de sucursal
      const planBranchId = branch_id ?? client.branch_id;

      const newPlan = await context.client.clientWeeklyPlan.create({
        data: {
          gym_id: context.tenantId,
          tenant_id: context.tenantId,
          branch_id: planBranchId,
          client_id: client.id,
          trainer_id,
          template_id,
          start_date: start,
          end_date: end,
          notes,
          status: "active",
          assignment_type: "segmented",
        },
      });

      if (template.days.length > 0) {
        await context.client.clientWeeklyPlanDay.createMany({
          data: template.days.map((d) => ({
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

      assigned++;
    }

    revalidatePath("/dashboard/weekly-plans/client-plans");
    revalidatePath(`/dashboard/weekly-plans/templates/${template_id}`);

    return { assigned, skipped };
  } finally {
    await dispose();
  }
}

// ══════════════════════════════════════════════
// ELIMINACIÓN DEFINITIVA: PLANTILLA COMPLETA
// ══════════════════════════════════════════════

export async function deleteTemplateAction(
  _prev: DeleteAuthActionState,
  formData: FormData
): Promise<DeleteAuthActionState> {
  const sessionUser = await getSessionOrRedirect();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.weekly_plans", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return { error: "Datos inválidos" };

    const template = await context.client.weeklyPlanTemplate.findFirst({
      where: { id, tenant_id: context.tenantId },
      include: { _count: { select: { client_plans: true } } },
    });

    if (!template) return { error: "Plantilla no encontrada." };
    if (!canManageTemplate(context.effectiveUser, template)) {
      return { error: "Sin permisos para gestionar esta plantilla." };
    }

    if (template._count.client_plans > 0) {
      return {
        error: `No se puede eliminar: hay ${template._count.client_plans} plan(es) de clientes que usan esta plantilla. Desactívala en su lugar.`,
      };
    }

    const auth = await checkDeleteAuth(
      formData,
      { role: context.effectiveUser.role as UserRole, tenant_id: context.tenantId },
      context.client,
    );
    if (!auth.ok) return { error: auth.error };

    await context.client.$transaction(async (tx) => {
      await tx.weeklyPlanTemplateDay.deleteMany({ where: { template_id: id } });
      await tx.weeklyPlanTemplate.delete({ where: { id } });
    });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/weekly-plans/templates");
  redirect("/dashboard/weekly-plans/templates");
}

// ══════════════════════════════════════════════
// ELIMINACIÓN DEFINITIVA: PLAN SEMANAL DE CLIENTE
// ══════════════════════════════════════════════

export async function deleteClientPlanAction(
  _prev: DeleteAuthActionState,
  formData: FormData
): Promise<DeleteAuthActionState> {
  const sessionUser = await getSessionOrRedirect();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.weekly_plans", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return { error: "Datos inválidos" };

    const plan = await context.client.clientWeeklyPlan.findFirst({
      where: { id, tenant_id: context.tenantId },
    });

    if (!plan) return { error: "Plan no encontrado." };

    const hasScope =
      canManageClientPlan(context.effectiveUser, plan) ||
      (await canTrainerManagePlan(context.effectiveUser, plan, context.client));

    if (!hasScope) {
      return { error: "Sin permisos para gestionar este plan." };
    }

    const auth = await checkDeleteAuth(
      formData,
      { role: context.effectiveUser.role as UserRole, tenant_id: context.tenantId },
      context.client,
    );
    if (!auth.ok) return { error: auth.error };

    await context.client.$transaction(async (tx) => {
      await tx.clientWeeklyPlanDay.deleteMany({
        where: { client_weekly_plan_id: id },
      });
      await tx.clientWeeklyPlan.delete({ where: { id } });
    });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/weekly-plans/client-plans");
  redirect("/dashboard/weekly-plans/client-plans");
}
