"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — set-dte-spec-profile.action.ts
//
// MH20 (Fase 5.1E) — server action para fijar el perfil normativo
// (MH_1_2 / MH_2_0) de UN emisor DTE en UN ambiente.
//
// Autorización explícita (server-side):
//   - requireSuperAdmin(): Platform Admin (auth_scope PLATFORM + rol global).
//     El perfil normativo es un interruptor regulatorio, no un ajuste
//     operativo del cliente: un admin runtime no puede cambiarlo.
//   - requireOperationalContext(write, módulo fiscal.dte): tenant/location
//     efectivos de la sesión; el formulario solo aporta issuer_config_id.
//   - confirm_text = "<PERFIL>:<AMBIENTE>" (p. ej. "MH_2_0:TEST").
// La lógica y la auditoría viven en setDteIssuerSpecProfile.
// No se expone en UI en esta fase (sin activación de MH 2.0).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { DTE_SPEC_PROFILES } from "../spec/dte-spec-profile";
import { setDteIssuerSpecProfile, type SetDteSpecProfileResult } from "../services/dte-spec-profile-admin.service";

export type SetDteSpecProfileActionState =
  | { error: string; details?: string[]; success?: false }
  | { success: true; changed: boolean; profile: string; environment: string; warnings: string[] }
  | undefined;

const schema = z.object({
  issuer_config_id: z.string().uuid(),
  target_profile:   z.enum(DTE_SPEC_PROFILES),
  reason:           z.string().trim().min(10).max(500),
  confirm_text:     z.string().trim(),
});

export async function setDteSpecProfileAction(
  _prev: SetDteSpecProfileActionState,
  formData: FormData,
): Promise<SetDteSpecProfileActionState> {
  const sessionUser = await requireSuperAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!context.locationId) return { error: "Selecciona una location activa." };

    const parsed = schema.safeParse({
      issuer_config_id: formData.get("issuer_config_id"),
      target_profile:   formData.get("target_profile"),
      reason:           formData.get("reason"),
      confirm_text:     formData.get("confirm_text") ?? "",
    });
    if (!parsed.success) return { error: "Datos de formulario inválidos." };

    const issuer = await context.client.dteIssuerConfig.findFirst({
      where:  { id: parsed.data.issuer_config_id, tenant_id: context.tenantId, location_id: context.locationId },
      select: { id: true, environment: true },
    });
    if (!issuer) return { error: "La configuración DTE indicada no pertenece a esta sucursal." };

    const expectedConfirm = `${parsed.data.target_profile}:${issuer.environment}`;
    if (parsed.data.confirm_text !== expectedConfirm) {
      return { error: `Para confirmar escriba exactamente "${expectedConfirm}".` };
    }

    const result: SetDteSpecProfileResult = await setDteIssuerSpecProfile({
      tenant_id:        context.tenantId,
      location_id:      context.locationId,
      issuer_config_id: issuer.id,
      target_profile:   parsed.data.target_profile,
      reason:           parsed.data.reason,
      actor_id:         sessionUser.id,
      actor_scope:      sessionUser.auth_scope ?? null,
    }, context.client);

    if (!result.ok) return { error: result.error, details: result.details };

    revalidatePath("/dashboard/settings/dte");
    return {
      success: true, changed: result.changed, profile: result.new_profile,
      environment: result.environment, warnings: result.warnings,
    };
  } finally {
    await dispose();
  }
}
