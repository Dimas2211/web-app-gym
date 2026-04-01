"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  requireClientManager,
  canManageClient,
  getSessionOrRedirect,
} from "@/lib/permissions/guards";
import {
  checkDeleteAuth,
  type DeleteAuthActionState,
} from "@/lib/permissions/delete-authorization";
import { createClientSchema, updateClientSchema } from "./schemas";
import { suggestNextClientCode, generateQrToken } from "@/lib/utils/operational-codes";

export type ClientActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

function normalizeEmpty(value: FormDataEntryValue | null): string | null {
  const str = value as string | null;
  if (!str || str.trim() === "") return null;
  return str.trim();
}

function parseFormData(formData: FormData) {
  return {
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    document_id: normalizeEmpty(formData.get("document_id")),
    birth_date: normalizeEmpty(formData.get("birth_date")),
    gender: normalizeEmpty(formData.get("gender")),
    email: normalizeEmpty(formData.get("email")),
    phone: normalizeEmpty(formData.get("phone")),
    address: normalizeEmpty(formData.get("address")),
    emergency_contact_name: normalizeEmpty(formData.get("emergency_contact_name")),
    emergency_contact_phone: normalizeEmpty(formData.get("emergency_contact_phone")),
    sport_id: normalizeEmpty(formData.get("sport_id")),
    goal_id: normalizeEmpty(formData.get("goal_id")),
    assigned_trainer_id: normalizeEmpty(formData.get("assigned_trainer_id")),
    notes: normalizeEmpty(formData.get("notes")),
    branch_id: formData.get("branch_id"),
  };
}

// ──────────────────────────────────────────────
// Crear cliente
// ──────────────────────────────────────────────
export async function createClientAction(
  _prev: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const sessionUser = await requireClientManager();

  const raw = parseFormData(formData);

  // reception solo puede crear en su sucursal
  if (sessionUser.role === "reception") {
    if (raw.branch_id !== sessionUser.branch_id) {
      return { error: "Solo puedes registrar clientes en tu propia sucursal." };
    }
  }

  const parsed = createClientSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { branch_id, birth_date, gender, ...rest } = parsed.data;

  // Generar código operativo y token QR para el nuevo cliente
  const operational_code = await suggestNextClientCode(sessionUser.gym_id);
  const qr_token = generateQrToken();

  await prisma.client.create({
    data: {
      gym_id: sessionUser.gym_id,
      branch_id,
      ...rest,
      birth_date: birth_date ? new Date(birth_date) : null,
      gender: gender ?? null,
      status: "active",
      operational_code,
      qr_token,
    },
  });

  revalidatePath("/dashboard/clients");
  redirect("/dashboard/clients");
}

// ──────────────────────────────────────────────
// Editar cliente
// ──────────────────────────────────────────────
export async function updateClientAction(
  _prev: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const sessionUser = await requireClientManager();
  const id = formData.get("id") as string;
  if (!id) return { error: "ID de cliente requerido." };

  const target = await prisma.client.findUnique({ where: { id } });
  if (!target) return { error: "Cliente no encontrado." };
  if (!canManageClient(sessionUser, target)) {
    return { error: "Sin permiso para editar este cliente." };
  }

  const raw = parseFormData(formData);

  const parsed = updateClientSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { branch_id, birth_date, gender, ...rest } = parsed.data;

  await prisma.client.update({
    where: { id },
    data: {
      branch_id,
      ...rest,
      birth_date: birth_date ? new Date(birth_date) : null,
      gender: gender ?? null,
    },
  });

  revalidatePath("/dashboard/clients");
  revalidatePath(`/dashboard/clients/${id}`);
  redirect("/dashboard/clients");
}

// ──────────────────────────────────────────────
// Portal del cliente: habilitar acceso
// ──────────────────────────────────────────────

const enablePortalSchema = z.object({
  portal_email: z.string().email("Correo electrónico inválido"),
  portal_password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres"),
});

/**
 * Crea un User con role=client y lo vincula al Client.
 * Solo se puede llamar si el Client no tiene user_id todavía.
 */
