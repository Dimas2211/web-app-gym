"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/products — verify-edit-key.action.ts
//
// Valida la clave de autorización para editar un producto.
// La clave esperada se lee desde process.env.EDIT_CATALOG_PIN.
//
// Supuesto aceptado: solución válida bajo modelo de una instancia
// por cliente. Cada tenant tiene su propio proceso/deploy y su
// propia variable de entorno. No apta para SaaS multitenancy en
// proceso compartido — en ese caso migrar a PIN por tenant en BD.
//
// Seguridad: el valor esperado nunca sale del servidor.
// El cliente solo recibe { success: true } o { success: false }.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";

export type VerifyEditKeyResult =
  | { success: true }
  | { success: false; error: string };

export async function verifyEditKeyAction(
  _prev: VerifyEditKeyResult | undefined,
  formData: FormData
): Promise<VerifyEditKeyResult> {
  // Requiere sesión activa con rol admin — no permite verificación anónima
  await requireAdmin();

  const key = (formData.get("key") as string | null)?.trim() ?? "";
  const expected = process.env.EDIT_CATALOG_PIN;

  if (!expected) {
    return {
      success: false,
      error:
        "La clave de edición no está configurada en el servidor. Contacte al administrador.",
    };
  }

  if (!key || key !== expected) {
    return {
      success: false,
      error: "Clave incorrecta. Intente nuevamente.",
    };
  }

  return { success: true };
}
