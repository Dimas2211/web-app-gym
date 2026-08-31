"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — edit-sale-auth.action.ts
//
// Verifica credenciales administrativas para habilitar la edición
// de una venta en borrador. Reutiliza verifyAdminDeleteCredentials
// para mantener el mismo patrón de autorización del sistema.
//
// Retorna:
//   { ok: true }                       — autorizado, proceder
//   { ok: false; error: string }       — no autorizado
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { verifyAdminDeleteCredentials } from "@/lib/permissions/delete-authorization";

export type EditSaleAuthState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

export async function editSaleAuthAction(
  _prev: EditSaleAuthState,
  formData: FormData,
): Promise<EditSaleAuthState> {
  const sessionUser = await requireAdmin();
  if (!sessionUser.tenant_id) {
    return { ok: false, error: "Sesión sin tenant activo." };
  }

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return { ok: false, error: RUNTIME_READONLY_MESSAGE };
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
