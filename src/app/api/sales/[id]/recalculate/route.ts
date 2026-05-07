// ─────────────────────────────────────────────────────────────────
// api/sales/[id]/recalculate/route.ts
//
// POST /api/sales/:id/recalculate — recalcular totales de venta DRAFT
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { recalculateSaleTotals } from "@/modules/commerce/sales/services/sale.service";

// ── POST — recalcular totales ──────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sale_id } = await params;

  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return NextResponse.json({ ok: false, error: "Sesión sin tenant activo." }, { status: 401 });
  if (!location_id) return NextResponse.json({ ok: false, error: "Selecciona una location activa." }, { status: 409 });

  const result = await recalculateSaleTotals(sale_id, tenant_id, location_id, sessionUser.id);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}
