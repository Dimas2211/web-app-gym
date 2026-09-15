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
import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { createPurchaseFromDteSchema } from "@/modules/commerce/purchases/schemas/dte-import.schema";
import { createPurchaseDraftFromDteImport } from "@/modules/commerce/purchases/services/create-purchase-from-dte-import.service";
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
      context.tenantId,
      location_id,
      context.effectiveUser.id,
      parsed.data,
      context.client,
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.httpStatus },
      );
    }

    return NextResponse.json(
      {
        ok:             true,
        purchase:       result.purchase,
        dte_import:     result.dte_import,
        alias_warnings: result.alias_warnings,
      },
      { status: 201 },
    );
  } finally {
    await dispose();
  }
}
