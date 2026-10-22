"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
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
  recordExecutionSchema,
  assignSegmentedSchema,
} from "./schemas";
import { PLAN_TRAINING_ROLES, authorizePlan, authorizePlanDay } from "./plan-access";
import { TIMEZONE_NOT_CONFIGURED_MESSAGE, resolveGymClock } from "./gym-clock";
import { recordTrainerExecution } from "./training-execution-service";
import { hasOrganizationModule } from "@/modules/platform/runtime/commercial-enforcement/module-guard";
import {
  PLAN_OVERLAP_MESSAGE,
  createPlanWithDays,
  resolveApplicableTemplate,
  resolveAssignableTrainer,
  resolveTenantBranch,
  togglePlanStatusChecked,
  updatePlanChecked,
} from "./plan-service";
import { liveLocationMatches, LIVE_IDENTITY_CHANGED_MESSAGE, resolveLinkedTrainer } from "@/modules/classes/trainer/trainer-access";
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
    // El gate de sesión (requireAdmin) usa el rol del JWT; la autorización real
    // es el rol y la sede LIVE (misma regla que la asignación segmentada).
    const liveRole = context.effectiveUser.role;
    if (liveRole !== "super_admin" && liveRole !== "branch_admin") {
      return { error: "Sin permiso para crear plantillas." };
    }
    if (!(await liveLocationMatches({
      runtimeMode: context.runtimeMode,
      client: context.client,
      userId: context.effectiveUser.id,
      role: liveRole,
      locationId: context.locationId,
    }))) {
      return { error: LIVE_IDENTITY_CHANGED_MESSAGE };
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

    if (!context.gymId) {
      return { error: "El módulo GYM no está configurado para esta organización." };
    }

    await context.client.weeklyPlanTemplate.create({
      data: {
        gym_id: context.gymId,
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

    // Rol LIVE y sede vigente (misma regla que GYM-4 H01 para roles acotados a sede).
    if (!["super_admin", "branch_admin", "reception", "trainer"].includes(effectiveRole)) {
      return { error: "Sin permiso para asignar planes." };
    }
    if (!(await liveLocationMatches({
      runtimeMode: context.runtimeMode,
      client: context.client,
      userId: context.effectiveUser.id,
      role: effectiveRole,
      locationId: context.locationId,
    }))) {
      return { error: LIVE_IDENTITY_CHANGED_MESSAGE };
    }

    // Scope: branch_admin/reception solo crean en su sucursal
    if (
      (effectiveRole === "branch_admin" || effectiveRole === "reception") &&
      raw.branch_id !== context.locationId
    ) {
      return { error: "Solo puedes asignar planes en tu propia sucursal." };
    }

    // El entrenador solo asigna planes a SU perfil y en SU sede.
    if (effectiveRole === "trainer") {
      const me = await resolveLinkedTrainer(context.client, context.effectiveUser.id, context.tenantId);
      if (!me) return { error: "Tu cuenta no tiene un perfil de entrenador activo vinculado." };
      if (raw.branch_id !== me.branch_id) return { error: "Solo puedes asignar planes en tu propia sucursal." };
      if (raw.trainer_id !== null && raw.trainer_id !== me.id) {
        return { error: "Solo puedes asignarte planes a ti mismo." };
      }
      raw.trainer_id = me.id;
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

    // GYM-5A: sede del tenant y coherente con la sede del alumno.
    if (!(await resolveTenantBranch(context.client, context.tenantId, branch_id))) {
      return { error: "Sucursal no encontrada." };
    }
    if (client.branch_id !== branch_id) {
      return { error: "La sede del plan debe coincidir con la sede del alumno." };
    }

    // Entrenador activo del tenant y de la sede del plan
    if (trainer_id) {
      const t = await resolveAssignableTrainer(context.client, context.tenantId, trainer_id, branch_id);
      if (!t.ok) return { error: t.error };
    }

    // Plantilla activa del tenant y aplicable a la sede
    let template = null;
    if (template_id) {
      const t = await resolveApplicableTemplate(context.client, context.tenantId, template_id, branch_id);
      if (!t.ok) return { error: t.error };
      template = t.template;
    }

    if (!context.gymId) {
      return { error: "El módulo GYM no está configurado para esta organización." };
    }

    // Plan + días en una transacción; solapamiento validado bajo bloqueo del alumno.
    let created;
    try {
      created = await createPlanWithDays(context.client, {
        gymId: context.gymId,
        tenantId: context.tenantId,
        branchId: branch_id,
        clientId: client_id,
        trainerId: trainer_id ?? null,
        template,
        startDate: start_date,
        endDate: end_date,
        notes: notes ?? null,
        assignmentType: "individual",
      });
    } catch {
      return { error: "No se pudo crear el plan. Intenta de nuevo." };
    }
    if (!created.ok) {
      return { errors: { start_date: [PLAN_OVERLAP_MESSAGE] } };
    }

    revalidatePath("/dashboard/weekly-plans/client-plans");
    redirect(`/dashboard/weekly-plans/client-plans/${created.plan.id}`);
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

    const access = await authorizePlan(context, id);
    if (!access.ok) return { error: access.error };
    const plan = access.plan;

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

    // Cambio de entrenador: el entrenador no reasigna su propio plan; el
    // entrenador nuevo debe ser activo, del tenant y de la sede del plan.
    let trainerId = parsed.data.trainer_id ?? null;
    if (trainerId !== plan.trainer_id) {
      if (access.scope === "trainer") {
        return { error: "Solo administración puede cambiar el entrenador del plan." };
      }
      if (trainerId) {
        const t = await resolveAssignableTrainer(context.client, context.tenantId, trainerId, plan.branch_id);
        if (!t.ok) return { error: t.error };
      }
    }
    if (access.scope === "trainer") trainerId = plan.trainer_id;

    // Solapamiento revalidado bajo bloqueo del alumno (transacción).
    let updated;
    try {
      updated = await updatePlanChecked(context.client, {
        planId: plan.id,
        clientId: plan.client_id,
        trainerId,
        startDate: start_date,
        endDate: end_date,
        status: parsed.data.status,
        notes: parsed.data.notes ?? null,
      });
    } catch {
      return { error: "No se pudo actualizar el plan. Intenta de nuevo." };
    }
    if (!updated.ok) return { errors: { start_date: [PLAN_OVERLAP_MESSAGE] } };

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

    const access = await authorizePlan(context, id);
    if (!access.ok) return;
    const plan = access.plan;

    // GYM-5A: al reactivar se revalida el solapamiento bajo bloqueo del alumno.
    await togglePlanStatusChecked(context.client, { id: plan.id, client_id: plan.client_id });

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

    // GYM-5A: el día debe pertenecer EXACTAMENTE al plan autorizado.
    const access = await authorizePlanDay(context, plan_id, day_id);
    if (!access.ok) return { error: access.error };

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

    const updated = await context.client.clientWeeklyPlanDay.updateMany({
      where: { id: access.day.id, client_weekly_plan_id: access.plan.id },
      data: parsed.data,
    });
    if (updated.count !== 1) return { error: "Día de plan no encontrado." };
  } finally {
    await dispose();
  }

  revalidatePath(`/dashboard/weekly-plans/client-plans/${formData.get("plan_id")}`);
  redirect(`/dashboard/weekly-plans/client-plans/${formData.get("plan_id")}`);
}

// GYM-5A: reemplaza a markClientPlanDayAction (una sola fila de estado por
// weekday, sin fecha ni procedencia). El registro del entrenador ahora es
// POR FECHA LOCAL del gimnasio, conserva el autorreporte del alumno y deja
// bitácora. Los campos heredados de ClientWeeklyPlanDay no se modifican.
export type ExecutionActionState =
  | { error?: string; errors?: Record<string, string[]>; ok?: true; unchanged?: true }
  | undefined;

export async function recordPlanExecutionAction(
  _prev: ExecutionActionState,
  formData: FormData
): Promise<ExecutionActionState> {
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
    const raw = {
      plan_id: formData.get("plan_id"),
      day_id: formData.get("day_id"),
      local_date: formData.get("local_date"),
      execution_status: formData.get("execution_status"),
      trainer_feedback: n(formData.get("trainer_feedback")),
      reason: n(formData.get("reason")),
      attendance_id: n(formData.get("attendance_id")),
      expected_revision: n(formData.get("expected_revision")),
    };
    const parsed = recordExecutionSchema.safeParse(raw);
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
    const input = parsed.data;

    // Registro del entrenador: super_admin, branch_admin o el entrenador asignado al plan.
    const access = await authorizePlanDay(context, input.plan_id, input.day_id, {
      roles: PLAN_TRAINING_ROLES,
      statuses: ["active", "inactive", "suspended"],
    });
    if (!access.ok) return { error: access.error };

    // Vincular/desvincular asistencia exige además el módulo de clases (lee datos GYM-4).
    const attendanceRequested = input.attendance_id != null || formData.get("unlink_attendance") === "1";
    if (attendanceRequested) {
      const ctx = context.commercialContext;
      if (!ctx || !hasOrganizationModule(ctx, "gym.classes")) {
        return { error: "El módulo de clases no está habilitado para vincular asistencias." };
      }
    }

    const clock = await resolveGymClock(context.client, context.tenantId);
    if (!clock) return { error: TIMEZONE_NOT_CONFIGURED_MESSAGE };

    const result = await recordTrainerExecution(context.client, {
      tenantId: context.tenantId,
      planId: access.plan.id,
      planDayId: access.day.id,
      localDate: input.local_date,
      status: input.execution_status,
      feedback: input.trainer_feedback ?? null,
      reason: input.reason ?? null,
      attendanceId: input.attendance_id ? input.attendance_id : formData.get("unlink_attendance") === "1" ? null : undefined,
      expectedRevision: input.expected_revision ?? null,
      actor: { userId: context.effectiveUser.id, role: context.effectiveUser.role },
      timezone: clock.timezone,
      today: clock.today,
    });
    if (!result.ok) return { error: result.message };

    revalidatePath(`/dashboard/weekly-plans/client-plans/${access.plan.id}`);
    revalidatePath("/portal/plan-semanal");
    return result.changed ? { ok: true } : { ok: true, unchanged: true };
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

    const access = await authorizePlan(context, plan_id);
    if (!access.ok) return { error: access.error };

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

    if (effectiveRole !== "super_admin" && effectiveRole !== "branch_admin") {
      return { error: "Sin permiso para asignar planes de forma masiva." };
    }
    if (!(await liveLocationMatches({
      runtimeMode: context.runtimeMode,
      client: context.client,
      userId: context.effectiveUser.id,
      role: effectiveRole,
      locationId: context.locationId,
    }))) {
      return { error: LIVE_IDENTITY_CHANGED_MESSAGE };
    }

    // branch_admin siempre opera en su propia sucursal
    if (effectiveRole === "branch_admin") {
      raw.branch_id = context.locationId ?? null;
    }

    const parsed = assignSegmentedSchema.safeParse(raw);
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

    if (!context.gymId) {
      return { error: "El módulo GYM no está configurado para esta organización." };
    }

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

    // Sede de operación del lote: la del admin de sede, la indicada o la del entrenador.
    let scopeBranchId: string | null = branch_id ?? null;

    // Entrenador activo del tenant; con entrenador, el lote queda en SU sede.
    if (trainer_id) {
      const trainer = await context.client.trainer.findFirst({ where: { id: trainer_id, tenant_id: context.tenantId } });
      if (!trainer) return { error: "Entrenador no encontrado." };
      if (trainer.status !== "active") return { error: "El entrenador seleccionado está inactivo." };
      if (scopeBranchId && scopeBranchId !== trainer.branch_id) {
        return { error: "El entrenador no pertenece a la sede indicada." };
      }
      scopeBranchId = trainer.branch_id;
    }
    // La plantilla restringida a una sede solo aplica a esa sede.
    if (template.branch_id) {
      if (scopeBranchId && scopeBranchId !== template.branch_id) {
        return { error: "La plantilla no es aplicable a la sede indicada." };
      }
      scopeBranchId = template.branch_id;
    }
    if (effectiveRole === "branch_admin" && scopeBranchId !== context.locationId) {
      return { error: "Solo puedes asignar planes en tu propia sucursal." };
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

    if (scopeBranchId) clientWhere.branch_id = scopeBranchId;

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

    let assigned = 0;
    let skipped = 0;

    // Un alumno por transacción: cada una bloquea UNA fila (sin deadlocks) y
    // revalida el solapamiento bajo bloqueo; un fallo aislado no deja medio lote.
    for (const client of clients) {
      try {
        const created = await createPlanWithDays(context.client, {
          gymId: context.gymId,
          tenantId: context.tenantId,
          branchId: client.branch_id,
          clientId: client.id,
          trainerId: trainer_id ?? null,
          template,
          startDate: start_date,
          endDate: end_date,
          notes: notes ?? null,
          assignmentType: "segmented",
        });
        if (created.ok) assigned++;
        else skipped++;
      } catch {
        skipped++;
      }
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

    const access = await authorizePlan(context, id);
    if (!access.ok) return { error: access.error };

    // GYM-5A: el historial de ejecuciones no se borra físicamente; se desactiva el plan.
    const executions = await context.client.clientPlanDayExecution.count({
      where: { plan_id: access.plan.id, tenant_id: context.tenantId },
    });
    if (executions > 0) {
      return { error: `No se puede eliminar: el plan tiene ${executions} ejecución(es) registrada(s). Desactívalo en su lugar.` };
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
