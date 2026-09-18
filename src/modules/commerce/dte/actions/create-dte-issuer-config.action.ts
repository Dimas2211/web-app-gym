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
import { createDteIssuerConfigSchema } from "../schemas/dte-issuer-config.schemas";
import { createDteIssuerConfig } from "../services/dte-issuer-config.service";
import type { CreateDteIssuerConfigInput } from "../schemas/dte-issuer-config.schemas";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type CreateDteIssuerConfigActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: string; errors?: Record<string, string[]> };

export async function createDteIssuerConfigAction(
  input: CreateDteIssuerConfigInput,
): Promise<CreateDteIssuerConfigActionResult> {
  const sessionUser = await requireAdmin();

  // FASE VI-E2B: contexto operacional runtime (DB efectiva, bloqueo de
  // escritura bajo Support Session, ROL LIVE, gate comercial "fiscal.dte")
  // — reemplaza requireAdmin + getEffectiveLocationId + gate comercial
  // manual + Prisma global. Cierra el gap detectado en VI-E1.1: esta
  // action nunca bloqueaba escrituras bajo sesión runtime de solo lectura.
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
      return { ok: false, error: "La sesión no tiene una location activa. Selecciona una sucursal para configurar el emisor DTE." };
    }

    const parsed = createDteIssuerConfigSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok:     false,
        error:  "Datos de configuración DTE no válidos.",
        errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const result = await createDteIssuerConfig(
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

    return { ok: true, id: result.id };
  } finally {
    await dispose();
  }
}
