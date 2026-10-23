"use server";

// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3A — ausencias del entrenador (TrainerTimeOff, 2A).
//
// La disponibilidad semanal (TrainerAvailability) no cambia: la ausencia
// es una excepción por fecha. Reglas:
//  - SA en todo el tenant, BA solo entrenadores de su sucursal (rol LIVE).
//  - location_id = sede actual del entrenador (trigger de 2A; la ausencia
//    sigue al entrenador si cambia de sede).
//  - Validación bajo trainers FOR UPDATE (mismo lock que programar clases
//    y generar series): una clase y una ausencia simultáneas se serializan.
//  - Sesiones afectadas: la ausencia se RECHAZA y se listan. Nunca se
//    cancelan sesiones ni reservas automáticamente (sin regla aprobada).
//  - Sin borrado físico: desactivar (status inactive).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/permissions/guards";
import {
  OperationalContextError,
  type OperationalContextHandle,
} from "@/modules/platform/runtime/require-operational-context";
import { requireLiveOperationalContext } from "@/modules/platform/runtime/require-live-operational-context";
import { trainerTimeOffSchema, type TrainerTimeOffInput } from "./schemas";
import { lockTrainerForScheduling } from "@/modules/classes/scheduling/scheduling-guards";
import { dbDate, timeOffCoversSlot, timeOffWindowsOverlap } from "@/modules/classes/scheduling/scheduling-rules";
import { dateOnly } from "@/modules/classes/booking/booking-eligibility";
import { gymAdminDbErrorMessage, gymAdminScope, scopeCoversLocation } from "@/modules/classes/scheduling/admin-support";

export type TimeOffActionState =
  | { errors?: Record<string, string[]>; error?: string; success?: string; conflicts?: string[] }
  | undefined;

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20_000, maxWait: 15_000 };
const MAX_LISTED_CONFLICTS = 10;

function n(v: FormDataEntryValue | null): string | null {
  const s = v as string | null;
  return !s || s.trim() === "" ? null : s.trim();
}

async function openTrainersWriteContext(): Promise<
  { ok: true; handle: OperationalContextHandle } | { ok: false; error: string }
