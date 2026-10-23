"use server";

// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3A — administración de series recurrentes (ClassSeries).
//
// Gate: requireAdmin (JWT) → requireOperationalContext(gym.classes, write)
// → alcance LIVE (gymAdminScope). La generación de sesiones es explícita
// (sin cron) y delega en generateSeriesSessions (idempotente).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/permissions/guards";
import {
  OperationalContextError,
  type OperationalContextHandle,
} from "@/modules/platform/runtime/require-operational-context";
import { requireLiveOperationalContext } from "@/modules/platform/runtime/require-live-operational-context";
import { createClassSeriesSchema, updateClassSeriesSchema } from "./schemas";
import { loadGymBookingPolicy } from "./booking/booking-service";
import { dateOnly } from "./booking/booking-eligibility";
import { dbDate, resolveSessionSetup } from "./scheduling/scheduling-rules";
import { generateSeriesSessions, type SeriesGenerationReport } from "./scheduling/series-service";
import { gymAdminDbErrorMessage, gymAdminScope, scopeCoversLocation } from "./scheduling/admin-support";

export type SeriesActionState =
  | { errors?: Record<string, string[]>; error?: string; success?: string; report?: SeriesGenerationReport }
  | undefined;

function n(v: FormDataEntryValue | null): string | null {
  const s = v as string | null;
  return !s || s.trim() === "" ? null : s.trim();
}

