// ─────────────────────────────────────────────────────────────────
// commerce/inventory — resolve-movement-documents.ts
//
// Resuelve Documento y Correlativo de cada movimiento de inventario
// a partir de las relaciones documentales existentes (sin columnas
// nuevas ni migraciones).
//
// Problema que corrige:
//   purchase.service / sale.service guardan en reference_code el
//   CORRELATIVO INTERNO (purchase_code / sale_code). Las grillas lo
//   mostraban como "Referencia"/"Documento", por lo que una compra con
//   document_number "FAC-2026-125" y purchase_code "3" aparecía como
//   Documento = 3.
//
// Reglas:
//   purchase / purchase_cancellation (reference_id = Purchase.id)
//     Documento   = [document_series] document_number del proveedor
//     Correlativo = purchase_code
//     Sin document_number → Documento null (NUNCA se sustituye por purchase_code)
//   sale (SALE_OUT y RETURN_IN por anulación; reference_id = Sale.id)
//     Documento   = número de control del DTE ORIGINAL de la venta
//                   (FE 01 / CCFE 03 / FEX 11 — nunca la NC 05), elegido
//                   por pickSaleFiscalDocument:
//                     1. recibido por Hacienda (isFiscallyReceivedByMh:
//                        ACCEPTED/OBSERVED con sello de recepción)
//                     2. aceptado y luego en invalidación o invalidado
//                        (con sello) → se conserva con document_status
//                     REJECTED y estados previos a la aceptación (GENERATED,
//                     SIGNED, SENT, CONTINGENCY_PENDING, ...) nunca se
//                     presentan como documento.
//     Correlativo = sale_code (correlativo interno, NO es documento fiscal)
//   DATA_ONBOARDING (carga inicial por importación)
//     Sin documento ni correlativo (reference_code es un marcador técnico)
//   Movimientos manuales con referencia escrita por el usuario
//     Documento = reference_code ingresado; Correlativo null
//
// Las consultas se hacen por lote (una para compras, una para ventas)
// y siempre filtradas por tenant_id — un reference_id de otro tenant
// nunca resuelve datos.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { isFiscallyReceivedByMh } from "@/modules/commerce/dte/utils/dte-fiscal-receipt.utils";

export interface MovementReferenceInput {
  id: string;
  reference_entity: string | null;
  reference_id: string | null;
  reference_code: string | null;
}

export interface MovementDocumentInfo {
  /** Número real del documento (proveedor / DTE). null = sin documento. */
  document_number: string | null;
  /** Correlativo interno de la operación (purchase_code / sale_code). */
  correlative: string | null;
  /**
   * Estado fiscal a advertir junto al documento. null = documento vigente
   * (o sin documento). Solo aplica a DTE aceptados luego invalidados.
   */
  document_status: MovementDocumentStatus | null;
}

export type MovementDocumentStatus = "INVALIDATION_PENDING" | "INVALIDATED";

export interface SaleDteCandidate {
  control_number: string | null;
  dte_status: string;
  reception_stamp: string | null;
}

const PURCHASE_ENTITIES = new Set(["purchase", "purchase_cancellation"]);
const SALE_ENTITIES = new Set(["sale"]);
const TECHNICAL_ENTITIES = new Set(["DATA_ONBOARDING"]);
/** DTE que documentan la venta original (CAT-002). La NC 05 no aplica. */
const SALE_ORIGINAL_DTE_TYPES = ["01", "03", "11"];
const INVALIDATION_STATUSES = new Set<MovementDocumentStatus>(["INVALIDATION_PENDING", "INVALIDATED"]);
const ELIGIBLE_SALE_DTE_STATUSES = ["ACCEPTED", "OBSERVED", "INVALIDATION_PENDING", "INVALIDATED"] as const;

type DocumentsClient = Pick<PrismaClient, "purchase" | "sale">;

function clean(value: string | null | undefined): string | null {
  const s = value?.trim();
  return s ? s : null;
}

/** Une serie y número del documento del proveedor sin duplicar la serie. */
export function formatPurchaseDocument(
  series: string | null | undefined,
  number: string | null | undefined,
): string | null {
  const n = clean(number);
  if (!n) return null;
  const s = clean(series);
  if (!s || n.toUpperCase().startsWith(s.toUpperCase())) return n;
  return `${s}-${n}`;
}

