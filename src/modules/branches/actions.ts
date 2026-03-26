"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin, requireSuperAdmin, canManageBranch } from "@/lib/permissions/guards";
import { branchSchema } from "./schemas";

export type BranchActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

// ──────────────────────────────────────────────
// Crear sucursal (solo super_admin)
// ──────────────────────────────────────────────
export async function createBranchAction(
  _prev: BranchActionState,
  formData: FormData
): Promise<BranchActionState> {
  const user = await requireSuperAdmin();

  const parsed = branchSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  await prisma.branch.create({
    data: {
      ...parsed.data,
      gym_id: user.gym_id,
      status: "active",
    },
  });

  revalidatePath("/dashboard/branches");
  redirect("/dashboard/branches");
}

// ──────────────────────────────────────────────
// Editar sucursal
// ──────────────────────────────────────────────
export async function updateBranchAction(
  _prev: BranchActionState,
  formData: FormData
): Promise<BranchActionState> {
  const user = await requireAdmin();
  const id = formData.get("id") as string;

  if (!id) return { error: "ID de sucursal requerido." };
  if (!canManageBranch(user, id)) return { error: "Sin permiso para editar esta sucursal." };

  const parsed = branchSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  await prisma.branch.update({
    where: { id },
    data: parsed.data,
  });

  revalidatePath("/dashboard/branches");
  redirect("/dashboard/branches");
}

// ──────────────────────────────────────────────
// Cambiar estado (sin borrado físico)
// ──────────────────────────────────────────────
export async function toggleBranchStatusAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = formData.get("id") as string;

  if (!id || !canManageBranch(user, id)) return;

  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) return;

  await prisma.branch.update({
    where: { id },
    data: { status: branch.status === "active" ? "inactive" : "active" },
  });

  revalidatePath("/dashboard/branches");
}
