// ─────────────────────────────────────────────────────────────────
// commerce/dte — assert-dte-contingency-transmission-allowed.service.ts
//
// Guard server-side reutilizable (Bloque C — cierre de certificación
// de contingencia MH). Un DteOutgoingDocument con
// transmission_type_code === "2" (contingencia) NUNCA debe poder
// transmitirse a MH vía transmitDteDocument si no está cubierto por
// un DteContingencyEvent con status === "ACCEPTED".
//
// Reglas:
//   - transmission_type_code === "1" (normal) → SIEMPRE permitido.
//     Este guard no debe alterar en absoluto el flujo de transmisión
//     normal existente.
//   - transmission_type_code === "2" (contingencia) → exige que exista
//     al menos un DteContingencyEventItem que:
//       * apunte a este dteDocumentId,
//       * cuyo DteContingencyEvent pertenezca al mismo tenant_id/location_id,
//       * cuyo DteContingencyEvent.status === "ACCEPTED",
//       * cuyo DteContingencyEvent.contingency_type_code coincida con el
//         contingency_type_code del propio DTE,
//       * y cuyo event_json.detalleDTE contenga el mismo generation_code
//         que el DTE (defensa adicional de integridad — no solo el
//         puente relacional dte_document_id).
//   - No exige Evento para documentos normales.
//   - No modifica la máquina de estados normal ni usa
//     CONTINGENCY_PENDING.
//   - Error funcional claro, sin secrets.
//
// FASE VI-E6C — acepta un `db` explícito (PrismaClient runtime), mismo
// patrón que el resto de los servicios DTE runtime-aware. Con `db`, la
// lectura de DteContingencyEventItem/DteContingencyEvent corre en la
// MISMA runtime DB que el documento que se intenta transmitir. Sin
// `db`, cae al Prisma global (comportamiento legacy para callers
// PLATFORM_NATIVE no migrados). El filtro tenant/location/status/tipo
// se aplica directamente en el `where` del query (no en memoria) para
// que el enforcement de ownership viva en la consulta misma.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export interface AssertDteContingencyTransmissionAllowedParams {
  dteDocumentId:        string;
  tenantId:             string;
  locationId:           string;
  transmissionTypeCode: string;
  contingencyTypeCode:  string | null;
  generationCode:       string | null;
}

export type AssertDteContingencyTransmissionAllowedResult =
  | { ok: true }
  | { ok: false; error: string };

function eventDetalleIncludesGenerationCode(
  eventJson: unknown,
  generationCode: string,
): boolean {
  if (!eventJson || typeof eventJson !== "object") return false;
  const detalleDTE = (eventJson as { detalleDTE?: unknown }).detalleDTE;
  if (!Array.isArray(detalleDTE)) return false;

  const target = generationCode.toUpperCase();
  return detalleDTE.some((item) => {
    if (!item || typeof item !== "object") return false;
    const code = (item as { codigoGeneracion?: unknown }).codigoGeneracion;
    return typeof code === "string" && code.toUpperCase() === target;
  });
}

/**
 * Autoriza (o rechaza) la transmisión a MH de un DteOutgoingDocument según
 * su tipo de transmisión (CAT-004: "1" normal, "2" contingencia).
 *
 * Debe llamarse ANTES de obtener token o invocar al adapter de MH.
 */
export async function assertDteContingencyTransmissionAllowed(
  params: AssertDteContingencyTransmissionAllowedParams,
  db: PrismaClient = prisma,
): Promise<AssertDteContingencyTransmissionAllowedResult> {
  const {
    dteDocumentId,
    tenantId,
    locationId,
    transmissionTypeCode,
    contingencyTypeCode,
    generationCode,
  } = params;

  // Transmisión normal — sin cambios de comportamiento.
  if (transmissionTypeCode !== "2") {
    return { ok: true };
  }

  if (!generationCode) {
    return {
      ok:    false,
      error: "El documento DTE contingente no tiene código de generación asignado.",
    };
  }

  if (!contingencyTypeCode) {
    return {
      ok:    false,
      error: "El documento DTE contingente no tiene contingency_type_code asignado.",
    };
  }

  // Ownership (tenant/location/status/tipo) se aplica directamente en el
  // `where` — no en memoria — para que el enforcement viva en la
  // consulta misma (VI-E6C / sección K).
  const items = await db.dteContingencyEventItem.findMany({
    where: {
      dte_document_id: dteDocumentId,
      contingency_event: {
        tenant_id:             tenantId,
        location_id:           locationId,
        status:                "ACCEPTED",
        contingency_type_code: contingencyTypeCode,
      },
    },
    select: {
      contingency_event: {
        select: { event_json: true },
      },
    },
  });

  const hasAcceptedCoverage = items.some(({ contingency_event: ev }) => {
    if (!ev) return false;
    return eventDetalleIncludesGenerationCode(ev.event_json, generationCode);
  });

  if (!hasAcceptedCoverage) {
    return {
      ok:    false,
      error:
        "Este DTE está marcado como contingente (transmission_type_code=2) pero no está cubierto por " +
        "ningún Evento de Contingencia ACCEPTED. No puede transmitirse a MH hasta que el Evento de " +
        "Contingencia correspondiente sea aceptado por el Ministerio de Hacienda.",
    };
  }

  return { ok: true };
}
