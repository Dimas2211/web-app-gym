"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-dte-issuer-config.action.ts
//
// Crea la configuración fiscal del emisor DTE para un location.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { createDteIssuerConfigSchema } from "../schemas/dte-issuer-config.schemas";
import { createDteIssuerConfig } from "../services/dte-issuer-config.service";
import type { CreateDteIssuerConfigInput } from "../schemas/dte-issuer-config.schemas";

export type CreateDteIssuerConfigActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: string; errors?: Record<string, string[]> };

export async function createDteIssuerConfigAction(
  input: CreateDteIssuerConfigInput,
): Promise<CreateDteIssuerConfigActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa. Selecciona una sucursal para configurar el emisor DTE." };

  const parsed = createDteIssuerConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok:     false,
      error:  "Datos de configuración DTE no válidos.",
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const result = await createDteIssuerConfig(tenant_id, location_id, sessionUser.id, parsed.data);

  if (!result.ok) {
    return result.field
      ? { ok: false, field: result.field, error: result.error }
      : { ok: false, error: result.error };
  }

  revalidatePath("/dashboard/dte/issuer-config");

  return { ok: true, id: result.id };
}
