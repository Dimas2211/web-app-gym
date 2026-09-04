"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — validate-dte-json-schema.action.ts
//
// Server Action: valida el json_document de un DteOutgoingDocument
// contra el schema oficial MH. Transición GENERATED → SCHEMA_VALIDATED.
//
// Reglas:
//   - Sesión requerida (requireAdmin).
//   - tenant_id y location_id siempre desde sesión.
//   - Si valida: revalida paths de sales y dte/outgoing.
//   - Si falla: devuelve errores legibles sin modificar el documento.
//   - NO firma. NO transmite.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }        from "next/cache";
import { requireAdmin }          from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  validateDteJsonSchema,
  type ValidateDteJsonSchemaResult,
} from "../services/validate-dte-json-schema.service";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type { ValidateDteJsonSchemaResult };

export async function validateDteJsonSchemaAction(
  dte_document_id: string,
): Promise<ValidateDteJsonSchemaResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)       return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id)     return { ok: false, error: "La sesión no tiene una location activa." };
  if (!dte_document_id) return { ok: false, error: "El ID del documento DTE es requerido." };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "fiscal.dte");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  const result = await validateDteJsonSchema(
    dte_document_id,
    tenant_id,
    location_id,
    sessionUser.id,
  );

  if (result.ok) {
    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/dte/outgoing");
  }

  return result;
}
