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
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

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

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return NextResponse.json({ error: RUNTIME_READONLY_MESSAGE }, { status: 403 });
  }

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.purchases");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
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
      ok:             true,
      purchase:       result.purchase,
      dte_import:     result.dte_import,
      alias_warnings: result.alias_warnings,
    },
    { status: 201 },
  );
}
