// ─────────────────────────────────────────────────────────────────
// commerce/dte/queries — get-return-events-by-dte.ts
//
// MH20 (Fase 7, IMP20-030 / reportes §13) — Retornos (tipoDte 18) que
// afectan a un DTE original, con trazabilidad fiscal explícita:
//   - fiscalDate      = identificacion.fecEmi del evento (fecha fiscal);
//   - fiscalPeriod    = YYYY-MM derivado de fiscalDate;
//   - acceptedAt      = recepción por MH (transmisión);
//   - createdAt       = timestamp administrativo (NO es fecha fiscal).
// Solo ACCEPTED cuenta para acumulados (`countsForTotals`); el resto se
// muestra como pendiente. La venta original no se oculta ni se modifica.
// Solo lectura; scope tenant/location.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export interface ReturnEventForDteRow {
  returnId:        string;
  generationCode:  string;
  status:          string;
  environment:     string;
  fiscalDate:      string | null;
  fiscalPeriod:    string | null;
  acceptedAt:      Date | null;
  createdAt:       Date;
  countsForTotals: boolean;
  items:           { noItem: number; sourceItemNo: number; quantity: number; returnedAmount: number; returnedTax: number }[];
  returnedAmount:  number;
  returnedTax:     number;
}

function n(v: unknown): number { return v === null || v === undefined ? 0 : Number(String(v)); }

export function mapReturnEventForDte(
  ev: {
    id: string; generation_code: string; status: string; environment: string;
    event_json: unknown; accepted_at: Date | null; created_at: Date;
    items: { no_item: number; source_item_no: number; quantity: unknown; returned_amount: unknown; returned_tax: unknown }[];
  },
): ReturnEventForDteRow {
  const fecEmi = (ev.event_json as { identificacion?: { fecEmi?: unknown } } | null)?.identificacion?.fecEmi;
  const fiscalDate = typeof fecEmi === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecEmi) ? fecEmi : null;
  const items = [...ev.items].sort((a, b) => a.no_item - b.no_item).map((i) => ({
    noItem: i.no_item, sourceItemNo: i.source_item_no, quantity: n(i.quantity),
    returnedAmount: n(i.returned_amount), returnedTax: n(i.returned_tax),
  }));
  return {
    returnId: ev.id, generationCode: ev.generation_code, status: ev.status, environment: ev.environment,
    fiscalDate, fiscalPeriod: fiscalDate ? fiscalDate.slice(0, 7) : null,
    acceptedAt: ev.accepted_at, createdAt: ev.created_at,
    countsForTotals: ev.status === "ACCEPTED",
    items,
    returnedAmount: Math.round(items.reduce((s, i) => s + i.returnedAmount, 0) * 100) / 100,
    returnedTax:    Math.round(items.reduce((s, i) => s + i.returnedTax, 0) * 100) / 100,
  };
}

export async function getReturnEventsByDte(params: {
  dteId: string; tenantId: string; locationId: string; client?: PrismaClient;
}): Promise<ReturnEventForDteRow[]> {
  const { dteId, tenantId, locationId, client = prisma } = params;
  const events = await client.dteReturnEvent.findMany({
    where: { tenant_id: tenantId, location_id: locationId, items: { some: { dte_document_id: dteId } } },
    select: {
      id: true, generation_code: true, status: true, environment: true, event_json: true,
      accepted_at: true, created_at: true,
      items: {
        where:  { dte_document_id: dteId },
        select: { no_item: true, source_item_no: true, quantity: true, returned_amount: true, returned_tax: true },
      },
    },
    orderBy: { created_at: "asc" },
  });
  return events.map(mapReturnEventForDte);
}
