// ─────────────────────────────────────────────────────────────────
// api/purchases/[id]/route.ts
//
// GET    /api/purchases/:id — detalle completo de una compra.
// DELETE /api/purchases/:id — elimina una compra en DRAFT (borrado físico).
// Scoped por tenant_id + location_id desde sesión.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getPurchaseById } from "@/modules/commerce/purchases/queries/get-purchase-by-id";
import { deleteDraftPurchase } from "@/modules/commerce/purchases/services/purchase.service";
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

// ── DELETE — eliminar borrador ────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getPurchaseApiContext(req);

  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const result = await deleteDraftPurchase(id, ctx.tenant_id, ctx.location_id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}
