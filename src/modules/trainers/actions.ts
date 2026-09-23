"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import {
  requireAdmin,
  canManageTrainer,
  getSessionOrRedirect,
  type SessionUser,
} from "@/lib/permissions/guards";
import {
  checkDeleteAuth,
  type DeleteAuthActionState,
} from "@/lib/permissions/delete-authorization";
import {
  createTrainerSchema,
  updateTrainerSchema,
  availabilitySlotSchema,
} from "./schemas";
import { checkAvailabilitySlotCanBeRemoved } from "./availability-validator";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type TrainerActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

function normalizeEmpty(value: FormDataEntryValue | null): string | null {
  const str = value as string | null;
  if (!str || str.trim() === "") return null;
  return str.trim();
}

function parseTrainerFormData(formData: FormData) {
  return {
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    email: normalizeEmpty(formData.get("email")),
    phone: normalizeEmpty(formData.get("phone")),
    specialty: normalizeEmpty(formData.get("specialty")),
    notes: normalizeEmpty(formData.get("notes")),
    branch_id: formData.get("branch_id"),
    user_id: normalizeEmpty(formData.get("user_id")),
  };
}

// ──────────────────────────────────────────────
// Crear entrenador
// ──────────────────────────────────────────────
export async function createTrainerAction(
  _prev: TrainerActionState,
  formData: FormData
): Promise<TrainerActionState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.trainers", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const effectiveRole = context.effectiveUser.role;
    const raw = parseTrainerFormData(formData);

    // branch_admin solo puede crear en su sucursal
    if (
      effectiveRole === "branch_admin" &&
      raw.branch_id !== context.locationId
    ) {
      return { error: "Solo puedes registrar entrenadores en tu propia sucursal." };
    }

    const parsed = createTrainerSchema.safeParse(raw);
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    const { user_id, ...rest } = parsed.data;

    if (!context.gymId) {
      return { error: "El módulo GYM no está configurado para esta organización." };
    }

    // Validar que el user_id elegido pertenezca al mismo tenant y tenga rol trainer
    if (user_id) {
      const linkedUser = await context.client.user.findFirst({
        where: {
          id: user_id,
          tenant_id: context.tenantId,
          role: "trainer",
        },
      });
      if (!linkedUser) {
        return { error: "El usuario seleccionado no es válido." };
      }
      if (
        effectiveRole === "branch_admin" &&
        linkedUser.branch_id !== context.locationId
      ) {
        return { error: "El usuario seleccionado no pertenece a tu sucursal." };
      }
    }

    await context.client.trainer.create({
      data: {
        gym_id: context.gymId,
        tenant_id: context.tenantId,
        ...rest,
        user_id: user_id ?? null,
        status: "active",
      },
    });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/trainers");
  redirect("/dashboard/trainers");
}

// ──────────────────────────────────────────────
// Editar entrenador
// ──────────────────────────────────────────────
export async function updateTrainerAction(
  _prev: TrainerActionState,
  formData: FormData
): Promise<TrainerActionState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.trainers", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return { error: "ID de entrenador requerido." };

    const target = await context.client.trainer.findFirst({
      where: { id, tenant_id: context.tenantId },
    });
    if (!target) return { error: "Entrenador no encontrado." };

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!canManageTrainer(effectiveSessionUser, target)) {
      return { error: "Sin permiso para editar este entrenador." };
    }

    const raw = parseTrainerFormData(formData);
    const parsed = updateTrainerSchema.safeParse(raw);
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    const { user_id, ...rest } = parsed.data;

    // Determinar el user_id final:
    // - Si ya tiene user_id: preservar el vínculo existente (no se puede cambiar desde aquí)
    // - Si no tiene user_id y se envió uno nuevo: validar y vincular (linking de registros legacy)
    // - Si no tiene user_id y no se envió: mantener null
    let resolvedUserId = target.user_id;

    if (!target.user_id && user_id) {
      const linkedUser = await context.client.user.findFirst({
        where: {
          id: user_id,
          tenant_id: context.tenantId,
          role: "trainer",
        },
      });
      if (!linkedUser) {
        return { error: "El usuario seleccionado no es válido." };
      }
      if (
        context.effectiveUser.role === "branch_admin" &&
        linkedUser.branch_id !== context.locationId
      ) {
        return { error: "El usuario seleccionado no pertenece a tu sucursal." };
      }
      resolvedUserId = user_id;
    }

    await context.client.trainer.update({
      where: { id },
      data: { ...rest, user_id: resolvedUserId },
    });

    revalidatePath("/dashboard/trainers");
    revalidatePath(`/dashboard/trainers/${id}`);
  } finally {
    await dispose();
  }

  redirect("/dashboard/trainers");
}

