// ─────────────────────────────────────────────────────────────────
// api/purchases/[id]/route.ts
//
// GET /api/purchases/:id — detalle completo de una compra.
// Scoped por tenant_id + location_id desde sesión.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getPurchaseById } from "@/modules/commerce/purchases/queries/get-purchase-by-id";
import { getPurchaseApiContext } from "../purchase-api-context";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getPurchaseApiContext(req);

  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const detail = await getPurchaseById(id, ctx.tenant_id, ctx.location_id);

  if (!detail) {
    return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
  }

  return NextResponse.json(detail, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
