// ─────────────────────────────────────────────────────────────────
// api/purchases/[id]/items/[itemId]/route.ts
//
// PATCH  /api/purchases/:id/items/:itemId — editar línea en DRAFT
// DELETE /api/purchases/:id/items/:itemId — eliminar línea en DRAFT
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { updatePurchaseItemSchema } from "@/modules/commerce/purchases/schemas/purchase-item.schema";
import {
  updatePurchaseItem,
  removePurchaseItem,
} from "@/modules/commerce/purchases/services/purchase.service";

type RouteParams = { params: Promise<{ id: string; itemId: string }> };

// ── PATCH — editar línea ──────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = sessionUser.location_id;

  if (!tenant_id || !location_id) {
    return NextResponse.json({ error: "Sesión sin tenant o location activa." }, { status: 401 });
  }

  const { id: purchase_id, itemId: item_id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Body JSON requerido." }, { status: 400 });
  }

  const parsed = updatePurchaseItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await updatePurchaseItem(
    item_id,
    purchase_id,
    tenant_id,
    location_id,
    sessionUser.id,
    parsed.data,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}

// ── DELETE — eliminar línea ───────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams,
) {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = sessionUser.location_id;

  if (!tenant_id || !location_id) {
    return NextResponse.json({ error: "Sesión sin tenant o location activa." }, { status: 401 });
  }

  const { id: purchase_id, itemId: item_id } = await params;

  const result = await removePurchaseItem(
    item_id,
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
