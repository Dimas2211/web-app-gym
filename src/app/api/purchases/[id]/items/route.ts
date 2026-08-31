// ─────────────────────────────────────────────────────────────────
// api/purchases/[id]/items/route.ts
//
// POST /api/purchases/:id/items — agregar línea a una compra en DRAFT
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { addPurchaseItemSchema } from "@/modules/commerce/purchases/schemas/purchase-item.schema";
import { addPurchaseItem } from "@/modules/commerce/purchases/services/purchase.service";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = sessionUser.location_id;

  if (!tenant_id || !location_id) {
    return NextResponse.json({ error: "Sesión sin tenant o location activa." }, { status: 401 });
  }

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return NextResponse.json({ error: RUNTIME_READONLY_MESSAGE }, { status: 403 });
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
    tenant_id,
    location_id,
    sessionUser.id,
    parsed.data,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
