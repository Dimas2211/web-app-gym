"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { requireAdmin, requireSuperAdmin, canManageBranch } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  createLocation,
  updateLocation,
  toggleLocationStatus,
} from "@/core/modules/locations/actions";
import { CommercialEnforcementError } from "@/modules/platform/runtime/commercial-enforcement";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

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
  // requireSuperAdmin(): gate de sesión/rol inicial sin cambios para PLATFORM.
  const user = await requireSuperAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "core.locations", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    // FASE VI-D3: autoriza con el ROL LIVE — un RUNTIME_CLIENT degradado
    // desde super_admin no debe seguir pudiendo crear sucursales.
    if (!getCapabilities(context.effectiveUser.role as UserRole).isGlobal) {
      return { error: "Sin permisos para esta operación." };
    }

    const result = await createLocation(
      context.tenantId,
      {
        name: formData.get("name"),
        address: formData.get("address") || undefined,
        phone: formData.get("phone") || undefined,
      },
      context.commercialContext!,
      context.client,
    );

    if (!result.success) return result;
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  } finally {
    await dispose();
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

  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "core.locations", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    if (!id) return { error: "ID de sucursal requerido." };

    // FASE VI-D3 — ETAPA H: misma política de siempre (branch_admin no
    // puede administrar otra branch), evaluada con el ROL/location LIVE.
    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!canManageBranch(effectiveSessionUser, id)) {
      return { error: "Sin permiso para editar esta sucursal." };
    }

    // Edición no cambia el estado activo/inactivo -> no consume ni libera cupo.
    const result = await updateLocation(id, context.tenantId, {
      name: formData.get("name"),
      address: formData.get("address") || undefined,
      phone: formData.get("phone") || undefined,
    }, context.client);

    if (!result.success) return result;
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  } finally {
    await dispose();
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

  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "core.locations", write: true });
  } catch {
    // Fail closed silencioso — este action retorna void (sin canal de
    // error, ver comentario de arriba); el estado no cambia.
    return;
  }
  const { context, dispose } = handle;

  try {
    const id = formData.get("id") as string;
    const effectiveSessionUser = {
      ...context.effectiveUser,
      role: context.effectiveUser.role as UserRole,
    };
    if (!id || !canManageBranch(effectiveSessionUser, id)) return;

    const result = await toggleLocationStatus(id, context.tenantId, context.commercialContext!, context.client);
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
  } finally {
    await dispose();
  }

  revalidatePath("/dashboard/branches");
}
