"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — edit-purchase-auth.action.ts
//
// Verifica credenciales administrativas para habilitar la edición
// de una compra. Reutiliza verifyAdminDeleteCredentials para
// mantener el mismo patrón de autorización del sistema.
//
// Retorna:
//   { ok: true }                       — autorizado, proceder
//   { ok: false; error: string }       — no autorizado
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { verifyAdminDeleteCredentials } from "@/lib/permissions/delete-authorization";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type EditPurchaseAuthState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

export async function editPurchaseAuthAction(
  _prev: EditPurchaseAuthState,
  formData: FormData,
): Promise<EditPurchaseAuthState> {
  const sessionUser = await requireAdmin();
  if (!sessionUser.tenant_id) {
    return { ok: false, error: "Sesión sin tenant activo." };
  }

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(sessionUser.tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.purchases");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  const email    = (formData.get("auth_email")    as string ?? "").trim();
  const password = (formData.get("auth_password") as string ?? "");

  if (!email || !password) {
    return { ok: false, error: "Correo y contraseña son requeridos." };
  }

  const result = await verifyAdminDeleteCredentials(
    { email, password },
    sessionUser.tenant_id,
  );

  if (!result.authorized) {
    return { ok: false, error: result.error };
  }

  return { ok: true };
}
