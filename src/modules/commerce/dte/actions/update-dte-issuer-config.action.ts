"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — update-dte-issuer-config.action.ts
//
// Actualiza la configuración fiscal del emisor DTE de un location.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { updateDteIssuerConfigSchema } from "../schemas/dte-issuer-config.schemas";
import { updateDteIssuerConfig } from "../services/dte-issuer-config.service";
import type { UpdateDteIssuerConfigInput } from "../schemas/dte-issuer-config.schemas";

export type UpdateDteIssuerConfigActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: string; errors?: Record<string, string[]> };

export async function updateDteIssuerConfigAction(
  config_id: string,
  input:     UpdateDteIssuerConfigInput,
): Promise<UpdateDteIssuerConfigActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };
  if (!config_id?.trim()) return { ok: false, error: "El ID de configuración DTE es requerido." };

  const parsed = updateDteIssuerConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok:     false,
      error:  "Datos de configuración DTE no válidos.",
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const result = await updateDteIssuerConfig(config_id, tenant_id, location_id, sessionUser.id, parsed.data);

  if (!result.ok) {
    return result.field
      ? { ok: false, field: result.field, error: result.error }
      : { ok: false, error: result.error };
  }

  revalidatePath("/dashboard/dte/issuer-config");
  revalidatePath(`/dashboard/dte/issuer-config/${config_id}`);

  return { ok: true };
}
