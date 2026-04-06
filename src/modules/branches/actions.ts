"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireSuperAdmin, canManageBranch } from "@/lib/permissions/guards";
import {
  createLocation,
  updateLocation,
  toggleLocationStatus,
} from "@/core/modules/locations/actions";

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

  const result = await createLocation(user.tenant_id, {
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
  });

  if (!result.success) return result;

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

  const result = await updateLocation(id, user.tenant_id, {
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
  });

  if (!result.success) return result;

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

  await toggleLocationStatus(id, user.tenant_id);

  revalidatePath("/dashboard/branches");
}
