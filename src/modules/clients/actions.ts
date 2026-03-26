"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireClientManager, canManageClient } from "@/lib/permissions/guards";
import { createClientSchema, updateClientSchema } from "./schemas";

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

  await prisma.client.create({
    data: {
      gym_id: sessionUser.gym_id,
      branch_id,
      ...rest,
      birth_date: birth_date ? new Date(birth_date) : null,
      gender: gender ?? null,
      status: "active",
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
