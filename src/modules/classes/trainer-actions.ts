"use server";

// ─────────────────────────────────────────────────────────────────
// GYM-4 — Server Actions de la operación del entrenador.
//
// Cada acción revalida en el servidor, en este orden:
//  1. sesión autenticada (requireClassViewer: puerta del JWT);
//  2. requireOperationalContext(gym.classes, write): base runtime efectiva,
//     entitlement del módulo y rechazo bajo Support Session (solo lectura);
//  3. rol LIVE + perfil Trainer activo vinculado (resolveSessionOperator);
//  4. el motor valida bajo lock: sesión asignada (o alcance SA/BA), reserva,
//     estado, ventana R32 y tenant.
// Canal y actor salen del contexto, nunca del formulario. Los ids del
// formulario solo identifican el objetivo.
//
// No amplía canManageClass ni requireMembershipManager: las acciones de staff
// (recordAttendanceAction, etc.) conservan su comportamiento.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireClassViewer } from "@/lib/permissions/guards";
import {
  requireOperationalContext,
  OperationalContextError,
  type OperationalContextHandle,
} from "@/modules/platform/runtime/require-operational-context";
import { createGymBookingService, resolveIdempotencyKey } from "./booking/booking-service";
import { createSessionActivityService } from "./booking/session-activities";
import { gymBookingErrorMessage } from "./booking/booking-messages";
import { bookingScopeFromContext } from "./booking/booking-action-support";
import { resolveSessionOperator, type SessionOperator } from "./trainer/trainer-access";

const ATTENDANCE_STATUSES = new Set(["attended", "late", "absent"] as const);
/** Límite de las notas privadas de entrenamiento (columna TEXT). */
const TRAINING_NOTES_MAX = 2000;
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function formString(formData: FormData, field: string): string {
  const v = formData.get(field);
  return typeof v === "string" ? v.trim() : "";
}

/** Destino tras la acción: el detalle de la sesión (id del resultado o, si falló, del formulario saneado). */
function sessionUrl(sessionId: string | null, outcome: { error?: string; notice?: string }): string {
  const base = sessionId && SAFE_ID.test(sessionId) ? `/dashboard/classes/${sessionId}` : "/dashboard/classes";
  if (outcome.error) return `${base}?error=${encodeURIComponent(outcome.error)}`;
  if (outcome.notice) return `${base}?notice=${encodeURIComponent(outcome.notice)}`;
  return base;
}

/** Sesión real de la reserva (tenant efectivo), para volver al detalle correcto tras el éxito. */
async function bookingSessionId(
  context: OperationalContextHandle["context"],
  bookingId: string,
  fallback: string | null
): Promise<string | null> {
  const row = await context.client.classBooking.findFirst({
    where: { id: bookingId, tenant_id: context.tenantId },
    select: { scheduled_class_id: true },
  });
  return row?.scheduled_class_id ?? fallback;
}

type Opened =
  | { ok: true; handle: OperationalContextHandle; operator: Extract<SessionOperator, { ok: true }> }
  | { ok: false; error: string; dispose?: () => Promise<void> };

async function openTrainerOperation(opts: { allowAdmin: boolean }): Promise<Opened> {
  const sessionUser = await requireClassViewer();
  let handle: OperationalContextHandle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.classes", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const operator = await resolveSessionOperator(handle.context, opts);
  if (!operator.ok) return { ok: false, error: operator.error, dispose: handle.dispose };
  return { ok: true, handle, operator };
}

/** Asistencia del entrenador sobre su sesión: canal TRAINER del motor (R32 sin excepciones). */
export async function trainerRecordAttendanceAction(formData: FormData): Promise<void> {
  const fallbackSession = formString(formData, "scheduled_class_id") || null;
  const opened = await openTrainerOperation({ allowAdmin: false });
  if (!opened.ok) {
    await opened.dispose?.();
    return redirect(sessionUrl(fallbackSession, { error: opened.error }));
  }
  const { context, dispose } = opened.handle;

  let target: string;
  try {
    const status = formString(formData, "attendance_status");
    const bookingId = formString(formData, "booking_id");
    if (!ATTENDANCE_STATUSES.has(status as never) || !bookingId) {
      target = sessionUrl(fallbackSession, { error: gymBookingErrorMessage("INVALID_COMMAND") });
    } else {
      const result = await createGymBookingService(context.client).recordAttendance({
        scope: bookingScopeFromContext(context),
        actor: opened.operator.actor,
        channel: "TRAINER",
        bookingId,
        status: status as "attended" | "late" | "absent",
        idempotencyKey: resolveIdempotencyKey(formData.get("idempotency_key")),
      });
      if (result.ok) {
        const sessionId = await bookingSessionId(context, bookingId, fallbackSession);
        revalidatePath(`/dashboard/classes/${sessionId}`);
        target = sessionUrl(sessionId, { notice: "Asistencia registrada." });
      } else {
        target = sessionUrl(fallbackSession, { error: gymBookingErrorMessage(result.code, "staff", result.message) });
      }
    }
  } finally {
    await dispose();
  }
  redirect(target);
}

