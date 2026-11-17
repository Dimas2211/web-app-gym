// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-document-purpose.ts
//
// DTE-MH-TEST-RUNS — barreras de exclusión por PROPÓSITO del documento.
//
// Un DteOutgoingDocument con purpose = MH_TEST_CERTIFICATION es una prueba
// de Hacienda creada desde el onboarding fiscal del Control Plane. Por
// diseño NUNCA debe:
//   - operarse desde las actions del runtime del cliente (firmar,
//     transmitir, reabrir, NC, invalidar, conciliar…);
//   - descubrirse, encolarse, procesarse ni entregarse a MariaDB;
//   - aparecer en el Panel Fiscal ni en resúmenes operativos.
//
// Las barreras son independientes del flag DTE_MH_TEST_RUNS_ENABLED:
// deshabilitar la función NO deshabilita estas exclusiones.
//
// Regla fail-closed: solo "OPERATIONAL" explícito es operativo. Un valor
// ausente (select sin purpose, payload incompleto) se trata como excluido.
// ─────────────────────────────────────────────────────────────────

import type { Prisma } from "@prisma/client";

export const DTE_PURPOSE_OPERATIONAL = "OPERATIONAL" as const;
export const DTE_PURPOSE_MH_TEST_CERTIFICATION = "MH_TEST_CERTIFICATION" as const;

/** Código de error estable para entregas/acciones rechazadas por propósito. */
export const DTE_CERTIFICATION_EXCLUDED_CODE = "CERTIFICATION_DOCUMENT_EXCLUDED" as const;

export const DTE_CERTIFICATION_EXCLUDED_MESSAGE =
  "Este documento pertenece a las pruebas de Hacienda del onboarding fiscal (Control Plane). " +
  "No se opera ni se entrega desde el runtime del cliente.";

/** Filtro Prisma reutilizable para lecturas operativas (Panel Fiscal, outbox, resúmenes). */
export const OPERATIONAL_DTE_WHERE = { purpose: DTE_PURPOSE_OPERATIONAL } as const satisfies Prisma.DteOutgoingDocumentWhereInput;

export function isOperationalDtePurpose(purpose: string | null | undefined): boolean {
  return purpose === DTE_PURPOSE_OPERATIONAL;
}

type PurposeReader = {
  dteOutgoingDocument: { findFirst(args: { where: { id: string; tenant_id: string }; select: { purpose: true } }): Promise<{ purpose: string } | null> };
  dteInvalidationEvent: { findFirst(args: { where: { id: string; tenant_id: string }; select: { dte_document: { select: { purpose: true } } } }): Promise<{ dte_document: { purpose: string } } | null> };
};

/**
 * Guard para actions del runtime del cliente. Devuelve el mensaje de
 * rechazo si el documento (o el documento del evento de invalidación) NO es
 * operativo; null si puede continuar. Si el registro no existe devuelve null
 * para que el servicio responda su propio "no existe" (sin filtrar datos).
 */
export async function blockNonOperationalDteForRuntimeAction(
  client: unknown,
  tenantId: string,
  ref: { dteDocumentId?: string | null; invalidationEventId?: string | null },
): Promise<string | null> {
  const db = client as PurposeReader;
  if (ref.dteDocumentId) {
    const doc = await db.dteOutgoingDocument.findFirst({
      where:  { id: ref.dteDocumentId, tenant_id: tenantId },
      select: { purpose: true },
    });
    if (doc && !isOperationalDtePurpose(doc.purpose)) return DTE_CERTIFICATION_EXCLUDED_MESSAGE;
  }
  if (ref.invalidationEventId) {
    const ev = await db.dteInvalidationEvent.findFirst({
      where:  { id: ref.invalidationEventId, tenant_id: tenantId },
      select: { dte_document: { select: { purpose: true } } },
    });
    if (ev && !isOperationalDtePurpose(ev.dte_document.purpose)) return DTE_CERTIFICATION_EXCLUDED_MESSAGE;
  }
  return null;
}
