"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireClient } from "@/lib/permissions/guards";
import { getClientByUserId } from "./queries";
import {
  bookClassSchema,
  cancelBookingSchema,
  planDayFeedbackSchema,
} from "./schemas";

export type ActionResult = { error: string } | { success: true };

// ============================================================
// RESERVAR CLASE
// ============================================================

export async function bookClassAction(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const sessionUser = await requireClient();

  const parsed = bookClassSchema.safeParse({ class_id: formData.get("class_id") });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const { class_id } = parsed.data;

  // Obtener el perfil del cliente
  const client = await getClientByUserId(sessionUser.id);
  if (!client) return { error: "No tienes un perfil de cliente vinculado." };

  // Verificar membresía activa y vigente
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeMembership = await prisma.clientMembership.findFirst({
    where: {
      client_id: client.id,
      status: "active",
      payment_status: { in: ["paid", "partial"] },
      start_date: { lte: today },
      end_date: { gte: today },
    },
  });
  if (!activeMembership) {
    return { error: "No tienes una membresía activa vigente para reservar clases." };
  }

  // Verificar que la clase existe, está programada y pertenece a tu sucursal
  const scheduledClass = await prisma.scheduledClass.findFirst({
    where: {
      id: class_id,
      status: "scheduled",
      branch_id: client.branch_id,
    },
    include: {
      bookings: { where: { booking_status: "confirmed" }, select: { id: true } },
    },
  });
  if (!scheduledClass) {
    return { error: "Clase no disponible o no pertenece a tu sucursal." };
  }

  // Verificar que la clase no está en el pasado
  const classDate = new Date(scheduledClass.class_date);
  classDate.setHours(0, 0, 0, 0);
  if (classDate < today) {
    return { error: "No puedes reservar una clase pasada." };
  }

  // Verificar cupo disponible
  const confirmedCount = scheduledClass.bookings.length;
  if (confirmedCount >= scheduledClass.capacity) {
    return { error: "Esta clase ya no tiene cupo disponible." };
  }

  // Verificar reserva duplicada
  const existing = await prisma.classBooking.findUnique({
    where: {
      scheduled_class_id_client_id: {
        scheduled_class_id: class_id,
        client_id: client.id,
      },
    },
  });
  if (existing) {
    if (existing.booking_status === "confirmed") {
      return { error: "Ya tienes una reserva confirmada para esta clase." };
    }
    // Si estaba cancelada, reactivar
    await prisma.classBooking.update({
      where: { id: existing.id },
      data: { booking_status: "confirmed", booked_at: new Date() },
    });
    revalidatePath("/portal/clases");
    return { success: true };
  }

  await prisma.classBooking.create({
    data: {
      scheduled_class_id: class_id,
      client_id: client.id,
      booking_status: "confirmed",
    },
  });

  revalidatePath("/portal/clases");
  return { success: true };
}

// ============================================================
// CANCELAR RESERVA
// ============================================================

export async function cancelBookingAction(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const sessionUser = await requireClient();

  const parsed = cancelBookingSchema.safeParse({ booking_id: formData.get("booking_id") });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const { booking_id } = parsed.data;

  const client = await getClientByUserId(sessionUser.id);
  if (!client) return { error: "No tienes un perfil de cliente vinculado." };

  // Verificar que la reserva pertenece a este cliente
  const booking = await prisma.classBooking.findFirst({
    where: { id: booking_id, client_id: client.id },
    include: {
      scheduled_class: { select: { class_date: true, status: true } },
    },
  });
  if (!booking) return { error: "Reserva no encontrada." };
  if (booking.booking_status !== "confirmed") {
    return { error: "Esta reserva ya está cancelada." };
  }

  // No permitir cancelar clases ya pasadas o en progreso
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const classDate = new Date(booking.scheduled_class.class_date);
  classDate.setHours(0, 0, 0, 0);
  if (classDate < today) {
    return { error: "No puedes cancelar una reserva de clase pasada." };
  }

  await prisma.classBooking.update({
    where: { id: booking_id },
    data: { booking_status: "cancelled" },
  });

  revalidatePath("/portal/clases");
  return { success: true };
}

// ============================================================
// REGISTRAR EJECUCIÓN DE DÍA DEL PLAN
// ============================================================

export async function submitPlanDayAction(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const sessionUser = await requireClient();

  const parsed = planDayFeedbackSchema.safeParse({
    plan_day_id: formData.get("plan_day_id"),
    execution_status: formData.get("execution_status"),
    client_feedback: formData.get("client_feedback") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const { plan_day_id, execution_status, client_feedback } = parsed.data;

  const client = await getClientByUserId(sessionUser.id);
  if (!client) return { error: "No tienes un perfil de cliente vinculado." };

  // Verificar que el día pertenece a un plan del cliente
  const planDay = await prisma.clientWeeklyPlanDay.findFirst({
    where: {
      id: plan_day_id,
      plan: { client_id: client.id },
    },
  });
  if (!planDay) return { error: "Día de plan no encontrado." };

  await prisma.clientWeeklyPlanDay.update({
    where: { id: plan_day_id },
    data: {
      execution_status,
      executed_at: new Date(),
      client_feedback: client_feedback ?? null,
    },
  });

  revalidatePath("/portal/plan-semanal");
  return { success: true };
}
