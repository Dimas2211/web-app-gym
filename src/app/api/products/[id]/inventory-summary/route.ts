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

  // PASO 6A: bajo sesión runtime, la location efectiva es la primera
  // sucursal activa del tenant runtime, no la del selector del super_admin.
  const baseLocationId = await getEffectiveLocationId(user);
  const { context, dispose } = await resolveEffectiveApiContext({
    tenantId:   tenant_id,
    locationId: baseLocationId,
  });

  try {
    if (!context.locationId) {
      return NextResponse.json(
        { error: "La sesión no tiene tenant o location activos." },
        { status: 400 },
      );
    }

    const data = await getProductInventorySummary(context.tenantId, context.locationId, id, context.client);
    return NextResponse.json(data);
  } finally {
    await dispose();
  }
}
