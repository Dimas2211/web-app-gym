// ─────────────────────────────────────────────────────────────────
// api/sales/[id]/route.ts
//
// GET   /api/sales/:id — detalle completo de una venta
// PATCH /api/sales/:id — actualizar cabecera de venta DRAFT
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getSaleDetailById } from "@/modules/commerce/sales/queries/get-sale-detail-by-id";
import { updateSaleDraftSchema } from "@/modules/commerce/sales/schemas/sale.schemas";
import { updateSaleDraft } from "@/modules/commerce/sales/services/sale.service";
import { getSaleApiContext } from "../sale-api-context";

// ── GET — detalle ──────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getSaleApiContext(req);
  if (!ctx.ok) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const sale = await getSaleDetailById(id, ctx.tenant_id, ctx.location_id);
  if (!sale) {
    return NextResponse.json({ ok: false, error: "La venta no fue encontrada." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: sale }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

// ── PATCH — actualizar cabecera ────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return NextResponse.json({ ok: false, error: "Sesión sin tenant activo." }, { status: 401 });
  if (!location_id) return NextResponse.json({ ok: false, error: "Selecciona una location activa." }, { status: 409 });

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "Body JSON requerido." }, { status: 400 });
  }

  const parsed = updateSaleDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await updateSaleDraft(id, tenant_id, location_id, sessionUser.id, parsed.data);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}