/**
 * Elige el DTE que documenta fiscalmente una venta.
 * `docs` debe venir ordenado del más reciente al más antiguo.
 */
export function pickSaleFiscalDocument(
  docs: SaleDteCandidate[],
): { document_number: string; document_status: MovementDocumentStatus | null } | null {
  const withNumber = docs.filter((d) => clean(d.control_number));
  const received = withNumber.find((d) => isFiscallyReceivedByMh(d.dte_status, d.reception_stamp));
  if (received) return { document_number: clean(received.control_number)!, document_status: null };

  // Aceptado por Hacienda y luego invalidado (o invalidación en curso):
  // el sello de recepción prueba que fue documento fiscal; se conserva
  // la trazabilidad con su estado.
  const invalidated = withNumber.find(
    (d) => INVALIDATION_STATUSES.has(d.dte_status as MovementDocumentStatus) && clean(d.reception_stamp),
  );
  if (invalidated) {
    return {
      document_number: clean(invalidated.control_number)!,
      document_status: invalidated.dte_status as MovementDocumentStatus,
    };
  }
  return null;
}

export async function resolveMovementDocuments(
  rows: MovementReferenceInput[],
  tenantId: string,
  client: DocumentsClient,
): Promise<Map<string, MovementDocumentInfo>> {
  const purchaseIds = new Set<string>();
  const saleIds = new Set<string>();

  for (const r of rows) {
    if (!r.reference_id || !r.reference_entity) continue;
    if (PURCHASE_ENTITIES.has(r.reference_entity)) purchaseIds.add(r.reference_id);
    else if (SALE_ENTITIES.has(r.reference_entity)) saleIds.add(r.reference_id);
  }

  const [purchases, sales] = await Promise.all([
    purchaseIds.size
      ? client.purchase.findMany({
          where: { tenant_id: tenantId, id: { in: [...purchaseIds] } },
          select: { id: true, purchase_code: true, document_number: true, document_series: true },
        })
      : Promise.resolve([]),
    saleIds.size
      ? client.sale.findMany({
          where: { tenant_id: tenantId, id: { in: [...saleIds] } },
          select: {
            id: true,
            sale_code: true,
            dte_documents: {
              where: {
                tenant_id: tenantId,
                dte_type_code: { in: SALE_ORIGINAL_DTE_TYPES },
                dte_status: { in: [...ELIGIBLE_SALE_DTE_STATUSES] },
                control_number: { not: null },
              },
              orderBy: [{ created_at: "desc" }, { id: "desc" }],
              select: { control_number: true, dte_status: true, reception_stamp: true },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const purchaseById = new Map(purchases.map((p) => [p.id, p]));
  const saleById = new Map(sales.map((s) => [s.id, s]));

  const result = new Map<string, MovementDocumentInfo>();

  for (const r of rows) {
    const entity = r.reference_entity;

    if (entity && PURCHASE_ENTITIES.has(entity)) {
      const p = r.reference_id ? purchaseById.get(r.reference_id) : undefined;
      result.set(r.id, {
        document_number: p ? formatPurchaseDocument(p.document_series, p.document_number) : null,
        // reference_code de compras = snapshot de purchase_code al confirmar/anular
        correlative: p ? p.purchase_code : clean(r.reference_code),
        document_status: null,
      });
      continue;
    }

    if (entity && SALE_ENTITIES.has(entity)) {
      const s = r.reference_id ? saleById.get(r.reference_id) : undefined;
      const fiscal = s ? pickSaleFiscalDocument(s.dte_documents) : null;
      result.set(r.id, {
        document_number: fiscal?.document_number ?? null,
        correlative: s ? s.sale_code : clean(r.reference_code),
        document_status: fiscal?.document_status ?? null,
      });
      continue;
    }

    if (entity && TECHNICAL_ENTITIES.has(entity)) {
      result.set(r.id, { document_number: null, correlative: null, document_status: null });
      continue;
    }

    // Movimiento manual: solo la referencia que el usuario escribió.
    result.set(r.id, { document_number: clean(r.reference_code), correlative: null, document_status: null });
  }

  return result;
}