export async function enableClientPortalAction(
  _prev: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const sessionUser = await requireClientManager();
  const clientId = formData.get("client_id") as string;
  if (!clientId) return { error: "ID de cliente requerido." };

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return { error: "Cliente no encontrado." };
  if (!canManageClient(sessionUser, client)) {
    return { error: "Sin permiso para modificar este cliente." };
  }
  if (client.user_id) {
    return { error: "Este cliente ya tiene acceso al portal habilitado." };
  }

  const raw = {
    portal_email: formData.get("portal_email"),
    portal_password: formData.get("portal_password"),
  };

  const parsed = enablePortalSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: parsed.data.portal_email },
  });
  if (existingUser) {
    return { errors: { portal_email: ["Este correo ya está en uso por otra cuenta."] } };
  }

  const password_hash = await bcrypt.hash(parsed.data.portal_password, 10);

  await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        gym_id: client.gym_id,
        branch_id: client.branch_id,
        email: parsed.data.portal_email,
        password_hash,
        first_name: client.first_name,
        last_name: client.last_name,
        role: "client",
        status: "active",
      },
    });
    await tx.client.update({
      where: { id: clientId },
      data: { user_id: newUser.id },
    });
  });

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath("/dashboard/clients");
}

// ──────────────────────────────────────────────
// Portal del cliente: activar / desactivar acceso
// ──────────────────────────────────────────────

/**
 * Activa o desactiva la cuenta User vinculada al Client.
 * No elimina el vínculo: permite reactivar sin nueva contraseña.
 */
export async function toggleClientPortalStatusAction(
  formData: FormData
): Promise<void> {
  const sessionUser = await requireClientManager();
  const clientId = formData.get("client_id") as string;
  if (!clientId) return;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { user: { select: { id: true, status: true } } },
  });

  if (!client || !canManageClient(sessionUser, client)) return;
  if (!client.user_id || !client.user) return;

  await prisma.user.update({
    where: { id: client.user_id },
    data: {
      status: client.user.status === "active" ? "inactive" : "active",
    },
  });

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath("/dashboard/clients");
}

// ──────────────────────────────────────────────
// Eliminación definitiva con autorización
// ──────────────────────────────────────────────
export async function deleteClientAction(
  _prev: DeleteAuthActionState,
  formData: FormData
): Promise<DeleteAuthActionState> {
  const sessionUser = await getSessionOrRedirect();
  const id = formData.get("id") as string;
  if (!id) return { error: "Datos inválidos" };

  const target = await prisma.client.findFirst({
    where: { id, gym_id: sessionUser.gym_id },
    include: {
      _count: {
        select: {
          memberships: true,
          class_bookings: true,
          class_attendance: true,
          weekly_plans: true,
        },
      },
    },
  });

  if (!target) return { error: "Cliente no encontrado." };
  if (!canManageClient(sessionUser, target)) {
    return { error: "Sin permisos para gestionar este cliente." };
  }

  // Bloqueos por dependencias: cualquier historial impide la eliminación
  const blocks: string[] = [];
  if (target._count.memberships > 0)
    blocks.push(`${target._count.memberships} membresía(s)`);
  if (target._count.class_bookings > 0)
    blocks.push(`${target._count.class_bookings} reserva(s) de clase`);
  if (target._count.class_attendance > 0)
    blocks.push(`${target._count.class_attendance} registro(s) de asistencia`);
  if (target._count.weekly_plans > 0)
    blocks.push(`${target._count.weekly_plans} plan(es) semanal(es)`);
  if (target.user_id)
    blocks.push("portal de acceso habilitado (deshabilítalo primero desde la ficha del cliente)");

  if (blocks.length > 0) {
    return {
      error: `No se puede eliminar: el cliente tiene ${blocks.join(", ")}. Desactívalo en su lugar, o elimina primero esos registros.`,
    };
  }

  const auth = await checkDeleteAuth(formData, sessionUser);
  if (!auth.ok) return { error: auth.error };

  await prisma.client.delete({ where: { id } });
  revalidatePath("/dashboard/clients");
  redirect("/dashboard/clients");
}

// ──────────────────────────────────────────────
// Cambiar estado (soft delete / toggle)
// ──────────────────────────────────────────────
export async function toggleClientStatusAction(formData: FormData): Promise<void> {
  const sessionUser = await requireClientManager();
  const id = formData.get("id") as string;
  if (!id) return;

  const target = await prisma.client.findUnique({ where: { id } });
  if (!target || !canManageClient(sessionUser, target)) return;

  await prisma.client.update({
    where: { id },
    data: { status: target.status === "active" ? "inactive" : "active" },
  });

  revalidatePath("/dashboard/clients");
}
