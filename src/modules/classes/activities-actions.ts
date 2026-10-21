"use server";

// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3A — catálogo de actividades (GymActivity, 2A).
//
// Sin borrado físico (preserva ScheduledClassActivity /
// ClassAttendanceActivity): solo alta, edición y activar/desactivar.
//  - location_id NULL = actividad de todas las sedes: solo super_admin.
//  - branch_admin: solo actividades de su sucursal.
//  - Unicidad de código y nombre por tenant (índices de 2A).
//  - Cambiar una actividad ya usada a otra sede lo rechaza el trigger de 2A.
// Registrar actividades impartidas (entrenador) queda para la Etapa 4.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/permissions/guards";
import {
  requireOperationalContext,
  OperationalContextError,
  type OperationalContextHandle,
} from "@/modules/platform/runtime/require-operational-context";
import { gymActivitySchema } from "./schemas";
import {
  gymAdminDbErrorMessage,
  gymAdminScope,
  isUniqueViolation,
  scopeCoversLocation,
  uniqueViolationFields,
} from "./scheduling/admin-support";

export type ActivityActionState = { errors?: Record<string, string[]>; error?: string } | undefined;

function n(v: FormDataEntryValue | null): string | null {
  const s = v as string | null;
  return !s || s.trim() === "" ? null : s.trim();
}

async function openActivitiesWriteContext(): Promise<
  { ok: true; handle: OperationalContextHandle } | { ok: false; error: string }
> {
  const sessionUser = await requireAdmin();
  try {
    return { ok: true, handle: await requireOperationalContext(sessionUser, { module: "gym.classes", write: true }) };
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
}

function parseActivity(formData: FormData) {
  return gymActivitySchema.safeParse({
    code: n(formData.get("code")),
    name: formData.get("name"),
    description: n(formData.get("description")),
    location_id: n(formData.get("location_id")),
    sort_order: n(formData.get("sort_order")) ?? 0,
  });
}

function uniqueError(err: unknown): ActivityActionState | null {
  if (!isUniqueViolation(err)) return null;
  const fields = uniqueViolationFields(err);
  if (fields.includes("code")) return { errors: { code: ["Ya existe una actividad con este código."] } };
  return { errors: { name: ["Ya existe una actividad con este nombre."] } };
}

export async function createGymActivityAction(
  _prev: ActivityActionState,
  formData: FormData
): Promise<ActivityActionState> {
  const opened = await openActivitiesWriteContext();
  if (!opened.ok) return { error: opened.error };
  const { context, dispose } = opened.handle;

  try {
    const scope = gymAdminScope(context);
    if (!scope.ok) return { error: scope.error };

    const parsed = parseActivity(formData);
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
    const data = parsed.data;
    // BA: siempre su sede (nunca global ni otra sede), sin confiar en el formulario.
    const locationId = scope.isGlobal ? (data.location_id ?? null) : scope.locationId;
    if (!scope.isGlobal && data.location_id && data.location_id !== scope.locationId) {
      return { error: "Solo puedes crear actividades para tu propia sucursal." };
    }
    if (locationId) {
      const branch = await context.client.branch.findFirst({ where: { id: locationId, tenant_id: context.tenantId } });
      if (!branch) return { errors: { location_id: ["Sucursal no encontrada."] } };
    }

    try {
      await context.client.gymActivity.create({
        data: {
          tenant_id: context.tenantId,
          location_id: locationId,
          code: data.code ?? null,
          name: data.name,
          description: data.description ?? null,
          sort_order: data.sort_order,
          status: "active",
          created_by: context.effectiveUser.id,
          updated_by: context.effectiveUser.id,
        },
      });
    } catch (err) {
      const failure = uniqueError(err);
      if (failure) return failure;
      const message = gymAdminDbErrorMessage(err);
      if (message) return { error: message };
      throw err;
    }
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/classes/activities");
  redirect("/dashboard/classes/activities");
}

export async function updateGymActivityAction(
  _prev: ActivityActionState,
  formData: FormData
): Promise<ActivityActionState> {
  const opened = await openActivitiesWriteContext();
  if (!opened.ok) return { error: opened.error };
  const { context, dispose } = opened.handle;

  try {
    const id = formData.get("id");
    if (typeof id !== "string" || !id) return { error: "ID requerido." };
    const scope = gymAdminScope(context);
    if (!scope.ok) return { error: scope.error };

    const activity = await context.client.gymActivity.findFirst({ where: { id, tenant_id: context.tenantId } });
    if (!activity || !scopeCoversLocation(scope, activity.location_id)) return { error: "Actividad no encontrada." };

    const parsed = parseActivity(formData);
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
    const data = parsed.data;
    // BA no cambia la sede (ni a global ni a otra sede).
    const locationId = scope.isGlobal ? (data.location_id ?? null) : activity.location_id;
    if (locationId && locationId !== activity.location_id) {
      const branch = await context.client.branch.findFirst({ where: { id: locationId, tenant_id: context.tenantId } });
      if (!branch) return { errors: { location_id: ["Sucursal no encontrada."] } };
    }

    try {
      await context.client.gymActivity.update({
        where: { id },
        data: {
          location_id: locationId,
          code: data.code ?? null,
          name: data.name,
          description: data.description ?? null,
          sort_order: data.sort_order,
          updated_by: context.effectiveUser.id,
        },
      });
    } catch (err) {
      const failure = uniqueError(err);
      if (failure) return failure;
      const message = gymAdminDbErrorMessage(err);
      if (message) {
        return {
          error: /GYM_DEPENDENT_LOCATION_CONFLICT/.test(String((err as Error)?.message ?? ""))
            ? "La actividad ya se usó en sesiones de otra sucursal: no puede asignarse a esa sede. Crea una actividad nueva."
            : message,
        };
      }
      throw err;
    }
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/classes/activities");
  redirect("/dashboard/classes/activities");
}

export async function toggleGymActivityStatusAction(formData: FormData): Promise<void> {
  const opened = await openActivitiesWriteContext();
  if (!opened.ok) return;
  const { context, dispose } = opened.handle;

  try {
    const id = formData.get("id");
    if (typeof id !== "string" || !id) return;
    const scope = gymAdminScope(context);
    if (!scope.ok) return;

    const activity = await context.client.gymActivity.findFirst({ where: { id, tenant_id: context.tenantId } });
    if (!activity || !scopeCoversLocation(scope, activity.location_id)) return;

    await context.client.gymActivity.update({
      where: { id },
      data: { status: activity.status === "active" ? "inactive" : "active", updated_by: context.effectiveUser.id },
    });
    revalidatePath("/dashboard/classes/activities");
  } finally {
    await dispose();
  }
}
