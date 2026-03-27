"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
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
  const raw = parseTrainerFormData(formData);

  // branch_admin solo puede crear en su sucursal
  if (
    sessionUser.role === "branch_admin" &&
    raw.branch_id !== sessionUser.branch_id
  ) {
    return { error: "Solo puedes registrar entrenadores en tu propia sucursal." };
  }

  const parsed = createTrainerSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { user_id, ...rest } = parsed.data;

  // Validar que el user_id elegido pertenezca al mismo gym/branch y tenga rol trainer
  if (user_id) {
    const linkedUser = await prisma.user.findFirst({
      where: {
        id: user_id,
        gym_id: sessionUser.gym_id,
        role: "trainer",
      },
    });
    if (!linkedUser) {
      return { error: "El usuario seleccionado no es válido." };
    }
    if (
      sessionUser.role === "branch_admin" &&
      linkedUser.branch_id !== sessionUser.branch_id
    ) {
      return { error: "El usuario seleccionado no pertenece a tu sucursal." };
    }
  }

  await prisma.trainer.create({
    data: {
      gym_id: sessionUser.gym_id,
      ...rest,
      user_id: user_id ?? null,
      status: "active",
    },
  });

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
  const id = formData.get("id") as string;
  if (!id) return { error: "ID de entrenador requerido." };

  const target = await prisma.trainer.findUnique({ where: { id } });
  if (!target) return { error: "Entrenador no encontrado." };
  if (!canManageTrainer(sessionUser, target)) {
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
    const linkedUser = await prisma.user.findFirst({
      where: {
        id: user_id,
        gym_id: sessionUser.gym_id,
        role: "trainer",
      },
    });
    if (!linkedUser) {
      return { error: "El usuario seleccionado no es válido." };
    }
    if (
      sessionUser.role === "branch_admin" &&
      linkedUser.branch_id !== sessionUser.branch_id
    ) {
      return { error: "El usuario seleccionado no pertenece a tu sucursal." };
    }
    resolvedUserId = user_id;
  }

  await prisma.trainer.update({
    where: { id },
    data: { ...rest, user_id: resolvedUserId },
  });

  revalidatePath("/dashboard/trainers");
  revalidatePath(`/dashboard/trainers/${id}`);
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
  const id = formData.get("id") as string;
  if (!id) return { error: "Datos inválidos" };

  const target = await prisma.trainer.findFirst({
    where: { id, gym_id: sessionUser.gym_id },
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
  if (!canManageTrainer(sessionUser, target)) {
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

  const auth = await checkDeleteAuth(formData, sessionUser);
  if (!auth.ok) return { error: auth.error };

  // Eliminar disponibilidad y luego el entrenador en transacción
  await prisma.$transaction(async (tx) => {
    await tx.trainerAvailability.deleteMany({ where: { trainer_id: id } });
    await tx.trainer.delete({ where: { id } });
  });

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
  const id = formData.get("id") as string;
  if (!id) return;

  const target = await prisma.trainer.findUnique({ where: { id } });
  if (!target || !canManageTrainer(sessionUser, target)) return;

  await prisma.trainer.update({
    where: { id },
    data: { status: target.status === "active" ? "inactive" : "active" },
  });

  revalidatePath("/dashboard/trainers");
  revalidatePath(`/dashboard/trainers/${id}`);
}

// ──────────────────────────────────────────────
// Agregar bloque de disponibilidad
// ──────────────────────────────────────────────
export async function addAvailabilitySlotAction(
  _prev: TrainerActionState,
  formData: FormData
): Promise<TrainerActionState> {
  const sessionUser = await requireAdmin();

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

  const trainer = await prisma.trainer.findUnique({
    where: { id: parsed.data.trainer_id },
  });
  if (!trainer) return { error: "Entrenador no encontrado." };
  if (!canManageTrainer(sessionUser, trainer)) {
    return { error: "Sin permiso para gestionar este entrenador." };
  }

  const { trainer_id, day_of_week, start_time, end_time } = parsed.data;

  // Detectar solapamiento con bloques existentes del mismo día
  const existing = await prisma.trainerAvailability.findMany({
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

  await prisma.trainerAvailability.create({
    data: {
      gym_id: trainer.gym_id,
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
}

// ──────────────────────────────────────────────
// Eliminar bloque de disponibilidad (soft delete)
// ──────────────────────────────────────────────
export async function removeAvailabilitySlotAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireAdmin();
  const slot_id = formData.get("slot_id") as string;
  const trainer_id = formData.get("trainer_id") as string;
  if (!slot_id || !trainer_id) return;

  const slot = await prisma.trainerAvailability.findUnique({
    where: { id: slot_id },
    include: { trainer: true },
  });
  if (!slot) return;
  if (!canManageTrainer(sessionUser, slot.trainer)) return;

  await prisma.trainerAvailability.update({
    where: { id: slot_id },
    data: { status: "inactive" },
  });

  revalidatePath(`/dashboard/trainers/${trainer_id}/availability`);
  revalidatePath(`/dashboard/trainers/${trainer_id}`);
}

// Helper exportado para usar en páginas
export { requireAdmin as requireTrainerAdmin };
export type { SessionUser };