> {
  const sessionUser = await requireAdmin();
  try {
    return { ok: true, handle: await requireLiveOperationalContext(sessionUser, { module: "gym.trainers", write: true }) };
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
}

function parseTimeOff(formData: FormData) {
  return trainerTimeOffSchema.safeParse({
    trainer_id: formData.get("trainer_id"),
    starts_on: formData.get("starts_on"),
    ends_on: formData.get("ends_on"),
    start_time: n(formData.get("start_time")),
    end_time: n(formData.get("end_time")),
    reason: n(formData.get("reason")),
  });
}

/** Solapamiento con otra ausencia activa y con sesiones vigentes del entrenador. */
async function timeOffWindowFailure(
  tx: Prisma.TransactionClient,
  tenantId: string,
  data: TrainerTimeOffInput,
  excludeId?: string
): Promise<TimeOffActionState | null> {
  const window = {
    starts_on: dbDate(data.starts_on),
    ends_on: dbDate(data.ends_on),
    start_time: data.start_time ?? null,
    end_time: data.end_time ?? null,
  };

  const others = await tx.trainerTimeOff.findMany({
    where: {
      tenant_id: tenantId,
      trainer_id: data.trainer_id,
      status: "active",
      starts_on: { lte: window.ends_on },
      ends_on: { gte: window.starts_on },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { starts_on: true, ends_on: true, start_time: true, end_time: true },
  });
  if (others.some((o) => timeOffWindowsOverlap(o, window))) {
    return { errors: { starts_on: ["Se cruza con otra ausencia activa del entrenador."] } };
  }

  const sessions = await tx.scheduledClass.findMany({
    where: {
      trainer_id: data.trainer_id,
      status: { in: ["scheduled", "in_progress"] },
      class_date: { gte: window.starts_on, lte: window.ends_on },
    },
    select: { title: true, class_date: true, start_time: true, end_time: true, booked_count: true },
    orderBy: [{ class_date: "asc" }, { start_time: "asc" }],
  });
  const affected = sessions.filter((s) => timeOffCoversSlot(window, dateOnly(s.class_date), s.start_time, s.end_time));
  if (affected.length > 0) {
    return {
      error: `La ausencia afecta ${affected.length} sesión(es) programada(s) del entrenador. Reasígnalas o cancélalas desde la agenda y vuelve a intentarlo.`,
      conflicts: affected
        .slice(0, MAX_LISTED_CONFLICTS)
        .map(
          (s) =>
            `${dateOnly(s.class_date)} ${s.start_time}–${s.end_time} · ${s.title} · ${s.booked_count} reserva(s) confirmada(s)`
        ),
    };
  }
  return null;
}

export async function createTrainerTimeOffAction(
  _prev: TimeOffActionState,
  formData: FormData
): Promise<TimeOffActionState> {
  const opened = await openTrainersWriteContext();
  if (!opened.ok) return { error: opened.error };
  const { context, dispose } = opened.handle;

  try {
    const scope = gymAdminScope(context);
    if (!scope.ok) return { error: scope.error };
    const parsed = parseTimeOff(formData);
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
    const data = parsed.data;

    let failure: TimeOffActionState | null;
    try {
      failure = await context.client.$transaction(async (tx): Promise<TimeOffActionState | null> => {
        await lockTrainerForScheduling(tx, data.trainer_id, context.tenantId);
        const trainer = await tx.trainer.findFirst({ where: { id: data.trainer_id, tenant_id: context.tenantId } });
        if (!trainer || !scopeCoversLocation(scope, trainer.branch_id)) return { error: "Entrenador no encontrado." };

        const windowFailure = await timeOffWindowFailure(tx, context.tenantId, data);
        if (windowFailure) return windowFailure;

        await tx.trainerTimeOff.create({
          data: {
            tenant_id: context.tenantId,
            location_id: trainer.branch_id,
            trainer_id: trainer.id,
            starts_on: dbDate(data.starts_on),
            ends_on: dbDate(data.ends_on),
            start_time: data.start_time ?? null,
            end_time: data.end_time ?? null,
            reason: data.reason ?? null,
            status: "active",
            created_by: context.effectiveUser.id,
            updated_by: context.effectiveUser.id,
          },
        });
        return null;
      }, TX);
    } catch (err) {
      const message = gymAdminDbErrorMessage(err);
      if (message) return { error: message };
      throw err;
    }
    if (failure) return failure;

    revalidatePath(`/dashboard/trainers/${data.trainer_id}/time-off`);
    revalidatePath(`/dashboard/trainers/${data.trainer_id}`);
    return { success: "Ausencia registrada." };
  } finally {
    await dispose();
  }
}

export async function updateTrainerTimeOffAction(
  _prev: TimeOffActionState,
  formData: FormData
): Promise<TimeOffActionState> {
  const opened = await openTrainersWriteContext();
  if (!opened.ok) return { error: opened.error };
  const { context, dispose } = opened.handle;

  try {
    const id = formData.get("id");
    if (typeof id !== "string" || !id) return { error: "ID requerido." };
    const scope = gymAdminScope(context);
    if (!scope.ok) return { error: scope.error };
    const parsed = parseTimeOff(formData);
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
    const data = parsed.data;

    let failure: TimeOffActionState | null;
    try {
      failure = await context.client.$transaction(async (tx): Promise<TimeOffActionState | null> => {
        await lockTrainerForScheduling(tx, data.trainer_id, context.tenantId);
        const current = await tx.trainerTimeOff.findFirst({
          where: { id, tenant_id: context.tenantId, trainer_id: data.trainer_id },
        });
        if (!current || !scopeCoversLocation(scope, current.location_id)) return { error: "Ausencia no encontrada." };
        if (current.status !== "active") return { error: "La ausencia está desactivada." };

        const windowFailure = await timeOffWindowFailure(tx, context.tenantId, data, id);
        if (windowFailure) return windowFailure;

        await tx.trainerTimeOff.update({
          where: { id },
          data: {
            starts_on: dbDate(data.starts_on),
            ends_on: dbDate(data.ends_on),
            start_time: data.start_time ?? null,
            end_time: data.end_time ?? null,
            reason: data.reason ?? null,
            updated_by: context.effectiveUser.id,
          },
        });
        return null;
      }, TX);
    } catch (err) {
      const message = gymAdminDbErrorMessage(err);
      if (message) return { error: message };
      throw err;
    }
    if (failure) return failure;

    revalidatePath(`/dashboard/trainers/${data.trainer_id}/time-off`);
    return { success: "Ausencia actualizada." };
  } finally {
    await dispose();
  }
}

/** Desactiva la ausencia (sin borrado físico). No afecta sesiones ni reservas. */
export async function deactivateTrainerTimeOffAction(formData: FormData): Promise<void> {
  const opened = await openTrainersWriteContext();
  if (!opened.ok) return;
  const { context, dispose } = opened.handle;

  try {
    const id = formData.get("id");
    if (typeof id !== "string" || !id) return;
    const scope = gymAdminScope(context);
    if (!scope.ok) return;

    const current = await context.client.trainerTimeOff.findFirst({ where: { id, tenant_id: context.tenantId } });
    if (!current || !scopeCoversLocation(scope, current.location_id)) return;

    await context.client.trainerTimeOff.update({
      where: { id },
      data: { status: "inactive", updated_by: context.effectiveUser.id },
    });
    revalidatePath(`/dashboard/trainers/${current.trainer_id}/time-off`);
  } finally {
    await dispose();
  }
}
