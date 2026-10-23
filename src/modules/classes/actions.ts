"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type GymSessionKind, type PrismaClient, type UserRole } from "@prisma/client";
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
  findTimeOffConflict,
  loadSchedulingPolicy,
  lockTrainerForScheduling,
  timeOffConflictMessage,
  validateTrainerOverlap,
} from "./scheduling/scheduling-guards";
import { resolveSessionSetup } from "./scheduling/scheduling-rules";
import { gymAdminScope, liveGymAdminScope } from "./scheduling/admin-support";
import {
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { requireLiveOperationalContext } from "@/modules/platform/runtime/require-live-operational-context";
import {
  createGymBookingService,
  loadGymBookingPolicy,
  resolveIdempotencyKey,
} from "./booking/booking-service";
import { policyAppliesTo } from "./booking/booking-policy";
import { gymBookingErrorMessage } from "./booking/booking-messages";
import {
  bookingActorFromContext,
  bookingScopeFromContext,
  optionalFormText,
} from "./booking/booking-action-support";

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

  let handle;
  try {
    handle = await requireLiveOperationalContext(sessionUser, { module: "gym.classes", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    // LIVE-3: la misma capacidad que exige requireAdmin (JWT), con el rol LIVE (identidad ya vigente).
    if (!gymAdminScope(context).ok) return { error: "Sin permisos para esta operación." };

    const raw = {
      code: n(formData.get("code")),
      name: formData.get("name"),
      description: n(formData.get("description")),
      default_duration_minutes: n(formData.get("default_duration_minutes")),
      capacity_default: n(formData.get("capacity_default")),
    };

    const parsed = createClassTypeSchema.safeParse(raw);
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

    if (!context.gymId) {
      return { error: "El módulo GYM no está configurado para esta organización." };
    }

    await context.client.classType.create({
      data: { gym_id: context.gymId, tenant_id: context.tenantId, ...parsed.data, status: "active" },
    });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/classes/types");
  redirect("/dashboard/classes/types");
}

export async function updateClassTypeAction(
  _prev: ClassActionState,
  formData: FormData
): Promise<ClassActionState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireLiveOperationalContext(sessionUser, { module: "gym.classes", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    // LIVE-3: la misma capacidad que exige requireAdmin (JWT), con el rol LIVE (identidad ya vigente).
    if (!gymAdminScope(context).ok) return { error: "Sin permisos para esta operación." };

    const id = formData.get("id") as string;
    if (!id) return { error: "ID requerido." };

    const existing = await context.client.classType.findFirst({
      where: { id, tenant_id: context.tenantId },
    });
    if (!existing) return { error: "Tipo de clase no encontrado." };

    const raw = {
      code: n(formData.get("code")),
      name: formData.get("name"),
      description: n(formData.get("description")),
      default_duration_minutes: n(formData.get("default_duration_minutes")),
      capacity_default: n(formData.get("capacity_default")),
    };

    const parsed = updateClassTypeSchema.safeParse(raw);
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

    await context.client.classType.update({ where: { id }, data: parsed.data });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/classes/types");
  redirect("/dashboard/classes/types");
}

export async function toggleClassTypeStatusAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireLiveOperationalContext(sessionUser, { module: "gym.classes", write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  try {
    // LIVE-3: la misma capacidad que exige requireAdmin (JWT), con el rol LIVE (identidad ya vigente).
    if (!gymAdminScope(context).ok) return;

    const id = formData.get("id") as string;
    if (!id) return;

    const target = await context.client.classType.findFirst({
      where: { id, tenant_id: context.tenantId },
    });
    if (!target) return;

    await context.client.classType.update({
      where: { id },
      data: { status: target.status === "active" ? "inactive" : "active" },
    });
    revalidatePath("/dashboard/classes/types");
  } finally {
    await dispose();
  }
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
    capacity: n(formData.get("capacity")),
    room_name: n(formData.get("room_name")),
    is_personalized: formData.get("is_personalized") === "on",
    // GYM-BOOKINGS 3A — sin campo (formularios previos) = OPEN heredado.
    session_kind: n(formData.get("session_kind")) ?? undefined,
    notes: n(formData.get("notes")),
  };
}

// GYM-BOOKINGS 2B (auditoría H03) — R14: un entrenador no puede tener dos
// sesiones no canceladas solapadas. Validar y escribir en la MISMA
// transacción READ COMMITTED, con el entrenador destino bloqueado
// `FOR UPDATE` antes (primer elemento de GYM_BOOKING_LOCK_ORDER tras el
// advisory): dos altas/ediciones del mismo entrenador se serializan y la
// segunda ve la sesión confirmada por la primera. La edición bloquea
// después la sesión (trainers → scheduled_classes) para validar el cupo.
const CLASS_SCHEDULING_TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  timeout: 20_000,
  maxWait: 15_000,
};

// GYM-BOOKINGS 3A — referencias del formulario dentro del tenant efectivo.
// La FK simple de branch/class_type no compara tenant: sin esta guarda un
// id de otra organización (base Shared) se aceptaría.
async function validateClassReferences(
  db: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  branchId: string,
  classTypeId: string
): Promise<{ failure: ClassActionState } | { classType: { capacity_default: number | null } }> {
  const [branch, classType] = await Promise.all([
    db.branch.findFirst({ where: { id: branchId, tenant_id: tenantId }, select: { id: true } }),
    db.classType.findFirst({ where: { id: classTypeId, tenant_id: tenantId }, select: { capacity_default: true } }),
  ]);
  if (!branch) return { failure: { errors: { branch_id: ["Sucursal no encontrada."] } } };
  if (!classType) return { failure: { errors: { class_type_id: ["Tipo de clase no encontrado."] } } };
  return { classType };
}

function availabilityError(reason: "no_availability" | "outside_blocks"): ClassActionState {
  return {
    errors: {
      start_time: [
        reason === "no_availability"
          ? "El entrenador no tiene disponibilidad registrada para ese día."
          : "La clase queda fuera de los bloques de disponibilidad del entrenador.",
      ],
    },
  };
}

function overlapError(overlap: { start_time: string; end_time: string }): ClassActionState {
  return {
    errors: {
      start_time: [
        `El entrenador ya tiene una clase programada de ${overlap.start_time} a ${overlap.end_time} en esa fecha.`,
      ],
    },
  };
}

export async function createScheduledClassAction(
  _prev: ClassActionState,
  formData: FormData
): Promise<ClassActionState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireLiveOperationalContext(sessionUser, { module: "gym.classes", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    // LIVE-1/LIVE-2: el JWT (requireAdmin) no basta; identidad vigente SA/BA en la base efectiva.
    const liveScope = await liveGymAdminScope(context);
    if (!liveScope.ok) return { error: liveScope.error };

    const effectiveRole = context.effectiveUser.role;
    const raw = parseClassFormData(formData);

    // Scope check: branch_admin solo puede crear en su sucursal
    if (
      effectiveRole === "branch_admin" &&
      raw.branch_id !== context.locationId
    ) {
      return { error: "Solo puedes programar clases en tu propia sucursal." };
    }

    const parsed = createScheduledClassSchema.safeParse(raw);
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

    const {
      branch_id,
      class_type_id,
      trainer_id,
      class_date,
      start_time,
      end_time,
      capacity,
      session_kind,
      is_personalized,
      ...rest
    } = parsed.data;

    if (!context.gymId) {
      return { error: "El módulo GYM no está configurado para esta organización." };
    }
    const gymId = context.gymId;

    const failure = await context.client.$transaction(async (tx): Promise<ClassActionState | null> => {
      await lockTrainerForScheduling(tx, trainer_id, context.tenantId);
      // Auditoría 3A H04: timezone bajo gym_settings FOR SHARE (trainers → gym_settings).
      const policy = await loadSchedulingPolicy(tx, context.tenantId);

      // Validar que el entrenador pertenezca a la sucursal correcta
      const trainer = await tx.trainer.findFirst({
        where: { id: trainer_id, tenant_id: context.tenantId },
      });
      if (!trainer) return { error: "Entrenador no encontrado." };
      if (
        effectiveRole === "branch_admin" &&
        trainer.branch_id !== context.locationId
      ) {
        return { error: "El entrenador no pertenece a tu sucursal." };
      }

      // GYM-BOOKINGS 3A — sede y tipo del tenant; tipo de sesión, cupo efectivo
      // (R19) e instantes (R18: PERSONALIZED/GROUP fallan cerrados).
      const refs = await validateClassReferences(tx, context.tenantId, branch_id, class_type_id);
      if ("failure" in refs) return refs.failure;
      const kindFailure = nonOpenTrainerFailure(session_kind, trainer, branch_id);
      if (kindFailure) return kindFailure;
      const setup = resolveSessionSetup({
        kind: session_kind,
        policy,
        date: class_date,
        startTime: start_time,
        endTime: end_time,
        explicitCapacity: capacity,
        trainerPersonalizedCapacity: trainer.personalized_capacity,
        classTypeCapacityDefault: refs.classType.capacity_default,
      });
      if (!setup.ok) return { errors: { [setup.field]: [setup.message] } };

      // Validar disponibilidad del entrenador (debe ir antes del overlap check)
      const availCheck = await validateClassWithinTrainerAvailability(trainer_id, class_date, start_time, end_time, tx);
      if (!availCheck.valid) return availabilityError(availCheck.reason);

      // Validar solapamiento con otras clases (bajo el lock del entrenador)
      const overlap = await validateTrainerOverlap(tx, trainer_id, class_date, start_time, end_time);
      if (overlap) return overlapError(overlap);

      // GYM-BOOKINGS 3A — ausencias del entrenador (TrainerTimeOff).
      const timeOff = await findTimeOffConflict(tx, context.tenantId, trainer_id, class_date, start_time, end_time);
      if (timeOff) return { errors: { start_time: [timeOffConflictMessage(timeOff)] } };

      await tx.scheduledClass.create({
        data: {
          gym_id: gymId,
          tenant_id: context.tenantId,
          branch_id,
          class_type_id,
          trainer_id,
          class_date: new Date(class_date + "T00:00:00.000Z"),
          start_time,
          end_time,
          created_by: context.effectiveUser.id,
          ...rest,
          capacity: setup.capacity,
          session_kind,
          // is_personalized es una etiqueta heredada de OPEN; nunca acompaña a session_kind.
          is_personalized: session_kind === "OPEN" ? is_personalized : false,
          starts_at: setup.startsAt,
          ends_at: setup.endsAt,
          status: "scheduled",
        },
      });
      return null;
    }, CLASS_SCHEDULING_TX);
    if (failure) return failure;
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/classes");
  redirect("/dashboard/classes");
}

export async function updateScheduledClassAction(
  _prev: ClassActionState,
  formData: FormData
): Promise<ClassActionState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireLiveOperationalContext(sessionUser, { module: "gym.classes", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    // LIVE-1/LIVE-2: canManageClass admite recepción; programar exige identidad vigente SA/BA.
    const liveScope = await liveGymAdminScope(context);
    if (!liveScope.ok) return { error: liveScope.error };

    const id = formData.get("id") as string;
    if (!id) return { error: "ID requerido." };

    const target = await context.client.scheduledClass.findFirst({
      where: { id, tenant_id: context.tenantId },
    });
    if (!target) return { error: "Clase no encontrada." };

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!canManageClass(effectiveSessionUser, target)) {
      return { error: "Sin permiso para editar esta clase." };
    }

    const raw = parseClassFormData(formData);
    const parsed = updateScheduledClassSchema.safeParse(raw);
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

    const {
      branch_id,
      class_type_id,
      trainer_id,
      class_date,
      start_time,
      end_time,
      capacity,
      session_kind,
      is_personalized,
      ...rest
    } = parsed.data;

    // GYM-BOOKINGS 3A — BA no puede mover la clase a otra sucursal (rol LIVE).
    if (effectiveSessionUser.role === "branch_admin" && branch_id !== context.locationId) {
      return { error: "Solo puedes programar clases en tu propia sucursal." };
    }

    let failure: ClassActionState | null;
    try {
      failure = await context.client.$transaction(async (tx): Promise<ClassActionState | null> => {
        // Orden: trainers (destino) → gym_settings (auditoría 3A H04) → scheduled_classes.
        await lockTrainerForScheduling(tx, trainer_id, context.tenantId);
        const policy = await loadSchedulingPolicy(tx, context.tenantId);
        await tx.$queryRaw`SELECT "id" FROM "scheduled_classes" WHERE "id" = ${id} AND "tenant_id" = ${context.tenantId} FOR UPDATE`;
        const current = await tx.scheduledClass.findFirst({
          where: { id, tenant_id: context.tenantId },
        });
        if (!current) return { error: "Clase no encontrada." };

        const trainer = await tx.trainer.findFirst({
          where: { id: trainer_id, tenant_id: context.tenantId },
        });
        if (!trainer) return { error: "Entrenador no encontrado." };
        if (effectiveSessionUser.role === "branch_admin" && trainer.branch_id !== context.locationId) {
          return { error: "El entrenador no pertenece a tu sucursal." };
        }

        const timingChanged =
          current.class_date.toISOString().slice(0, 10) !== class_date ||
          current.start_time !== start_time ||
          current.end_time !== end_time;
        const structuralChanged =
          timingChanged || current.trainer_id !== trainer_id || current.branch_id !== branch_id;

        // GYM-BOOKINGS 3A — protecciones de sesiones con dependencias.
        const dependencyFailure = await sessionEditDependencyFailure(tx, current, {
          session_kind,
          branch_id,
          structuralChanged,
        });
        if (dependencyFailure) return dependencyFailure;
        const refs = await validateClassReferences(tx, context.tenantId, branch_id, class_type_id);
        if ("failure" in refs) return refs.failure;
        const kindFailure = nonOpenTrainerFailure(session_kind, trainer, branch_id);
        if (kindFailure) return kindFailure;
        const setup = resolveSessionSetup({
          kind: session_kind,
          policy,
          date: class_date,
          startTime: start_time,
          endTime: end_time,
          explicitCapacity: capacity,
          trainerPersonalizedCapacity: trainer.personalized_capacity,
          classTypeCapacityDefault: refs.classType.capacity_default,
        });
        if (!setup.ok) return { errors: { [setup.field]: [setup.message] } };

        // Validar disponibilidad del entrenador (debe ir antes del overlap check)
        const availCheckUpdate = await validateClassWithinTrainerAvailability(trainer_id, class_date, start_time, end_time, tx);
        if (!availCheckUpdate.valid) return availabilityError(availCheckUpdate.reason);

        // Validar solapamiento con otras clases (bajo el lock del entrenador)
        const overlap = await validateTrainerOverlap(tx, trainer_id, class_date, start_time, end_time, id);
        if (overlap) return overlapError(overlap);

        if (structuralChanged) {
          const timeOff = await findTimeOffConflict(tx, context.tenantId, trainer_id, class_date, start_time, end_time);
          if (timeOff) return { errors: { start_time: [timeOffConflictMessage(timeOff)] } };
        }

        // GYM-BOOKINGS 2B (I5): el cupo no puede bajar de las reservas
        // confirmadas; bajo el lock de la sesión ninguna reserva entra en
        // medio. El CHECK scheduled_classes_booked_count_capacity_chk es el respaldo.
        if (setup.capacity < current.booked_count) return capacityError(current.booked_count);

        // OPEN: si cambia fecha u hora, los instantes guardados dejan de ser
        // válidos; se anulan y el motor los deriva de class_date + HH:mm con
        // la timezone. PERSONALIZED/GROUP: se recalculan siempre (3A).
        const instants =
          session_kind !== "OPEN"
            ? { starts_at: setup.startsAt, ends_at: setup.endsAt }
            : timingChanged || current.session_kind !== "OPEN"
              ? { starts_at: null, ends_at: null }
              : {};

        await tx.scheduledClass.update({
          where: { id },
          data: {
            branch_id,
            class_type_id,
            trainer_id,
            class_date: new Date(class_date + "T00:00:00.000Z"),
            start_time,
            end_time,
            ...rest,
            capacity: setup.capacity,
            session_kind,
            is_personalized: session_kind === "OPEN" ? is_personalized : false,
            ...instants,
          },
        });
        return null;
      }, CLASS_SCHEDULING_TX);
    } catch (err) {
      if (String((err as Error)?.message ?? "").includes("scheduled_classes_booked_count_capacity_chk")) {
        return capacityError(target.booked_count);
      }
      throw err;
    }
    if (failure) return failure;

    revalidatePath("/dashboard/classes");
    revalidatePath(`/dashboard/classes/${id}`);
  } finally {
    await dispose();
  }

  redirect(`/dashboard/classes/${formData.get("id")}`);
}

// GYM-BOOKINGS 3A — PERSONALIZED/GROUP: entrenador activo y de la sede de
// la sesión (R10 compara después membresía ↔ sesión). OPEN conserva la
// regla heredada (super_admin puede asignar un entrenador de otra sede).
function nonOpenTrainerFailure(
  kind: GymSessionKind,
  trainer: { status: string; branch_id: string },
  branchId: string
): ClassActionState | null {
  if (kind === "OPEN") return null;
  if (trainer.status !== "active") return { errors: { trainer_id: ["El entrenador no está activo."] } };
  if (trainer.branch_id !== branchId) {
    return { errors: { trainer_id: ["El entrenador debe pertenecer a la sucursal de la sesión."] } };
  }
  return null;
}

// GYM-BOOKINGS 3A — reglas de edición con dependencias (bajo el lock de la sesión):
//  - session_kind no cambia si la sesión tiene reservas (de cualquier
//    estado: su consumo depende del tipo) o pertenece a una serie;
//  - una sesión de serie no cambia de sede (trigger de 2A, mensaje claro);
//  - PERSONALIZED/GROUP cancelada o cerrada no se edita, y con reservas
//    confirmadas no cambia entrenador, sede, fecha ni horario (R10/R14 del
//    alumno ya reservado). OPEN conserva la edición heredada.
async function sessionEditDependencyFailure(
  tx: Prisma.TransactionClient,
  current: {
    id: string;
    session_kind: GymSessionKind;
    series_id: string | null;
    branch_id: string;
    status: string;
    booked_count: number;
  },
  next: { session_kind: GymSessionKind; branch_id: string; structuralChanged: boolean }
): Promise<ClassActionState | null> {
  if (next.session_kind !== current.session_kind) {
    if (current.series_id) {
      return { errors: { session_kind: ["Una sesión generada por una serie conserva el tipo de la serie."] } };
    }
    const bookings = await tx.classBooking.count({ where: { scheduled_class_id: current.id } });
    if (bookings > 0) {
      return { errors: { session_kind: ["No se puede cambiar el tipo de sesión: la clase tiene reservas registradas."] } };
    }
  }
  if (current.series_id && next.branch_id !== current.branch_id) {
    return { errors: { branch_id: ["Una sesión generada por una serie no puede cambiar de sucursal."] } };
  }
  if (current.session_kind !== "OPEN") {
    if (current.status === "cancelled" || current.status === "completed") {
      return { error: "La sesión está cancelada o cerrada: no se puede editar." };
    }
    if (current.booked_count > 0 && next.structuralChanged) {
      return {
        error:
          "La sesión tiene reservas confirmadas: no se puede cambiar entrenador, sucursal, fecha ni horario. Cancela las reservas o la sesión primero.",
      };
    }
  }
  return null;
}

function capacityError(bookedCount: number): ClassActionState {
  return {
    errors: {
      capacity: [`La capacidad no puede ser menor que las reservas confirmadas (${bookedCount}).`],
    },
  };
}

export async function toggleScheduledClassStatusAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireLiveOperationalContext(sessionUser, { module: "gym.classes", write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  try {
    // LIVE-1/LIVE-2: canManageClass admite recepción; cancelar/reactivar exige identidad vigente SA/BA.
    if (!(await liveGymAdminScope(context)).ok) return;

    const id = formData.get("id") as string;
    if (!id) return;

    const target = await context.client.scheduledClass.findFirst({
      where: { id, tenant_id: context.tenantId },
    });
    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!target || !canManageClass(effectiveSessionUser, target)) return;

    if (target.status === "cancelled") {
      // Reactivar la sesión: solo su estado. Las reservas liberadas por una
      // cancelación de sesión (2B) quedan canceladas.
      await context.client.scheduledClass.update({
        where: { id },
        data: { status: "scheduled", cancelled_at: null, cancelled_by_user_id: null, cancel_reason: null },
      });
    } else {
      // GYM-BOOKINGS 2B: con política aplicable (PERSONALIZED / GROUP, u OPEN
      // con apply_policy_to_open) la cancelación libera cupos y sesiones vía
      // GymBookingService.cancelSession. OPEN heredado conserva su
      // comportamiento: solo cambia el estado y las reservas siguen confirmadas.
      const policy = await loadGymBookingPolicy(context.client, context.tenantId);
      const actor = bookingActorFromContext(context);
      if (policyAppliesTo(policy, target.session_kind)) {
        if (!actor) return;
        const result = await createGymBookingService(context.client).cancelSession({
          scope: bookingScopeFromContext(context),
          actor,
          sessionId: id,
          reason: n(formData.get("cancel_reason")) ?? "Sesión cancelada desde la agenda.",
          idempotencyKey: resolveIdempotencyKey(formData.get("idempotency_key")),
        });
        if (!result.ok) return;
      } else {
        await context.client.scheduledClass.update({
          where: { id },
          data: {
            status: "cancelled",
            cancelled_at: new Date(),
            cancelled_by_user_id: context.effectiveUser.id,
          },
        });
      }
    }

    revalidatePath("/dashboard/classes");
    revalidatePath(`/dashboard/classes/${id}`);
  } finally {
    await dispose();
  }
}

export async function deleteScheduledClassAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireLiveOperationalContext(sessionUser, { module: "gym.classes", write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  const id = formData.get("id") as string;
  const date = (formData.get("date") as string) || "";
  const view = (formData.get("view") as string) || "";

  const baseReturn =
    view === "upcoming"
      ? "/dashboard/classes?view=upcoming"
      : `/dashboard/classes?date=${date}`;

  let shouldRedirectTo: string | null = null;

  try {
    // LIVE-1/LIVE-2: canManageClass admite recepción; borrar exige identidad vigente SA/BA.
    if (!id || !(await liveGymAdminScope(context)).ok) return;

    const target = await context.client.scheduledClass.findFirst({
      where: { id, tenant_id: context.tenantId },
      include: {
        _count: {
          select: {
            bookings: true,
            attendance: true,
          },
        },
      },
    });

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!target || !canManageClass(effectiveSessionUser, target)) return;

    if (target._count.bookings > 0) {
      const msg = encodeURIComponent(
        "La clase tiene reservas registradas. Cancélala en lugar de eliminarla."
      );
      shouldRedirectTo = `${baseReturn}&error=${msg}`;
      return;
    }

    if (target._count.attendance > 0) {
      const msg = encodeURIComponent(
        "La clase tiene asistencia registrada. Cancélala en lugar de eliminarla."
      );
      shouldRedirectTo = `${baseReturn}&error=${msg}`;
      return;
    }

    await context.client.scheduledClass.delete({ where: { id } });
    revalidatePath("/dashboard/classes");
    shouldRedirectTo = baseReturn;
  } finally {
    await dispose();
  }

  if (shouldRedirectTo) redirect(shouldRedirectTo);
}

// ══════════════════════════════════════════════
// BOOKINGS
// ══════════════════════════════════════════════

export async function createBookingAction(
  _prev: ClassActionState,
  formData: FormData
): Promise<ClassActionState> {
  const sessionUser = await requireMembershipManager();

  let handle;
  try {
    handle = await requireLiveOperationalContext(sessionUser, { module: "gym.classes", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const raw = {
      scheduled_class_id: formData.get("scheduled_class_id"),
      client_id: formData.get("client_id"),
    };

    const parsed = createBookingSchema.safeParse(raw);
    if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

    const { scheduled_class_id, client_id } = parsed.data;

    // GYM-BOOKINGS 2B: alcance, membresía, modalidad, cupo, duplicado y
    // reactivación los resuelve GymBookingService bajo bloqueo (una tx).
    const actor = bookingActorFromContext(context);
    if (!actor) return { error: "Sin permiso para gestionar esta clase." };

    const result = await createGymBookingService(context.client).bookSession({
      scope: bookingScopeFromContext(context),
      actor,
      channel: "STAFF",
      sessionId: scheduled_class_id,
      clientId: client_id,
      idempotencyKey: resolveIdempotencyKey(formData.get("idempotency_key")),
    });
    if (!result.ok) return { error: gymBookingErrorMessage(result.code, "staff", result.message) };

    revalidatePath(`/dashboard/classes/${scheduled_class_id}`);
    return undefined;
  } finally {
    await dispose();
  }
}

export async function cancelBookingAction(formData: FormData): Promise<void> {
  const sessionUser = await requireMembershipManager();

  let handle;
  try {
    handle = await requireLiveOperationalContext(sessionUser, { module: "gym.classes", write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  let redirectTo: string | null = null;
  try {
    const booking_id = formData.get("booking_id") as string;
    if (!booking_id) return;
    const returnClassId = n(formData.get("scheduled_class_id"));

    const actor = bookingActorFromContext(context);
    if (!actor) return;

    const result = await createGymBookingService(context.client).cancelBooking({
      scope: bookingScopeFromContext(context),
      actor,
      channel: "STAFF",
      bookingId: booking_id,
      reason: n(formData.get("reason")) ?? undefined,
      idempotencyKey: resolveIdempotencyKey(formData.get("idempotency_key")),
    });

    const classId = result.ok ? result.value.sessionId : returnClassId;
    if (result.ok) revalidatePath(`/dashboard/classes/${classId}`);
    if (classId) redirectTo = classDetailUrl(classId, result.ok ? null : gymBookingErrorMessage(result.code, "staff", result.message));
  } finally {
    await dispose();
  }
  if (redirectTo) redirect(redirectTo);
}

/** Acciones void del detalle de clase: el error viaja en ?error= (mismo patrón que la agenda). */
function classDetailUrl(classId: string, error: string | null): string {
  return error
    ? `/dashboard/classes/${classId}?error=${encodeURIComponent(error)}`
    : `/dashboard/classes/${classId}`;
}

// ══════════════════════════════════════════════
// ATTENDANCE
// ══════════════════════════════════════════════

export async function recordAttendanceAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireMembershipManager();

  let handle;
  try {
    handle = await requireLiveOperationalContext(sessionUser, { module: "gym.classes", write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  let redirectTo: string | null = null;
  try {
    const raw = {
      scheduled_class_id: formData.get("scheduled_class_id"),
      client_id: formData.get("client_id"),
      attendance_status: formData.get("attendance_status"),
      notes: n(formData.get("notes")),
    };

    const parsed = recordAttendanceSchema.safeParse(raw);
    if (!parsed.success) return;

    const { scheduled_class_id, client_id, attendance_status } = parsed.data;

    const actor = bookingActorFromContext(context);
    if (!actor) return;

    // GYM-BOOKINGS 2B: la asistencia se registra sobre la reserva (sesión,
    // cliente) del tenant efectivo; el servicio valida alcance, estado y ventana.
    const booking = await context.client.classBooking.findFirst({
      where: { scheduled_class_id, client_id, tenant_id: context.tenantId },
      select: { id: true },
    });

    let error: string | null = null;
    if (!booking) {
      error = "El cliente no tiene una reserva en esta clase.";
    } else if (attendance_status === "cancelled") {
      error = gymBookingErrorMessage("INVALID_COMMAND");
    } else {
      const result = await createGymBookingService(context.client).recordAttendance({
        scope: bookingScopeFromContext(context),
        actor,
        channel: "STAFF",
        bookingId: booking.id,
        status: attendance_status,
        // Sin campo "notes" en el formulario → no se sobrescribe la nota existente.
        notes: optionalFormText(formData, "notes"),
        idempotencyKey: resolveIdempotencyKey(formData.get("idempotency_key")),
      });
      if (result.ok) revalidatePath(`/dashboard/classes/${scheduled_class_id}`);
      else error = gymBookingErrorMessage(result.code, "staff", result.message);
    }
    redirectTo = classDetailUrl(scheduled_class_id, error);
  } finally {
    await dispose();
  }
  if (redirectTo) redirect(redirectTo);
}
