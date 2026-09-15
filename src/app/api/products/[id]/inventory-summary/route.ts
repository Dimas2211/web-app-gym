export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/products/[id]/inventory-summary
//
// Devuelve el resumen de inventario del producto para la location
// activa del usuario autenticado.
//
// Responde con el objeto ProductInventorySummary si el producto
// tiene registro en product_locations para esa location, o null
// si todavía no fue configurado.
//
// Solo lectura — no modifica stock ni crea registros.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { resolveEffectiveApiContext } from "@/modules/platform/runtime/effective-tenant-context";
import { getProductInventorySummary } from "@/modules/commerce/products/queries/get-product-inventory-summary";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

const VIEWER_ROLES = ["super_admin", "branch_admin", "reception"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!VIEWER_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const tenant_id = user.tenant_id;
  if (!tenant_id) {
    return NextResponse.json(
      { error: "La sesión no tiene tenant activo." },
      { status: 400 },
    );
  }

  const { context, dispose } = await resolveEffectiveApiContext({ tenantId: tenant_id }, user);

  try {
    // FASE VI-D3: `context.locationId` ya viene LIVE-validado (RUNTIME_CLIENT)
    // o del JWT/Support Session; para identidades tenant-wide (null), cae a
    // la cookie de selección explícita, validada contra la DB EFECTIVA.
    const locationId =
      context.locationId ??
      (await getEffectiveLocationId(
        { ...user, tenant_id: context.tenantId },
        context.client,
        context.tenantId,
      ));

    if (!locationId) {
      return NextResponse.json(
        { error: "La sesión no tiene tenant o location activos." },
        { status: 400 },
      );
    }

    // Función real = resumen de INVENTARIO -> module code commerce.inventory.
    const commercialCtx = await resolveCommercialEnforcementContext(context.tenantId);
    try {
      assertOrganizationModule(commercialCtx, "commerce.inventory");
    } catch (err) {
      if (err instanceof CommercialEnforcementError) {
        return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
      }
      throw err;
    }

    const data = await getProductInventorySummary(context.tenantId, locationId, id, context.client);
    return NextResponse.json(data);
  } finally {
    await dispose();
  }
}
