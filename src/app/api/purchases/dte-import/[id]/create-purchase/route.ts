// ─────────────────────────────────────────────────────────────────
// api/purchases/dte-import/[id]/create-purchase/route.ts
//
// POST /api/purchases/dte-import/:id/create-purchase
//   Convierte un PurchaseDteImport existente en una Purchase DRAFT.
//   Requiere payload con supplier_id aprobado e items aprobados.
//
//   No confirma la compra.
//   No genera InventoryMovement.
//   No crea proveedores ni productos.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { createPurchaseFromDteSchema } from "@/modules/commerce/purchases/schemas/dte-import.schema";
import { createPurchaseDraftFromDteImport } from "@/modules/commerce/purchases/services/create-purchase-from-dte-import.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id || !location_id) {
    return NextResponse.json(
      { error: "Sesión sin tenant o location activa." },
      { status: 401 },
    );
  }

  const { id } = await params;

  // Parsear body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON inválido o vacío." },
      { status: 400 },
    );
  }

  // Validar con Zod
  const parsed = createPurchaseFromDteSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await createPurchaseDraftFromDteImport(
    id,
    tenant_id,
    location_id,
    sessionUser.id,
    parsed.data,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.httpStatus },
    );
  }

  return NextResponse.json(
    {
      ok:         true,
      purchase:   result.purchase,
      dte_import: result.dte_import,
    },
    { status: 201 },
  );
}
