// ─────────────────────────────────────────────────────────────────
// api/purchases/[id]/items/[itemId]/route.ts
//
// PATCH  /api/purchases/:id/items/:itemId — editar línea en DRAFT
// DELETE /api/purchases/:id/items/:itemId — eliminar línea en DRAFT
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { updatePurchaseItemSchema } from "@/modules/commerce/purchases/schemas/purchase-item.schema";
import {
  updatePurchaseItem,
  removePurchaseItem,
} from "@/modules/commerce/purchases/services/purchase.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

type RouteParams = { params: Promise<{ id: string; itemId: string }> };

// ── PATCH — editar línea ──────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteParams) {
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
      context.tenantId,
      location_id,
      context.effectiveUser.id,
      parsed.data,
      context.client,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({ ok: true });
  } finally {
    await dispose();
  }
}

// ── DELETE — eliminar línea ───────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams,
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

    const { id: purchase_id, itemId: item_id } = await params;

    const result = await removePurchaseItem(
      item_id,
      purchase_id,
      context.tenantId,
      location_id,
      context.effectiveUser.id,
      context.client,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({ ok: true });
  } finally {
    await dispose();
  }
}
