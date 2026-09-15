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
import { verifyAdminDeleteCredentials } from "@/lib/permissions/delete-authorization";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type EditSaleAuthState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

export async function editSaleAuthAction(
  _prev: EditSaleAuthState,
  formData: FormData,
): Promise<EditSaleAuthState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.sales", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const email    = (formData.get("auth_email")    as string ?? "").trim();
    const password = (formData.get("auth_password") as string ?? "");

    if (!email || !password) {
      return { ok: false, error: "Correo y contraseña son requeridos." };
    }

    const result = await verifyAdminDeleteCredentials(
      { email, password },
      context.tenantId,
    );

    if (!result.authorized) {
      return { ok: false, error: result.error };
    }

    return { ok: true };
  } finally {
    await dispose();
  }
}
