// ─────────────────────────────────────────────────────────────────
// api/sales/[id]/recalculate/route.ts
//
// POST /api/sales/:id/recalculate — recalcular totales de venta DRAFT
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { recalculateSaleTotals } from "@/modules/commerce/sales/services/sale.service";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

// ── POST — recalcular totales ──────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sale_id } = await params;

  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return NextResponse.json({ ok: false, error: "Sesión sin tenant activo." }, { status: 401 });
  if (!location_id) return NextResponse.json({ ok: false, error: "Selecciona una location activa." }, { status: 409 });

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return NextResponse.json({ ok: false, error: RUNTIME_READONLY_MESSAGE }, { status: 403 });
  }

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.sales");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      return NextResponse.json({ ok: false, error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }

  const result = await recalculateSaleTotals(sale_id, tenant_id, location_id, sessionUser.id);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}
