// ─────────────────────────────────────────────────────────────────
// api/sales/[id]/items/[itemId]/route.ts
//
// PATCH  /api/sales/:id/items/:itemId — editar línea de venta DRAFT
// DELETE /api/sales/:id/items/:itemId — eliminar línea de venta DRAFT
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { updateSaleItemSchema } from "@/modules/commerce/sales/schemas/sale.schemas";
import {
  updateSaleItemInDraft,
  removeSaleItemFromDraft,
} from "@/modules/commerce/sales/services/sale.service";

type RouteParams = { params: Promise<{ id: string; itemId: string }> };

// ── PATCH — editar línea ───────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: sale_id, itemId: item_id } = await params;

  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return NextResponse.json({ ok: false, error: "Sesión sin tenant activo." }, { status: 401 });
  if (!location_id) return NextResponse.json({ ok: false, error: "Selecciona una location activa." }, { status: 409 });

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "Body JSON requerido." }, { status: 400 });
  }

  const parsed = updateSaleItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await updateSaleItemInDraft(item_id, sale_id, tenant_id, location_id, sessionUser.id, parsed.data);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}

// ── DELETE — eliminar línea ────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id: sale_id, itemId: item_id } = await params;

  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return NextResponse.json({ ok: false, error: "Sesión sin tenant activo." }, { status: 401 });
  if (!location_id) return NextResponse.json({ ok: false, error: "Selecciona una location activa." }, { status: 409 });

  const result = await removeSaleItemFromDraft(item_id, sale_id, tenant_id, location_id, sessionUser.id);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}
