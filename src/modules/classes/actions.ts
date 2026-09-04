"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import {
  requireAdmin,
  requireMembershipManager,
  canManageClass,
} from "@/lib/permissions/guards";
import {
  createClassTypeSchema,
  updateClassTypeSchema,
  createScheduledClassSchema,
  updateScheduledClassSchema,
  createBookingSchema,
  recordAttendanceSchema,
} from "./schemas";
import { validateClassWithinTrainerAvailability } from "@/modules/trainers/availability-validator";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

// Bloque B — guard central de este archivo: class types, clases
// programadas, reservas y asistencia requieren gym.classes.
async function assertClassesModule(tenantId: string): Promise<void> {
  const commercialCtx = await resolveCommercialEnforcementContext(tenantId);
  assertOrganizationModule(commercialCtx, "gym.classes");
}

export type ClassActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

function n(v: FormDataEntryValue | null): string | null {
  const s = v as string | null;
  return !s || s.trim() === "" ? null : s.trim();
}

// ══════════════════════════════════════════════
// CLASS TYPES
// ══════════════════════════════════════════════

export async function createClassTypeAction(
  _prev: ClassActionState,
  formData: FormData
): Promise<ClassActionState> {
  const sessionUser = await requireAdmin();

  try {
    await assertClassesModule(sessionUser.tenant_id);
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

  const raw = {
    code: n(formData.get("code")),
    name: formData.get("name"),
    description: n(formData.get("description")),
    default_duration_minutes: n(formData.get("default_duration_minutes")),
    capacity_default: n(formData.get("capacity_default")),
  };

  const parsed = createClassTypeSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  await prisma.classType.create({
    data: { gym_id: sessionUser.tenant_id, tenant_id: sessionUser.tenant_id, ...parsed.data, status: "active" },
  });

  revalidatePath("/dashboard/classes/types");
  redirect("/dashboard/classes/types");
}

export async function updateClassTypeAction(
  _prev: ClassActionState,
  formData: FormData
): Promise<ClassActionState> {
  const sessionUser = await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return { error: "ID requerido." };

  const existing = await prisma.classType.findFirst({
    where: { id, tenant_id: sessionUser.tenant_id },
  });
  if (!existing) return { error: "Tipo de clase no encontrado." };

  try {
    await assertClassesModule(sessionUser.tenant_id);
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

  const raw = {
    code: n(formData.get("code")),
    name: formData.get("name"),
    description: n(formData.get("description")),
    default_duration_minutes: n(formData.get("default_duration_minutes")),
    capacity_default: n(formData.get("capacity_default")),
  };

  const parsed = updateClassTypeSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  await prisma.classType.update({ where: { id }, data: parsed.data });

  revalidatePath("/dashboard/classes/types");
  redirect("/dashboard/classes/types");
}

export async function toggleClassTypeStatusAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;

  const target = await prisma.classType.findFirst({
    where: { id, tenant_id: sessionUser.tenant_id },
  });
  if (!target) return;

  try {
    await assertClassesModule(sessionUser.tenant_id);
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return;
    throw err;
  }

  await prisma.classType.update({
    where: { id },
    data: { status: target.status === "active" ? "inactive" : "active" },
  });
  revalidatePath("/dashboard/classes/types");
}

// ══════════════════════════════════════════════
// SCHEDULED CLASSES
// ══════════════════════════════════════════════

function parseClassFormData(formData: FormData) {
  return {
    branch_id: formData.get("branch_id"),
    class_type_id: formData.get("class_type_id"),
    trainer_id: formData.get("trainer_id"),
    title: formData.get("title"),
    class_date: formData.get("class_date"),
    start_time: formData.get("start_time"),
    end_time: formData.get("end_time"),
    capacity: formData.get("capacity"),
    room_name: n(formData.get("room_name")),
    is_personalized: formData.get("is_personalized") === "on",
    notes: n(formData.get("notes")),
  };
}

async function validateTrainerOverlap(
  trainerId: string,
  classDate: string,
  startTime: string,
  endTime: string,
  excludeId?: string
) {
  const overlap = await prisma.scheduledClass.findFirst({
    where: {
      trainer_id: trainerId,
      class_date: new Date(classDate + "T00:00:00.000Z"),
      status: { not: "cancelled" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      // Overlapping condition: existing.start_time < new.end_time AND existing.end_time > new.start_time
      start_time: { lt: endTime },
      end_time: { gt: startTime },
    },
    select: { id: true, title: true, start_time: true, end_time: true },
  });
  return overlap;
}

export async function createScheduledClassAction(
  _prev: ClassActionState,
  formData: FormData
): Promise<ClassActionState> {
  const sessionUser = await requireAdmin();

  try {
    await assertClassesModule(sessionUser.tenant_id);
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

  const raw = parseClassFormData(formData);

  // Scope check: branch_admin solo puede crear en su sucursal
  if (
    sessionUser.role === "branch_admin" &&
    raw.branch_id !== sessionUser.location_id
  ) {
    return { error: "Solo puedes programar clases en tu propia sucursal." };
  }

  const parsed = createScheduledClassSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { branch_id, class_type_id, trainer_id, class_date, start_time, end_time, ...rest } =
    parsed.data;

  // Validar que el entrenador pertenezca a la sucursal correcta
  const trainer = await prisma.trainer.findFirst({
    where: { id: trainer_id, tenant_id: sessionUser.tenant_id },
  });
  if (!trainer) return { error: "Entrenador no encontrado." };
  if (
    sessionUser.role === "branch_admin" &&
    trainer.branch_id !== sessionUser.location_id
  ) {
    return { error: "El entrenador no pertenece a tu sucursal." };
  }

  // Validar disponibilidad del entrenador (debe ir antes del overlap check)
  const availCheck = await validateClassWithinTrainerAvailability(
    trainer_id,
    class_date,
    start_time,
    end_time,
  );
  if (!availCheck.valid) {
    return {
      errors: {
        start_time: [
          availCheck.reason === "no_availability"
            ? "El entrenador no tiene disponibilidad registrada para ese día."
            : "La clase queda fuera de los bloques de disponibilidad del entrenador.",
        ],
      },
    };
  }

  // Validar solapamiento con otras clases
  const overlap = await validateTrainerOverlap(
    trainer_id,
    class_date,
    start_time,
    end_time
  );
  if (overlap) {
    return {
      errors: {
        start_time: [
          `El entrenador ya tiene una clase programada de ${overlap.start_time} a ${overlap.end_time} en esa fecha.`,
        ],
      },
    };
  }

  await prisma.scheduledClass.create({
    data: {
      gym_id: sessionUser.tenant_id,
      tenant_id: sessionUser.tenant_id,
      branch_id,
      class_type_id,
      trainer_id,
      class_date: new Date(class_date + "T00:00:00.000Z"),
      start_time,
      end_time,
      created_by: sessionUser.id,
      ...rest,
      status: "scheduled",
    },
  });

  revalidatePath("/dashboard/classes");
  redirect("/dashboard/classes");
}

export async function updateScheduledClassAction(
  _prev: ClassActionState,
  formData: FormData
): Promise<ClassActionState> {
  const sessionUser = await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return { error: "ID requerido." };

  const target = await prisma.scheduledClass.findUnique({ where: { id } });
  if (!target) return { error: "Clase no encontrada." };
  if (!canManageClass(sessionUser, target)) {
    return { error: "Sin permiso para editar esta clase." };
  }

  try {
    await assertClassesModule(sessionUser.tenant_id);
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

  const raw = parseClassFormData(formData);
  const parsed = updateScheduledClassSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { branch_id, class_type_id, trainer_id, class_date, start_time, end_time, ...rest } =
    parsed.data;

  const trainer = await prisma.trainer.findFirst({
    where: { id: trainer_id, tenant_id: sessionUser.tenant_id },
  });
  if (!trainer) return { error: "Entrenador no encontrado." };

  // Validar disponibilidad del entrenador (debe ir antes del overlap check)
  const availCheckUpdate = await validateClassWithinTrainerAvailability(
    trainer_id,
    class_date,
    start_time,
    end_time,
  );
  if (!availCheckUpdate.valid) {
    return {
      errors: {
        start_time: [
          availCheckUpdate.reason === "no_availability"
            ? "El entrenador no tiene disponibilidad registrada para ese día."
            : "La clase queda fuera de los bloques de disponibilidad del entrenador.",
        ],
      },
    };
  }

  // Validar solapamiento con otras clases
  const overlap = await validateTrainerOverlap(
    trainer_id,
    class_date,
    start_time,
    end_time,
    id
  );
  if (overlap) {
    return {
      errors: {
        start_time: [
          `El entrenador ya tiene una clase programada de ${overlap.start_time} a ${overlap.end_time} en esa fecha.`,
        ],
      },
    };
  }

  await prisma.scheduledClass.update({
    where: { id },
    data: {
      branch_id,
      class_type_id,
      trainer_id,
      class_date: new Date(class_date + "T00:00:00.000Z"),
      start_time,
      end_time,
      ...rest,
    },
  });

  revalidatePath("/dashboard/classes");
  revalidatePath(`/dashboard/classes/${id}`);
  redirect(`/dashboard/classes/${id}`);
}

export async function toggleScheduledClassStatusAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;

  const target = await prisma.scheduledClass.findUnique({ where: { id } });
  if (!target || !canManageClass(sessionUser, target)) return;

  try {
    await assertClassesModule(sessionUser.tenant_id);
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return;
    throw err;
  }

  const newStatus = target.status === "cancelled" ? "scheduled" : "cancelled";
  await prisma.scheduledClass.update({
    where: { id },
    data: { status: newStatus },
  });

  revalidatePath("/dashboard/classes");
  revalidatePath(`/dashboard/classes/${id}`);
}

export async function deleteScheduledClassAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireAdmin();
  const id = formData.get("id") as string;
  const date = (formData.get("date") as string) || "";
  const view = (formData.get("view") as string) || "";
  if (!id) return;

  const baseReturn =
    view === "upcoming"
      ? "/dashboard/classes?view=upcoming"
      : `/dashboard/classes?date=${date}`;

  const target = await prisma.scheduledClass.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          bookings: true,
          attendance: true,
        },
      },
    },
  });

  if (!target || !canManageClass(sessionUser, target)) return;

  try {
    await assertClassesModule(sessionUser.tenant_id);
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return;
    throw err;
  }

  if (target._count.bookings > 0) {
    const msg = encodeURIComponent(
      "La clase tiene reservas registradas. Cancélala en lugar de eliminarla."
    );
    redirect(`${baseReturn}&error=${msg}`);
  }

  if (target._count.attendance > 0) {
    const msg = encodeURIComponent(
      "La clase tiene asistencia registrada. Cancélala en lugar de eliminarla."
    );
    redirect(`${baseReturn}&error=${msg}`);
  }

  await prisma.scheduledClass.delete({ where: { id } });
  revalidatePath("/dashboard/classes");
  redirect(baseReturn);
}

