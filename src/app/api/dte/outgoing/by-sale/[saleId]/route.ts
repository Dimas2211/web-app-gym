// ─────────────────────────────────────────────────────────────────
// api/dte/outgoing/by-sale/[saleId]/route.ts
//
// GET /api/dte/outgoing/by-sale/:saleId — documentos DTE de una venta
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { listDteOutgoingDocumentsBySale } from "@/modules/commerce/dte/queries/list-dte-outgoing-documents-by-sale";
import { getDteApiContext } from "../../../dte-api-context";

// ── GET — documentos por venta ─────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ saleId: string }> },
) {
  const { saleId } = await params;

  const ctx = await getDteApiContext(req);
  if (!ctx.ok) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const docs = await listDteOutgoingDocumentsBySale(saleId, ctx.tenant_id, ctx.location_id);

  return NextResponse.json({ ok: true, data: docs });
}