// ──────────────────────────────────────────────
// Eliminación definitiva con autorización
// ──────────────────────────────────────────────
export async function deleteTrainerAction(
  _prev: DeleteAuthActionState,
  formData: FormData
): Promise<DeleteAuthActionState> {
  const sessionUser = await getSessionOrRedirect();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.trainers", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return { error: "Datos inválidos" };

    const target = await context.client.trainer.findFirst({
      where: { id, tenant_id: context.tenantId },
      include: {
        _count: {
          select: {
            scheduled_classes: true,
            client_weekly_plans: true,
          },
        },
      },
    });

    if (!target) return { error: "Entrenador no encontrado." };

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!canManageTrainer(effectiveSessionUser, target)) {
      return { error: "Sin permisos para gestionar este entrenador." };
    }

    // Bloqueos por dependencias
    const blocks: string[] = [];
    if (target._count.scheduled_classes > 0)
      blocks.push(`${target._count.scheduled_classes} clase(s) programada(s)`);
    if (target._count.client_weekly_plans > 0)
      blocks.push(
        `${target._count.client_weekly_plans} plan(es) semanal(es) de clientes asignados`
      );

    if (blocks.length > 0) {
      return {
        error: `No se puede eliminar: el entrenador tiene ${blocks.join(", ")}. Desactívalo en su lugar, o reasigna esos registros primero.`,
      };
    }

    const auth = await checkDeleteAuth(
      formData,
      { role: context.effectiveUser.role as UserRole, tenant_id: context.tenantId },
      context.client,
    );
    if (!auth.ok) return { error: auth.error };

    // Eliminar disponibilidad y luego el entrenador, en la misma transacción runtime.
    await context.client.$transaction(async (tx) => {
      await tx.trainerAvailability.deleteMany({ where: { trainer_id: id } });
      await tx.trainer.delete({ where: { id } });
    });
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/trainers");
  redirect("/dashboard/trainers");
}

// ──────────────────────────────────────────────
// Cambiar estado (soft delete / toggle)
// ──────────────────────────────────────────────
export async function toggleTrainerStatusAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.trainers", write: true });
  } catch {
    return;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return;

    const target = await context.client.trainer.findFirst({
      where: { id, tenant_id: context.tenantId },
    });
    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!target || !canManageTrainer(effectiveSessionUser, target)) return;

    await context.client.trainer.update({
      where: { id },
      data: { status: target.status === "active" ? "inactive" : "active" },
    });

    revalidatePath("/dashboard/trainers");
    revalidatePath(`/dashboard/trainers/${id}`);
  } finally {
    await dispose();
  }
}

// ──────────────────────────────────────────────
// Agregar bloque de disponibilidad
// ──────────────────────────────────────────────
export async function addAvailabilitySlotAction(
  _prev: TrainerActionState,
  formData: FormData
): Promise<TrainerActionState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.trainers", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const raw = {
      trainer_id: formData.get("trainer_id"),
      day_of_week: formData.get("day_of_week"),
      start_time: formData.get("start_time"),
      end_time: formData.get("end_time"),
    };

    const parsed = availabilitySlotSchema.safeParse(raw);
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    const trainer = await context.client.trainer.findFirst({
      where: { id: parsed.data.trainer_id, tenant_id: context.tenantId },
    });
    if (!trainer) return { error: "Entrenador no encontrado." };

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!canManageTrainer(effectiveSessionUser, trainer)) {
      return { error: "Sin permiso para gestionar este entrenador." };
    }

    const { trainer_id, day_of_week, start_time, end_time } = parsed.data;

    // Detectar solapamiento con bloques existentes del mismo día
    const existing = await context.client.trainerAvailability.findMany({
      where: { trainer_id, day_of_week, status: "active" },
    });

    const hasOverlap = existing.some(
      (slot) => start_time < slot.end_time && end_time > slot.start_time
    );

    if (hasOverlap) {
      return {
        errors: {
          start_time: ["Este bloque se solapa con uno ya existente en el mismo día."],
        },
      };
    }

    await context.client.trainerAvailability.create({
      data: {
        gym_id: trainer.gym_id,
        tenant_id: trainer.tenant_id ?? undefined,
        branch_id: trainer.branch_id,
        trainer_id,
        day_of_week,
        start_time,
        end_time,
        status: "active",
      },
    });

    revalidatePath(`/dashboard/trainers/${trainer_id}/availability`);
    revalidatePath(`/dashboard/trainers/${trainer_id}`);
  } finally {
    await dispose();
  }
}

// ──────────────────────────────────────────────
// Eliminar bloque de disponibilidad (soft delete)
// ──────────────────────────────────────────────
export async function removeAvailabilitySlotAction(
  _prev: TrainerActionState,
  formData: FormData,
): Promise<TrainerActionState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "gym.trainers", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const slot_id = formData.get("slot_id") as string;
    const trainer_id = formData.get("trainer_id") as string;
    if (!slot_id || !trainer_id) return { error: "Datos inválidos." };

    const slot = await context.client.trainerAvailability.findFirst({
      where: { id: slot_id, tenant_id: context.tenantId },
      include: { trainer: true },
    });
    if (!slot) return { error: "Bloque no encontrado." };

    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!canManageTrainer(effectiveSessionUser, slot.trainer))
      return { error: "Sin permiso para gestionar este entrenador." };

    // Verificar que no haya clases programadas que queden sin cobertura
    const check = await checkAvailabilitySlotCanBeRemoved(
      slot_id,
      slot.trainer_id,
      slot.day_of_week,
      context.client,
    );
    if (!check.canRemove) {
      return { error: check.message };
    }

    await context.client.trainerAvailability.update({
      where: { id: slot_id },
      data: { status: "inactive" },
    });

    revalidatePath(`/dashboard/trainers/${trainer_id}/availability`);
    revalidatePath(`/dashboard/trainers/${trainer_id}`);
  } finally {
    await dispose();
  }
}

// Helper exportado para usar en páginas
export { requireAdmin as requireTrainerAdmin };
export type { SessionUser };
