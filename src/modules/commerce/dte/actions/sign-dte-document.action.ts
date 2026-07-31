"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — sign-dte-document.action.ts
//
// Server Action: firma un DteOutgoingDocument en estado SCHEMA_VALIDATED.
// Transición SCHEMA_VALIDATED → SIGNED.
//
// Reglas:
//   - Sesión requerida (requireAdmin).
//   - tenant_id y location_id siempre desde sesión.
//   - No devuelve signed_jws al frontend.
//   - Solo indica si la firma fue exitosa y el timestamp.
//
// F3-C11B — guard explícito: sign-dte-document.service.ts es agnóstico
// de dte_type_code por diseño (para no acoplar el firmador a un tipo
// DTE específico). Como F3-C10B ya permite que un DteOutgoingDocument
// tipo 11 (FEX) llegue a SCHEMA_VALIDATED, esta action pública debe
// bloquear explícitamente la firma de tipo 11 hasta que exista una
// fase controlada dedicada (F3-C12). El botón "Firmar DTE" ya está
// oculto en UI para tipo 11 (sales-client.tsx solo lo muestra para
// "01"/"03"), pero eso es un control de cliente, no de servidor — este
// guard cierra esa brecha a nivel de action.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }         from "next/cache";
import { prisma }                 from "@/lib/db/prisma";
import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  signDteDocument,
  type SignDteDocumentResult,
} from "../services/sign-dte-document.service";

export type { SignDteDocumentResult };

// Tipos DTE con firma pública habilitada. FEX 11 queda fuera hasta F3-C12.
const SIGNABLE_TYPE_CODES = new Set(["01", "03", "05"]);

export async function signDteDocumentAction(
  dteDocumentId: string,
): Promise<SignDteDocumentResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)     return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id)   return { ok: false, error: "La sesión no tiene una location activa." };
  if (!dteDocumentId) return { ok: false, error: "El ID del documento DTE es requerido." };

  const dteDoc = await prisma.dteOutgoingDocument.findFirst({
    where:  { id: dteDocumentId, tenant_id, location_id },
    select: { dte_type_code: true },
  });

  if (!dteDoc) {
    return { ok: false, error: "El documento DTE no existe o no pertenece a la location activa." };
  }

  if (!SIGNABLE_TYPE_CODES.has(dteDoc.dte_type_code)) {
    return {
      ok:    false,
      error: "La firma de Factura de Exportación 11 todavía no está habilitada desde el flujo general. Use la fase controlada FEX 11.",
    };
  }

  const result = await signDteDocument({
    dteDocumentId,
    userId:     sessionUser.id,
    tenantId:   tenant_id,
    locationId: location_id,
  });

  if (result.ok) {
    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/dte/outgoing");
  }

  return result;
}