// ══════════════════════════════════════════════
// BOOKINGS
// ══════════════════════════════════════════════

export async function createBookingAction(
  _prev: ClassActionState,
  formData: FormData
): Promise<ClassActionState> {
  const sessionUser = await requireMembershipManager();

  try {
    await assertClassesModule(sessionUser.tenant_id);
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

  const raw = {
    scheduled_class_id: formData.get("scheduled_class_id"),
    client_id: formData.get("client_id"),
  };

  const parsed = createBookingSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { scheduled_class_id, client_id } = parsed.data;

  // Verificar clase existe y está en scope
  const scheduledClass = await prisma.scheduledClass.findUnique({
    where: { id: scheduled_class_id },
  });
  if (!scheduledClass) return { error: "Clase no encontrada." };
  if (!canManageClass(sessionUser, scheduledClass)) {
    return { error: "Sin permiso para gestionar esta clase." };
  }
  if (scheduledClass.status === "cancelled") {
    return { error: "No se pueden registrar reservas en una clase cancelada." };
  }

  // Verificar cliente en scope
  const client = await prisma.client.findFirst({
    where: { id: client_id, tenant_id: sessionUser.tenant_id },
  });
  if (!client) return { error: "Cliente no encontrado." };
  if (
    (sessionUser.role === "branch_admin" || sessionUser.role === "reception") &&
    client.branch_id !== sessionUser.location_id
  ) {
    return { error: "El cliente no pertenece a tu sucursal." };
  }

  // Verificar membresía activa
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeMembership = await prisma.clientMembership.findFirst({
    where: {
      client_id,
      status: "active",
      end_date: { gte: today },
      payment_status: { in: ["paid", "partial"] },
    },
  });
  if (!activeMembership) {
    return { error: "El cliente no tiene membresía activa válida para reservar." };
  }

  // Verificar reserva duplicada
  const existing = await prisma.classBooking.findUnique({
    where: {
      scheduled_class_id_client_id: { scheduled_class_id, client_id },
    },
  });
  if (existing) {
    if (existing.booking_status === "confirmed") {
      return { error: "El cliente ya tiene una reserva confirmada para esta clase." };
    }
    // Reactivar reserva cancelada
    await prisma.classBooking.update({
      where: { id: existing.id },
      data: { booking_status: "confirmed", booked_at: new Date() },
    });
    revalidatePath(`/dashboard/classes/${scheduled_class_id}`);
    return undefined;
  }

  // Verificar cupo disponible
  const confirmedCount = await prisma.classBooking.count({
    where: { scheduled_class_id, booking_status: "confirmed" },
  });
  if (confirmedCount >= scheduledClass.capacity) {
    return { error: "No hay cupo disponible en esta clase." };
  }

  await prisma.classBooking.create({
    data: { scheduled_class_id, client_id, booking_status: "confirmed" },
  });

  revalidatePath(`/dashboard/classes/${scheduled_class_id}`);
}

export async function cancelBookingAction(formData: FormData): Promise<void> {
  const sessionUser = await requireMembershipManager();
  const booking_id = formData.get("booking_id") as string;
  if (!booking_id) return;

  const booking = await prisma.classBooking.findUnique({
    where: { id: booking_id },
    include: { scheduled_class: true },
  });
  if (!booking) return;
  if (!canManageClass(sessionUser, booking.scheduled_class)) return;

  try {
    await assertClassesModule(sessionUser.tenant_id);
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return;
    throw err;
  }

  await prisma.classBooking.update({
    where: { id: booking_id },
    data: { booking_status: "cancelled" },
  });

  revalidatePath(`/dashboard/classes/${booking.scheduled_class_id}`);
}

// ══════════════════════════════════════════════
// ATTENDANCE
// ══════════════════════════════════════════════

export async function recordAttendanceAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireMembershipManager();

  const raw = {
    scheduled_class_id: formData.get("scheduled_class_id"),
    client_id: formData.get("client_id"),
    attendance_status: formData.get("attendance_status"),
    notes: n(formData.get("notes")),
  };

  const parsed = recordAttendanceSchema.safeParse(raw);
  if (!parsed.success) return;

  const { scheduled_class_id, client_id, attendance_status, notes } =
    parsed.data;

  // Scope check
  const scheduledClass = await prisma.scheduledClass.findUnique({
    where: { id: scheduled_class_id },
  });
  if (!scheduledClass || !canManageClass(sessionUser, scheduledClass)) return;

  try {
    await assertClassesModule(sessionUser.tenant_id);
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return;
    throw err;
  }

  await prisma.classAttendance.upsert({
    where: {
      scheduled_class_id_client_id: { scheduled_class_id, client_id },
    },
    create: {
      scheduled_class_id,
      client_id,
      attendance_status,
      notes,
      checked_in_at:
        attendance_status === "attended" ? new Date() : null,
    },
    update: {
      attendance_status,
      notes,
      checked_in_at:
        attendance_status === "attended" ? new Date() : null,
    },
  });

  revalidatePath(`/dashboard/classes/${scheduled_class_id}`);
}
