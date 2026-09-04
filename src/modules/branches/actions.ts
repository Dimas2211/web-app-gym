"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireSuperAdmin, canManageBranch } from "@/lib/permissions/guards";
import {
  createLocation,
  updateLocation,
  toggleLocationStatus,
} from "@/core/modules/locations/actions";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

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

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(user.tenant_id);
    assertOrganizationModule(commercialCtx, "core.locations");

    const result = await createLocation(
      user.tenant_id,
      {
        name: formData.get("name"),
        address: formData.get("address") || undefined,
        phone: formData.get("phone") || undefined,
      },
      commercialCtx,
    );

    if (!result.success) return result;
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

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

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(user.tenant_id);
    assertOrganizationModule(commercialCtx, "core.locations");

    // Edición no cambia el estado activo/inactivo -> no consume ni libera cupo.
    const result = await updateLocation(id, user.tenant_id, {
      name: formData.get("name"),
      address: formData.get("address") || undefined,
      phone: formData.get("phone") || undefined,
    });

    if (!result.success) return result;
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

  revalidatePath("/dashboard/branches");
  redirect("/dashboard/branches");
}

// ──────────────────────────────────────────────
// Cambiar estado (sin borrado físico)
// ──────────────────────────────────────────────
//
// Retorna void (invocada vía <form action={...}> sin useActionState, no
// hay canal de error hoy) — un bloqueo de capacidad se comunica con
// redirect + query param, leído como banner en branches/page.tsx.
export async function toggleBranchStatusAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = formData.get("id") as string;

  if (!id || !canManageBranch(user, id)) return;

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(user.tenant_id);
    assertOrganizationModule(commercialCtx, "core.locations");

    const result = await toggleLocationStatus(id, user.tenant_id, commercialCtx);
    if (!result.success) {
      revalidatePath("/dashboard/branches");
      redirect("/dashboard/branches?commercial_error=capacity_limit_reached");
    }
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      revalidatePath("/dashboard/branches");
      redirect("/dashboard/branches?commercial_error=module_not_enabled");
    }
    throw err;
  }

  revalidatePath("/dashboard/branches");
}
