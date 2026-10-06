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
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { checkOperationalGrant } from "@/core/security/operational-authorization/operational-authorization";
import { SALE_DRAFT_WRITE_SCOPES } from "@/core/security/operational-authorization/scopes";

type RouteParams = { params: Promise<{ id: string; itemId: string }> };

// ── PATCH — editar línea ───────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: sale_id, itemId: item_id } = await params;

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
    // Autorización Operativa — misma exigencia que las server actions.
    const grant = await checkOperationalGrant(context, SALE_DRAFT_WRITE_SCOPES, sale_id);
    if (!grant.ok) {
      return NextResponse.json({ ok: false, error: grant.error }, { status: 403 });
    }

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

    const parsed = updateSaleItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await updateSaleItemInDraft(item_id, sale_id, context.tenantId, location_id, context.effectiveUser.id, parsed.data, context.client);

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    }

    return NextResponse.json({ ok: true });
  } finally {
    await dispose();
  }
}

// ── DELETE — eliminar línea ────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id: sale_id, itemId: item_id } = await params;

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
    // Autorización Operativa — misma exigencia que las server actions.
    const grant = await checkOperationalGrant(context, SALE_DRAFT_WRITE_SCOPES, sale_id);
    if (!grant.ok) {
      return NextResponse.json({ ok: false, error: grant.error }, { status: 403 });
    }

    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(sessionUser, context.client, context.tenantId));
    if (!location_id) {
      return NextResponse.json({ ok: false, error: "Selecciona una location activa." }, { status: 409 });
    }

    const result = await removeSaleItemFromDraft(item_id, sale_id, context.tenantId, location_id, context.effectiveUser.id, context.client);

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    }

    return NextResponse.json({ ok: true });
  } finally {
    await dispose();
  }
}
