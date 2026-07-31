"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-fex-json-for-sale.action.ts
//
// Microfase F3-C10 — generación controlada de JSON FEX 11 en pipeline
// real: construye el json_document, lo persiste y lo valida contra el
// schema oficial MH, actualizando dte_status.
//
// Flujo:
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
import { Prisma }                 from "@prisma/client";
import { prisma }                 from "@/lib/db/prisma";
import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { generateFexJsonForSale } from "../services/generate-fex-json.service";
import {
  validateDteJsonSchema,
  type DteValidationError,
} from "../services/validate-dte-json-schema.service";

// ── Tipos públicos ────────────────────────────────────────────────

export type GenerateFexJsonForSaleActionResult =
  | { ok: true; schema_validated: true }
  | { ok: true; schema_validated: false; validation_errors: DteValidationError[] }
  | { ok: false; error: string };

// Estados del DteOutgoingDocument compatibles con (re)generación.
// Cualquier estado posterior implica que el documento ya avanzó en el
// ciclo fiscal real (firmado/transmitido) y esta action no debe operar.
const GENERATABLE_STATUSES = new Set([
  "PENDING_GENERATION",
  "GENERATED",
  "SCHEMA_VALIDATED",
]);

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

  // ── 1. Precondiciones sobre el DteOutgoingDocument ────────────────
  const dteDoc = await prisma.dteOutgoingDocument.findFirst({
    where: { id: dte_document_id, tenant_id, location_id },
    select: {
      id:            true,
      dte_type_code: true,
      sale_id:       true,
      signed_jws:    true,
      dte_status:    true,
      environment:   true,
    },
  });

  if (!dteDoc) {
    return { ok: false, error: "El documento DTE no existe o no pertenece a la location activa." };
  }
  if (dteDoc.dte_type_code !== "11") {
    return {
      ok:    false,
      error: `Esta action solo genera JSON para Factura de Exportación (11). El documento es tipo "${dteDoc.dte_type_code}".`,
    };
  }
  if (!dteDoc.sale_id) {
    return { ok: false, error: "El documento DTE no está asociado a ninguna venta." };
  }
  if (dteDoc.environment !== "TEST") {
    return {
      ok:    false,
      error: "La generación controlada de FEX 11 solo está habilitada en ambiente TEST en esta microfase.",
    };
  }
  if (dteDoc.signed_jws) {
    return { ok: false, error: "El documento DTE ya está firmado. No se puede regenerar el JSON de un documento firmado." };
  }
  if (!GENERATABLE_STATUSES.has(dteDoc.dte_status)) {
    return {
      ok:    false,
      error: `El documento DTE está en estado "${dteDoc.dte_status}", incompatible con generación de JSON. Estados permitidos: ${Array.from(GENERATABLE_STATUSES).join(", ")}.`,
    };
  }

  // ── 2. Construir el JSON candidato (builder puro, no persiste) ────
  const built = await generateFexJsonForSale({ tenant_id, location_id, dte_document_id });

  if (!built.ok) {
    return { ok: false, error: built.error };
  }

  // ── 3. Persistir json_document y avanzar a GENERATED ──────────────
  await prisma.dteOutgoingDocument.update({
    where: { id: dte_document_id },
    data:  {
      json_document: built.json as unknown as Prisma.InputJsonValue,
      dte_status:    "GENERATED",
      generated_at:  new Date(),
      updated_by:    sessionUser.id,
    },
  });

  // ── 4. Validar contra el schema oficial MH (AJV) ───────────────────
  // Reutiliza el mismo servicio que FE/CCFE/NC: si pasa, avanza a
  // SCHEMA_VALIDATED y guarda schema_validated_at; si falla, mantiene
  // GENERATED (con el json_document ya persistido) y no toca el estado.
  const validated = await validateDteJsonSchema(dte_document_id, tenant_id, location_id, sessionUser.id);

  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/dte/outgoing");

  if (!validated.ok) {
    return {
      ok:                 true,
      schema_validated:   false,
      validation_errors:  validated.validation_errors ?? [],
    };
  }

  return { ok: true, schema_validated: true };
}
