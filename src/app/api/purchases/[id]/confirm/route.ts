// ─────────────────────────────────────────────────────────────────
// api/purchases/[id]/confirm/route.ts
//
// POST /api/purchases/:id/confirm — confirma una compra DRAFT
// Genera movimientos PURCHASE_IN en inventory por cada línea stockable.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { confirmPurchase } from "@/modules/commerce/purchases/services/purchase.service";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id || !location_id) {
    return NextResponse.json({ error: "Sesión sin tenant o location activa." }, { status: 401 });
  }

  const { id: purchase_id } = await params;

  const result = await confirmPurchase(
    purchase_id,
    tenant_id,
    location_id,
    sessionUser.id,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}
