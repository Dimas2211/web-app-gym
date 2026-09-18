"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — switch-dte-environment.action.ts
//
// Activa un ambiente DTE (TEST o PRODUCTION) para el tenant/location
// de la sesión, vía switchActiveDteEnvironment (transacción atómica).
//
// Defensa en profundidad: cuando el destino es PRODUCTION, exige
// confirm_text === "PRODUCCION" en el propio servidor — nunca confía
// solo en que el diálogo de confirmación de la UI lo haya pedido.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { switchDteEnvironmentSchema } from "../schemas/dte-credential.schemas";
import { switchActiveDteEnvironment } from "../services/dte-issuer-config.service";
import type { DteProductionPreflightResult } from "../services/dte-production-preflight.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type SwitchDteEnvironmentActionState =
  | { error: string; preflight?: DteProductionPreflightResult; success?: false }
  | { success: true; environment: "TEST" | "PRODUCTION" }
  | undefined;

const PRODUCTION_CONFIRM_TEXT = "PRODUCCION";

export async function switchDteEnvironmentAction(
  _prev: SwitchDteEnvironmentActionState,
  formData: FormData,
): Promise<SwitchDteEnvironmentActionState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!context.locationId) {
      return { error: "Selecciona una location activa." };
    }

    const raw = {
      target_issuer_config_id: formData.get("target_issuer_config_id"),
      confirm_text:             formData.get("confirm_text") || undefined,
    };

    const parsed = switchDteEnvironmentSchema.safeParse(raw);
    if (!parsed.success) {
      return { error: "Datos de formulario inválidos." };
    }

    // El destino debe pertenecer al tenant/location efectivos, y saber
    // su ambiente para decidir si exige el texto de confirmación.
    const target = await context.client.dteIssuerConfig.findFirst({
      where:  { id: parsed.data.target_issuer_config_id, tenant_id: context.tenantId, location_id: context.locationId },
      select: { id: true, environment: true },
    });
    if (!target) {
      return { error: "La configuración DTE indicada no pertenece a esta sucursal." };
    }

    if (target.environment === "PRODUCTION" && parsed.data.confirm_text !== PRODUCTION_CONFIRM_TEXT) {
      return { error: `Para activar PRODUCCIÓN debe escribir exactamente "${PRODUCTION_CONFIRM_TEXT}".` };
    }

    const result = await switchActiveDteEnvironment({
      tenant_id:   context.tenantId,
      location_id: context.locationId,
      target_issuer_config_id: target.id,
      user_id: context.effectiveUser.id,
    }, context.client);

    if (!result.ok) {
      return { error: result.error, preflight: result.preflight };
    }

    revalidatePath("/dashboard/settings/dte");
    return { success: true, environment: result.environment };
  } finally {
    await dispose();
  }
}
