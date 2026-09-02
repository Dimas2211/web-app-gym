"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — upsert-dte-credential.action.ts
//
// Guarda credenciales MH (+ datos del firmador) para un DteIssuerConfig
// del tenant/location de la sesión. Nunca devuelve secretos — el
// resultado solo confirma éxito/error.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { prisma } from "@/lib/db/prisma";
import { upsertDteCredentialSchema } from "../schemas/dte-credential.schemas";
import { upsertDteCredential } from "../services/dte-credential.service";

export type UpsertDteCredentialActionState =
  | { errors?: Record<string, string[]>; error?: string; success?: false }
  | { success: true }
  | undefined;

export async function upsertDteCredentialAction(
  _prev: UpsertDteCredentialActionState,
  formData: FormData,
): Promise<UpsertDteCredentialActionState> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { error: "Selecciona una location activa." };

  const raw = {
    issuer_config_id:          formData.get("issuer_config_id"),
    apiUser:                   formData.get("apiUser") || undefined,
    apiPassword:                formData.get("apiPassword") || undefined,
    signerUrl:                 formData.get("signerUrl") || undefined,
    signerNit:                 formData.get("signerNit") || undefined,
    signerPrivateKeyPassword:  formData.get("signerPrivateKeyPassword") || undefined,
    signerApiKey:              formData.get("signerApiKey") || undefined,
  };

  const parsed = upsertDteCredentialSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  // El issuer_config_id debe pertenecer realmente al tenant/location de
  // la sesión — nunca confiar en el valor del formulario sin validar.
  const issuer = await prisma.dteIssuerConfig.findFirst({
    where:  { id: parsed.data.issuer_config_id, tenant_id, location_id },
    select: { id: true },
  });
  if (!issuer) {
    return { error: "La configuración DTE indicada no pertenece a esta sucursal." };
  }

  const result = await upsertDteCredential(issuer.id, sessionUser.id, {
    apiUser:                  parsed.data.apiUser,
    apiPassword:               parsed.data.apiPassword,
    signerUrl:                 parsed.data.signerUrl,
    signerNit:                 parsed.data.signerNit,
    signerPrivateKeyPassword:  parsed.data.signerPrivateKeyPassword,
    signerApiKey:              parsed.data.signerApiKey,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/dashboard/settings/dte");
  return { success: true };
}
