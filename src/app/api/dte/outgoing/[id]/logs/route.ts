// ─────────────────────────────────────────────────────────────────
// api/dte/outgoing/[id]/logs/route.ts
//
// GET /api/dte/outgoing/:id/logs — logs de transmisión de un documento DTE
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { listDteTransmissionLogs } from "@/modules/commerce/dte/queries/list-dte-transmission-logs";
import { getDteOutgoingDocumentById } from "@/modules/commerce/dte/queries/get-dte-outgoing-document-by-id";
import { getDteApiContext } from "../../../dte-api-context";

// ── GET — logs ─────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: dte_document_id } = await params;

  const ctx = await getDteApiContext(req);
  if (!ctx.ok) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  try {
    const doc = await getDteOutgoingDocumentById(dte_document_id, ctx.tenant_id, ctx.client);
    if (!doc) {
      return NextResponse.json({ ok: false, error: "El documento DTE no fue encontrado." }, { status: 404 });
    }
    if (doc.location_id !== ctx.location_id) {
      return NextResponse.json({ ok: false, error: "El documento DTE no pertenece a la location activa." }, { status: 403 });
    }

    const logs = await listDteTransmissionLogs(dte_document_id, ctx.client);

    return NextResponse.json({ ok: true, data: logs });
  } finally {
    await ctx.dispose();
  }
}