async function openClassesWriteContext(): Promise<{ ok: true; handle: OperationalContextHandle } | { ok: false; error: string }> {
  const sessionUser = await requireAdmin();
  try {
    return { ok: true, handle: await requireLiveOperationalContext(sessionUser, { module: "gym.classes", write: true }) };
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
}

export async function createClassSeriesAction(
  _prev: SeriesActionState,
  formData: FormData
): Promise<SeriesActionState> {
  const opened = await openClassesWriteContext();
  if (!opened.ok) return { error: opened.error };
  const { context, dispose } = opened.handle;

  let seriesId: string;
  try {
    const scope = gymAdminScope(context);
    if (!scope.ok) return { error: scope.error };

    const parsed = createClassSeriesSchema.safeParse({
      location_id: scope.isGlobal ? formData.get("location_id") : scope.locationId,
      class_type_id: formData.get("class_type_id"),
      trainer_id: formData.get("trainer_id"),
      session_kind: formData.get("session_kind"),
      title: formData.get("title"),
      weekday: formData.get("weekday"),
      start_time: formData.get("start_time"),
      end_time: formData.get("end_time"),
      capacity: n(formData.get("capacity")),
      room_name: n(formData.get("room_name")),
      valid_from: formData.get("valid_from"),
      valid_until: n(formData.get("valid_until")),
    });
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
    const data = parsed.data;
    if (!scopeCoversLocation(scope, data.location_id)) {
      return { error: "Solo puedes crear series en tu propia sucursal." };
    }

    const [branch, classType, trainer, policy] = await Promise.all([
      context.client.branch.findFirst({ where: { id: data.location_id, tenant_id: context.tenantId, status: "active" } }),
      context.client.classType.findFirst({ where: { id: data.class_type_id, tenant_id: context.tenantId } }),
      context.client.trainer.findFirst({ where: { id: data.trainer_id, tenant_id: context.tenantId } }),
      loadGymBookingPolicy(context.client, context.tenantId),
    ]);
    if (!branch) return { errors: { location_id: ["Sucursal no encontrada."] } };
    if (!classType || classType.status !== "active") return { errors: { class_type_id: ["Tipo de clase no encontrado o inactivo."] } };
    if (!trainer || trainer.status !== "active") return { errors: { trainer_id: ["Entrenador no encontrado o inactivo."] } };
    if (trainer.branch_id !== data.location_id) {
      return { errors: { trainer_id: ["El entrenador debe pertenecer a la sucursal de la serie."] } };
    }

    // Mismas reglas de tipo y cupo que el alta manual (R18/R19).
    const setup = resolveSessionSetup({
      kind: data.session_kind,
      policy,
      date: data.valid_from,
      startTime: data.start_time,
      endTime: data.end_time,
      seriesCapacity: data.capacity,
      trainerPersonalizedCapacity: trainer.personalized_capacity,
      classTypeCapacityDefault: classType.capacity_default,
    });
    if (!setup.ok) return { errors: { [setup.field]: [setup.message] } };

    try {
      const created = await context.client.classSeries.create({
        data: {
          tenant_id: context.tenantId,
          location_id: data.location_id,
          class_type_id: data.class_type_id,
          trainer_id: data.trainer_id,
          session_kind: data.session_kind,
          title: data.title,
          weekday: data.weekday,
          start_time: data.start_time,
          end_time: data.end_time,
          capacity: data.capacity ?? null,
          room_name: data.room_name ?? null,
          valid_from: dbDate(data.valid_from),
          valid_until: data.valid_until ? dbDate(data.valid_until) : null,
          status: "active",
          created_by: context.effectiveUser.id,
          updated_by: context.effectiveUser.id,
        },
        select: { id: true },
      });
      seriesId = created.id;
    } catch (err) {
      const message = gymAdminDbErrorMessage(err);
      if (message) return { error: message };
      throw err;
    }
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/classes/series");
  redirect(`/dashboard/classes/series/${seriesId}`);
}

export async function updateClassSeriesAction(
  _prev: SeriesActionState,
  formData: FormData
): Promise<SeriesActionState> {
  const opened = await openClassesWriteContext();
  if (!opened.ok) return { error: opened.error };
  const { context, dispose } = opened.handle;

  const id = formData.get("id");
  try {
    if (typeof id !== "string" || !id) return { error: "ID requerido." };
    const scope = gymAdminScope(context);
    if (!scope.ok) return { error: scope.error };

    const series = await context.client.classSeries.findFirst({ where: { id, tenant_id: context.tenantId } });
    if (!series || !scopeCoversLocation(scope, series.location_id)) return { error: "Serie no encontrada." };

    const parsed = updateClassSeriesSchema.safeParse({
      title: formData.get("title"),
      capacity: n(formData.get("capacity")),
      room_name: n(formData.get("room_name")),
      valid_until: n(formData.get("valid_until")),
    });
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
    const data = parsed.data;
    if (data.valid_until && data.valid_until < dateOnly(series.valid_from)) {
      return { errors: { valid_until: ["La vigencia final no puede ser anterior al inicio"] } };
    }

    try {
      // Solo la plantilla: las sesiones ya generadas conservan sus valores.
      await context.client.classSeries.update({
        where: { id },
        data: {
          title: data.title,
          capacity: data.capacity ?? null,
          room_name: data.room_name ?? null,
          valid_until: data.valid_until ? dbDate(data.valid_until) : null,
          updated_by: context.effectiveUser.id,
        },
      });
    } catch (err) {
      const message = gymAdminDbErrorMessage(err);
      if (message) return { error: message };
      throw err;
    }
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/classes/series");
  revalidatePath(`/dashboard/classes/series/${id}`);
  redirect(`/dashboard/classes/series/${id}`);
}

/** Activa / desactiva la serie. Desactivar NO cancela las sesiones ya generadas. */
export async function toggleClassSeriesStatusAction(
  _prev: SeriesActionState,
  formData: FormData
): Promise<SeriesActionState> {
  const opened = await openClassesWriteContext();
  if (!opened.ok) return { error: opened.error };
  const { context, dispose } = opened.handle;

  try {
    const id = formData.get("id");
    if (typeof id !== "string" || !id) return { error: "ID requerido." };
    const scope = gymAdminScope(context);
    if (!scope.ok) return { error: scope.error };

    const series = await context.client.classSeries.findFirst({ where: { id, tenant_id: context.tenantId } });
    if (!series || !scopeCoversLocation(scope, series.location_id)) return { error: "Serie no encontrada." };

    const next = series.status === "active" ? "inactive" : "active";
    try {
      await context.client.classSeries.update({
        where: { id },
        data: { status: next, updated_by: context.effectiveUser.id },
      });
    } catch (err) {
      const message = gymAdminDbErrorMessage(err);
      if (message) return { error: message };
      throw err;
    }
    revalidatePath("/dashboard/classes/series");
    revalidatePath(`/dashboard/classes/series/${id}`);
    return { success: next === "active" ? "Serie activada." : "Serie desactivada. Las sesiones ya generadas no se modificaron." };
  } finally {
    await dispose();
  }
}

/** Genera las próximas sesiones (ventana series_generation_weeks). Idempotente. */
export async function generateClassSeriesSessionsAction(
  _prev: SeriesActionState,
  formData: FormData
): Promise<SeriesActionState> {
  const opened = await openClassesWriteContext();
  if (!opened.ok) return { error: opened.error };
  const { context, dispose } = opened.handle;

  try {
    const id = formData.get("id");
    if (typeof id !== "string" || !id) return { error: "ID requerido." };
    const scope = gymAdminScope(context);
    if (!scope.ok) return { error: scope.error };
    if (!context.gymId) return { error: "El módulo GYM no está configurado para esta organización." };

    const series = await context.client.classSeries.findFirst({
      where: { id, tenant_id: context.tenantId },
      select: { location_id: true },
    });
    if (!series || !scopeCoversLocation(scope, series.location_id)) return { error: "Serie no encontrada." };

    let result;
    try {
      result = await generateSeriesSessions(context.client, {
        tenantId: context.tenantId,
        gymId: context.gymId,
        seriesId: id,
        actorUserId: context.effectiveUser.id,
      });
    } catch (err) {
      if (String((err as Error)?.message ?? "").includes("GYM_SERIES_GENERATION_RACE")) {
        return { error: "Otra operación generó sesiones de esta serie al mismo tiempo. Intenta nuevamente." };
      }
      const message = gymAdminDbErrorMessage(err);
      if (message) return { error: message };
      throw err;
    }
    if (!result.ok) return { error: result.error };

    revalidatePath("/dashboard/classes");
    revalidatePath(`/dashboard/classes/series/${id}`);
    const r = result.report;
    return {
      success: `Sesiones creadas: ${r.created.length} · ya existentes: ${r.skippedExisting.length} · con conflicto: ${r.conflicts.length}.`,
      report: r,
    };
  } finally {
    await dispose();
  }
}
