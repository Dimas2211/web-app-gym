"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-fex-json-for-sale.action.ts
//
// Microfase F3-C10 — generación controlada de JSON FEX 11 en pipeline
// real: construye el json_document, lo persiste y lo valida contra el
// schema oficial MH, actualizando dte_status.
//
// Microfase F3-C10B: la lógica core (carga del documento, validaciones,
// build, persistencia, AJV) se extrajo a
// generateAndPersistFexJsonForDte (generate-fex-json-pipeline.service.ts)
// para poder probarla con PrismaClient real fuera de un request/sesión
// (script dev-only). Esta action queda como wrapper de sesión: resuelve
// tenant_id/location_id/user_id desde requireAdmin y delega el flujo
// completo en el service. El contrato público (firma, tipos de retorno)
// no cambió.
//
// Flujo (implementado en el service):
//   DteOutgoingDocument tipo 11 → Sale asociada
//   → generateFexJsonForSale (builder puro, F3-C4)
//   → persistir json_document, dte_status → GENERATED
//   → validateDteJsonSchema (AJV, reutilizado de FE/CCFE/NC)
//   → si AJV pasa: dte_status → SCHEMA_VALIDATED, schema_validated_at
//   → si AJV falla: se mantiene GENERATED con el json_document persistido
//     (mismo patrón que FE/CCFE: generación y validación son pasos
//     separados; aquí se encadenan porque no existe UI ni botón propio
//     para FEX 11 todavía).
//
// FEX 11 está habilitado solo para generación/validación de JSON.
// Firma, transmisión, UI y MariaDB siguen bloqueados.
//
//   - NO firma el documento.
//   - NO transmite a Hacienda.
//   - NO toca MariaDB / delivery externo.
//   - NO habilita UI para tipo 11.
//   - Solo opera en ambiente TEST (NO-GO producción confirmado en F3-C9).
//   - tenant_id y location_id se inyectan desde sesión — nunca del input.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }         from "next/cache";
import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  generateAndPersistFexJsonForDte,
} from "../services/generate-fex-json-pipeline.service";
import type { DteValidationError } from "../services/validate-dte-json-schema.service";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

// ── Tipos públicos ────────────────────────────────────────────────

export type GenerateFexJsonForSaleActionResult =
  | { ok: true; schema_validated: true }
  | { ok: true; schema_validated: false; validation_errors: DteValidationError[] }
  | { ok: false; error: string };

// ── Action principal ────────────────────────────────────────────────

export async function generateFexJsonForSaleAction(
  dte_document_id: string,
): Promise<GenerateFexJsonForSaleActionResult> {
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

  const result = await generateAndPersistFexJsonForDte({
    tenant_id,
    location_id,
    dte_document_id,
    user_id: sessionUser.id,
  });

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Error desconocido al generar el JSON FEX 11." };
  }

  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/dte/outgoing");

  if (result.dte_status !== "SCHEMA_VALIDATED") {
    return {
      ok:                 true,
      schema_validated:   false,
      validation_errors:  result.validation_errors ?? [],
    };
  }

  return { ok: true, schema_validated: true };
}
