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
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
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

  try {
    const sale = await getSaleDetailById(id, ctx.tenant_id, ctx.location_id, ctx.client);
    if (!sale) {
      return NextResponse.json({ ok: false, error: "La venta no fue encontrada." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: sale }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } finally {
    await ctx.dispose();
  }
}

// ── PATCH — actualizar cabecera ────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.sales", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return NextResponse.json({ ok: false, error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(sessionUser, context.client, context.tenantId));
    if (!location_id) {
      return NextResponse.json({ ok: false, error: "Selecciona una location activa." }, { status: 409 });
    }

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

    const result = await updateSaleDraft(id, context.tenantId, location_id, context.effectiveUser.id, parsed.data, context.client);

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    }

    return NextResponse.json({ ok: true });
  } finally {
    await dispose();
  }
}
