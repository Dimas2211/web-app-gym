"use server";

import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/permissions/guards";
import { getClientByUserId, getLastExpiredMembership, hasActiveMembership } from "./queries";
import { plansVisibleForMembership } from "./plan-visibility";
import { TIMEZONE_NOT_CONFIGURED_MESSAGE, resolveGymClock } from "@/modules/weekly-plans/gym-clock";
import { recordClientReport } from "@/modules/weekly-plans/training-execution-service";
import {
  bookClassSchema,
  cancelBookingSchema,
  planDayFeedbackSchema,
} from "./schemas";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { createGymBookingService, resolveIdempotencyKey } from "@/modules/classes/booking/booking-service";
import { gymBookingErrorMessage } from "@/modules/classes/booking/booking-messages";
import {
  bookingActorFromContext,
  bookingScopeFromContext,
} from "@/modules/classes/booking/booking-action-support";

export type ActionResult = { error: string } | { success: true };

/** Actor del portal con rol LIVE; null si la cuenta ya no es de rol client. */
function portalActor(context: Parameters<typeof bookingActorFromContext>[0]) {
  const actor = bookingActorFromContext(context);
  return actor?.role === "client" ? actor : null;
}

// FASE VI-D7: el Client Portal es la superficie más expuesta al aislamiento
// runtime — un miembro real de un tenant hosteado escribe (reserva clases,
// registra ejecución de su plan) a través de estas actions. Cada una ahora
// resuelve requireOperationalContext(sessionUser, { write: true }) antes de
// tocar datos: bloquea bajo Support Session (readOnly) y enruta SIEMPRE al
// PrismaClient runtime efectivo — nunca al Prisma global de la plataforma.
// El portal no tiene module code comercial propio (es un canal hacia
// módulos GYM ya gateados aguas arriba); no se inventa uno nuevo aquí.
// GYM-BOOKINGS 2B: reservar y cancelar exigen module "gym.classes" (el
// mismo que el staff) y delegan en GymBookingService con channel PORTAL.
// El alumno SIEMPRE se resuelve desde sessionUser.id; el servicio vuelve a
// verificar client.user_id = actor bajo bloqueo.

/** GYM-BOOKINGS 3B: calendario, inicio (próximas) e historial reflejan el resultado. */
function revalidatePortalBookingViews() {
  revalidatePath("/portal/clases");
  revalidatePath("/portal/historial");
  revalidatePath("/portal");
}

// ============================================================
// RESERVAR CLASE
// ============================================================

export async function bookClassAction(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const sessionUser = await requireClient();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.classes", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const parsed = bookClassSchema.safeParse({ class_id: formData.get("class_id") });
    if (!parsed.success) return { error: parsed.error.errors[0].message };

    const { class_id } = parsed.data;

    // Perfil del cliente: desde la sesión y el tenant del contexto (3B).
    const client = await getClientByUserId(sessionUser.id, context.client, { tenantId: context.tenantId, gymId: context.gymId });
    if (!client) return { error: "No tienes un perfil de cliente vinculado." };

    const actor = portalActor(context);
    if (!actor) return { error: "No tienes un perfil de cliente vinculado." };

    // Membresía vigente, modalidad, sucursal, fecha, cupo, duplicado y
    // reactivación: GymBookingService, en una transacción bajo bloqueo.
    const result = await createGymBookingService(context.client).bookSession({
      scope: bookingScopeFromContext(context),
      actor,
      channel: "PORTAL",
      sessionId: class_id,
      clientId: client.id,
      idempotencyKey: resolveIdempotencyKey(formData.get("idempotency_key")),
    });
    if (!result.ok) return { error: gymBookingErrorMessage(result.code, "portal", result.message) };

    revalidatePortalBookingViews();
    return { success: true };
  } finally {
    await dispose();
  }
}

// ============================================================
// CANCELAR RESERVA
// ============================================================

export async function cancelBookingAction(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const sessionUser = await requireClient();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.classes", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const parsed = cancelBookingSchema.safeParse({ booking_id: formData.get("booking_id") });
    if (!parsed.success) return { error: parsed.error.errors[0].message };

    const { booking_id } = parsed.data;

    const client = await getClientByUserId(sessionUser.id, context.client, { tenantId: context.tenantId, gymId: context.gymId });
    if (!client) return { error: "No tienes un perfil de cliente vinculado." };

    const actor = portalActor(context);
    if (!actor) return { error: "No tienes un perfil de cliente vinculado." };

    // Propiedad de la reserva (client.user_id = sesión), ventana de
    // cancelación y liberación de cupo/sesión: GymBookingService.
    const result = await createGymBookingService(context.client).cancelBooking({
      scope: bookingScopeFromContext(context),
      actor,
      channel: "PORTAL",
      bookingId: booking_id,
      idempotencyKey: resolveIdempotencyKey(formData.get("idempotency_key")),
    });
    if (!result.ok) return { error: gymBookingErrorMessage(result.code, "portal", result.message) };

    revalidatePortalBookingViews();
    return { success: true };
  } finally {
    await dispose();
  }
}

// ============================================================
// REGISTRAR EJECUCIÓN DE UN DÍA DEL PLAN (autorreporte por fecha)
// ============================================================

// GYM-5A: el alumno reporta SU entrenamiento de una fecha local del gimnasio.
// Es un autorreporte: no es asistencia (GYM-4), no consume membresía ni toca
// reservas, y no sobrescribe el registro del entrenador. Se exige el módulo
// gym.weekly_plans, rol LIVE client, plan propio y activo, y la misma política
// de visibilidad por membresía que aplica la página.

export async function submitPlanDayAction(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const sessionUser = await requireClient();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.weekly_plans", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const parsed = planDayFeedbackSchema.safeParse({
      plan_day_id: formData.get("plan_day_id"),
      local_date: formData.get("local_date"),
      execution_status: formData.get("execution_status"),
      client_feedback: formData.get("client_feedback") || undefined,
    });
    if (!parsed.success) return { error: parsed.error.errors[0].message };

    const { plan_day_id, local_date, execution_status, client_feedback } = parsed.data;

    if (!portalActor(context)) return { error: "No tienes un perfil de cliente vinculado." };
    const client = await getClientByUserId(sessionUser.id, context.client, { tenantId: context.tenantId, gymId: context.gymId });
    if (!client) return { error: "No tienes un perfil de cliente vinculado." };

    const clock = await resolveGymClock(context.client, context.tenantId);
    if (!clock) return { error: TIMEZONE_NOT_CONFIGURED_MESSAGE };

    // Política de visibilidad por membresía (idéntica a la de la página).
    const [hasMembership, lastExpired] = await Promise.all([
      hasActiveMembership(client.id, context.client, clock.today),
      getLastExpiredMembership(client.id, context.client, clock.today),
    ]);
    if (
      !plansVisibleForMembership({
        hasActiveMembership: hasMembership,
        lastExpiredEnd: lastExpired ? lastExpired.end_date.toISOString().slice(0, 10) : null,
        today: clock.today,
      })
    ) {
      return { error: "Tus planes no están disponibles. Acércate a recepción para reactivar tu acceso." };
    }

    const result = await recordClientReport(context.client, {
      tenantId: context.tenantId,
      clientId: client.id,
      planDayId: plan_day_id,
      localDate: local_date,
      status: execution_status,
      comment: client_feedback ?? null,
      actorUserId: sessionUser.id,
      timezone: clock.timezone,
      today: clock.today,
    });
    if (!result.ok) return { error: result.message };

    revalidatePath("/portal/plan-semanal");
    return { success: true };
  } finally {
    await dispose();
  }
}
