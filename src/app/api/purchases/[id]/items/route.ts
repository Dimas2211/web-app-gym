// ─────────────────────────────────────────────────────────────────
// api/purchases/[id]/items/route.ts
//
// POST /api/purchases/:id/items — agregar línea a una compra en DRAFT
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { addPurchaseItemSchema } from "@/modules/commerce/purchases/schemas/purchase-item.schema";
import { addPurchaseItem } from "@/modules/commerce/purchases/services/purchase.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.purchases", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(
        { ...context.effectiveUser, role: context.effectiveUser.role as SessionUser["role"] } as SessionUser,
        context.client,
        context.tenantId,
      ));

    if (!location_id) {
      return NextResponse.json({ error: "Sesión sin tenant o location activa." }, { status: 401 });
    }

    const { id: purchase_id } = await params;

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Body JSON requerido." }, { status: 400 });
    }

    const parsed = addPurchaseItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await addPurchaseItem(
      purchase_id,
      context.tenantId,
      location_id,
      context.effectiveUser.id,
      parsed.data,
      context.client,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } finally {
    await dispose();
  }
}
