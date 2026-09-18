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
import { updateDteIssuerConfigSchema } from "../schemas/dte-issuer-config.schemas";
import { updateDteIssuerConfig } from "../services/dte-issuer-config.service";
import type { UpdateDteIssuerConfigInput } from "../schemas/dte-issuer-config.schemas";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type UpdateDteIssuerConfigActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: string; errors?: Record<string, string[]> };

export async function updateDteIssuerConfigAction(
  config_id: string,
  input:     UpdateDteIssuerConfigInput,
): Promise<UpdateDteIssuerConfigActionResult> {
  const sessionUser = await requireAdmin();

  if (!config_id?.trim()) return { ok: false, error: "El ID de configuración DTE es requerido." };

  // FASE VI-E2B: mismo reemplazo que create-dte-issuer-config.action.ts —
  // cierra el gap de VI-E1.1 (esta action tampoco bloqueaba escrituras
  // bajo sesión runtime de solo lectura).
  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!context.locationId) {
      return { ok: false, error: "La sesión no tiene una location activa." };
    }

    const parsed = updateDteIssuerConfigSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok:     false,
        error:  "Datos de configuración DTE no válidos.",
        errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const result = await updateDteIssuerConfig(
      config_id,
      context.tenantId,
      context.locationId,
      context.effectiveUser.id,
      parsed.data,
      context.client,
    );

    if (!result.ok) {
      return result.field
        ? { ok: false, field: result.field, error: result.error }
        : { ok: false, error: result.error };
    }

    revalidatePath("/dashboard/dte/issuer-config");
    revalidatePath(`/dashboard/dte/issuer-config/${config_id}`);

    return { ok: true };
  } finally {
    await dispose();
  }
}
