// ─────────────────────────────────────────────────────────────────
// api/purchases/dte-import/[id]/route.ts
//
// GET /api/purchases/dte-import/:id
//   Devuelve el registro PurchaseDteImport por id.
//   Valida tenant_id y location_id activos.
//   Incluye raw_json para debug en esta fase de staging.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getPurchaseDteImportById } from "@/modules/commerce/purchases/queries/get-purchase-dte-import-by-id";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export async function GET(
  _req: NextRequest,
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

  const record = await getPurchaseDteImportById(id, tenant_id, location_id);
  if (!record) {
    return NextResponse.json(
      { error: "Registro DTE no encontrado o no pertenece a la location activa." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, data: record });
}
