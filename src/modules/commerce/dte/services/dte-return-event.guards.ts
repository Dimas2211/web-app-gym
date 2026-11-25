// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-return-event.guards.ts
//
// MH20 (Fase 6, IMP20-022/024) — lecturas de apoyo del Evento de Retorno.
//
// Un Retorno es VIGENTE (cuenta para el saldo y bloquea la invalidación
// del DTE, MH20-049) mientras su estado no sea REJECTED ni CANCELLED y no
// tenga una invalidación ACCEPTED. Los DRAFT también cuentan: así dos
// retornos concurrentes no pueden reservar el mismo saldo (el segundo ve
// al primero tras el lock de fila del DTE).
//
// Requieren la migración M2 (prerrequisito del perfil MH_2_0): solo se
// invocan cuando el perfil activo es MH_2_0 (interruptor encendido).
// ─────────────────────────────────────────────────────────────────

import type { Prisma, PrismaClient } from "@prisma/client";
import type { ReturnLineAmounts } from "../types/dte-return-event-json.types";
import { addReturnAmounts, zeroReturnAmounts } from "../utils/dte-return-balance";

type Db = PrismaClient | Prisma.TransactionClient;

export const VIGENT_RETURN_STATUSES = ["DRAFT", "PENDING_SIGNATURE", "SIGNED", "SENT", "ACCEPTED"] as const;

const vigentReturnWhere = (tenantId: string) => ({
  tenant_id: tenantId,
  status:    { in: [...VIGENT_RETURN_STATUSES] },
  invalidation_events: { none: { status: "ACCEPTED" as const } },
});

/** Retornos vigentes que referencian el DTE (para MH20-049). */
export async function findActiveReturnsForDocument(
  db: Db,
  params: { tenantId: string; dteDocumentId: string },
): Promise<Array<{ id: string; status: string }>> {
  return db.dteReturnEvent.findMany({
    where:  { ...vigentReturnWhere(params.tenantId), items: { some: { dte_document_id: params.dteDocumentId } } },
    select: { id: true, status: true },
  });
}

/** Acumulado vigente por línea original: clave `${dteDocumentId}#${source_item_no}`. */
export async function loadReturnedAmountsByLine(
  db: Db,
  params: { tenantId: string; dteDocumentIds: string[] },
): Promise<Map<string, ReturnLineAmounts>> {
  const rows = await db.dteReturnEventItem.findMany({
    where: {
      dte_document_id: { in: params.dteDocumentIds },
      return_event:    vigentReturnWhere(params.tenantId),
    },
    select: { dte_document_id: true, source_item_no: true, line_detail: true },
  });
  const out = new Map<string, ReturnLineAmounts>();
  for (const r of rows) {
    const key = `${r.dte_document_id}#${r.source_item_no}`;
    const d = (r.line_detail ?? {}) as Record<string, unknown>;
    const n = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : 0);
    const amounts: ReturnLineAmounts = {
      quantity: n("cantidad"), montoDescu: n("montoDescu"), ventaNoSuj: n("ventaNoSuj"),
      ventaExenta: n("ventaExenta"), ventaGravada: n("ventaGravada"), compra: n("compra"),
      ivaItem: n("ivaItem"), noGravado: n("noGravado"),
    };
    out.set(key, addReturnAmounts(out.get(key) ?? zeroReturnAmounts(), amounts));
  }
  return out;
}