/** Notas privadas (R36) sobre una asistencia ya registrada; no cambia el estado de asistencia. */
export async function saveTrainingNotesAction(formData: FormData): Promise<void> {
  const fallbackSession = formString(formData, "scheduled_class_id") || null;
  const opened = await openTrainerOperation({ allowAdmin: true });
  if (!opened.ok) {
    await opened.dispose?.();
    return redirect(sessionUrl(fallbackSession, { error: opened.error }));
  }
  const { context, dispose } = opened.handle;

  let target: string;
  try {
    const bookingId = formString(formData, "booking_id");
    const text = formString(formData, "training_notes");
    if (!bookingId || text.length > TRAINING_NOTES_MAX) {
      target = sessionUrl(fallbackSession, {
        error: text.length > TRAINING_NOTES_MAX ? `La nota admite hasta ${TRAINING_NOTES_MAX} caracteres.` : gymBookingErrorMessage("INVALID_COMMAND"),
      });
    } else {
      const result = await createGymBookingService(context.client).updateTrainingNotes({
        scope: bookingScopeFromContext(context),
        actor: opened.operator.actor,
        channel: opened.operator.channel,
        bookingId,
        trainingNotes: text === "" ? null : text,
        idempotencyKey: resolveIdempotencyKey(formData.get("idempotency_key")),
      });
      if (result.ok) {
        const sessionId = await bookingSessionId(context, bookingId, fallbackSession);
        revalidatePath(`/dashboard/classes/${sessionId}`);
        target = sessionUrl(sessionId, { notice: "Nota privada guardada." });
      } else {
        target = sessionUrl(fallbackSession, { error: gymBookingErrorMessage(result.code, "staff", result.message) });
      }
    }
  } finally {
    await dispose();
  }
  redirect(target);
}

/** Actividad común de la sesión (una vez por sesión y actividad). */
export async function addSessionActivityAction(formData: FormData): Promise<void> {
  const fallbackSession = formString(formData, "scheduled_class_id") || null;
  const opened = await openTrainerOperation({ allowAdmin: true });
  if (!opened.ok) {
    await opened.dispose?.();
    return redirect(sessionUrl(fallbackSession, { error: opened.error }));
  }
  const { context, dispose } = opened.handle;

  let target: string;
  try {
    const activityId = formString(formData, "activity_id");
    if (!fallbackSession || !activityId) {
      target = sessionUrl(fallbackSession, { error: "Selecciona una actividad." });
    } else {
      const result = await createSessionActivityService(context.client).addSessionActivity({
        scope: bookingScopeFromContext(context),
        actor: opened.operator.actor,
        channel: opened.operator.channel,
        sessionId: fallbackSession,
        activityId,
        notes: formString(formData, "notes") || null,
      });
      if (result.ok) revalidatePath(`/dashboard/classes/${result.value.sessionId}`);
      target = result.ok
        ? sessionUrl(result.value.sessionId, {
            notice: result.value.created ? "Actividad registrada para la clase." : "La actividad ya estaba registrada.",
          })
        : sessionUrl(fallbackSession, { error: gymBookingErrorMessage(result.code, "staff", result.message) });
    }
  } finally {
    await dispose();
  }
  redirect(target);
}

/** Actividad individual de un alumno presente (asistencia attended/late con reserva confirmada). */
export async function addAttendanceActivityAction(formData: FormData): Promise<void> {
  const fallbackSession = formString(formData, "scheduled_class_id") || null;
  const opened = await openTrainerOperation({ allowAdmin: true });
  if (!opened.ok) {
    await opened.dispose?.();
    return redirect(sessionUrl(fallbackSession, { error: opened.error }));
  }
  const { context, dispose } = opened.handle;

  let target: string;
  try {
    const attendanceId = formString(formData, "attendance_id");
    const activityId = formString(formData, "activity_id");
    if (!attendanceId || !activityId) {
      target = sessionUrl(fallbackSession, {
        error: attendanceId ? "Selecciona una actividad." : gymBookingErrorMessage("ATTENDANCE_REQUIRED"),
      });
    } else {
      const result = await createSessionActivityService(context.client).addAttendanceActivity({
        scope: bookingScopeFromContext(context),
        actor: opened.operator.actor,
        channel: opened.operator.channel,
        attendanceId,
        activityId,
        notes: formString(formData, "notes") || null,
      });
      if (result.ok) revalidatePath(`/dashboard/classes/${result.value.sessionId}`);
      target = result.ok
        ? sessionUrl(result.value.sessionId, {
            notice: result.value.created ? "Actividad registrada para el alumno." : "La actividad ya estaba registrada para el alumno.",
          })
        : sessionUrl(fallbackSession, { error: gymBookingErrorMessage(result.code, "staff", result.message) });
    }
  } finally {
    await dispose();
  }
  redirect(target);
}
