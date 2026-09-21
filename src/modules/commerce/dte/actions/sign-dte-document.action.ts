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
// fase controlada dedicada. El botón "Firmar DTE" ya está oculto en UI
// para tipo 11 (sales-client.tsx solo lo muestra para "01"/"03"), pero
// eso es un control de cliente, no de servidor — este guard cierra esa
// brecha a nivel de action.
//
// F3-C17 — FEX 11 se permite únicamente bajo fex11-feature-guard
// (DTE_FEX11_TEST_ENABLED=YES, TEST, NODE_ENV != production). Sigue sin
// haber UI para tipo 11.
//
// FASE VI-E5A — reemplaza requireAdmin + getEffectiveLocationId +
// resolveCommercialEnforcementContext manual por
// requireOperationalContext (mismo patrón ya certificado en VI-E3/E4
// para creación de DTE). RUNTIME_CLIENT firma contra su propia runtime
// DB (context.client); Support Session (SUPPORT_RUNTIME) es
// read-only -> requireOperationalContext rechaza con READ_ONLY antes
// de tocar el documento o el firmador; PLATFORM_NATIVE conserva su
// comportamiento previo (Prisma global).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }         from "next/cache";
import { requireAdmin }           from "@/lib/permissions/guards";
import {
  signDteDocument,
  type SignDteDocumentResult,
} from "../services/sign-dte-document.service";
import { canUseFex11InServerFlow } from "../utils/fex11-feature-guard";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type { SignDteDocumentResult };

// Tipos DTE con firma pública habilitada sin condiciones adicionales.
// FEX 11 se evalúa aparte vía fex11-feature-guard. FSE 14 (origen Purchase)
// reutiliza el mismo firmador agnóstico de dte_type_code — sin condiciones
// especiales, igual que FE/CCFE/NC.
const SIGNABLE_TYPE_CODES = new Set(["01", "03", "05", "14"]);

export async function signDteDocumentAction(
  dteDocumentId: string,
): Promise<SignDteDocumentResult> {
  const sessionUser = await requireAdmin();

  if (!dteDocumentId) return { ok: false, error: "El ID del documento DTE es requerido." };

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!context.locationId) {
      return { ok: false, error: "La sesión no tiene una location activa." };
    }

    const dteDoc = await context.client.dteOutgoingDocument.findFirst({
      where:  { id: dteDocumentId, tenant_id: context.tenantId, location_id: context.locationId },
      select: { dte_type_code: true, dte_status: true, signed_jws: true, environment: true },
    });

    if (!dteDoc) {
      return { ok: false, error: "El documento DTE no existe o no pertenece a la location activa." };
    }

    if (dteDoc.dte_type_code === "11") {
      const eligible =
        canUseFex11InServerFlow({ dte_type_code: dteDoc.dte_type_code, environment: dteDoc.environment }) &&
        dteDoc.dte_status === "SCHEMA_VALIDATED" &&
        !dteDoc.signed_jws;

      if (!eligible) {
        return {
          ok:    false,
          error: "FEX 11 solo está habilitada para pruebas controladas en ambiente TEST.",
        };
      }
    } else if (!SIGNABLE_TYPE_CODES.has(dteDoc.dte_type_code)) {
      return {
        ok:    false,
        error: "La firma de Factura de Exportación 11 todavía no está habilitada desde el flujo general. Use la fase controlada FEX 11.",
      };
    }

    const result = await signDteDocument(
      {
        dteDocumentId,
        userId:     context.effectiveUser.id,
        tenantId:   context.tenantId,
        locationId: context.locationId,
      },
      context.client,
    );

    if (result.ok) {
      revalidatePath("/dashboard/sales");
      revalidatePath("/dashboard/purchases");
      revalidatePath("/dashboard/dte/outgoing");
    }

    return result;
  } finally {
    await dispose();
  }
}
