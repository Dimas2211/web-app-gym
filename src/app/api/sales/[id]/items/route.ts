// ─────────────────────────────────────────────────────────────────
// api/sales/[id]/items/route.ts
//
// POST /api/sales/:id/items — agregar línea a venta DRAFT
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { addSaleItemSchema } from "@/modules/commerce/sales/schemas/sale.schemas";
import { addSaleItemToDraft } from "@/modules/commerce/sales/services/sale.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

// ── POST — agregar línea ───────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sale_id } = await params;

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

    const parsed = addSaleItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await addSaleItemToDraft(sale_id, context.tenantId, location_id, context.effectiveUser.id, parsed.data, context.client);

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    }

    return NextResponse.json(
      { ok: true, data: { item_id: result.item_id, line_number: result.line_number } },
      { status: 201 },
    );
  } finally {
    await dispose();
  }
}
