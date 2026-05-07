// ─────────────────────────────────────────────────────────────────
// api/dte/outgoing/[id]/route.ts
//
// GET /api/dte/outgoing/:id — detalle de un documento DTE outgoing
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDteOutgoingDocumentById } from "@/modules/commerce/dte/queries/get-dte-outgoing-document-by-id";
import { getDteApiContext } from "../../dte-api-context";

// ── GET — detalle ──────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getDteApiContext(req);
  if (!ctx.ok) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const doc = await getDteOutgoingDocumentById(id, ctx.tenant_id);
  if (!doc) {
    return NextResponse.json({ ok: false, error: "El documento DTE no fue encontrado." }, { status: 404 });
  }

  // Verificar que el documento pertenece a la location activa
  if (doc.location_id !== ctx.location_id) {
    return NextResponse.json({ ok: false, error: "El documento DTE no pertenece a la location activa." }, { status: 403 });
  }

  return NextResponse.json({ ok: true, data: doc }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
