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
import { getProductInventorySummary } from "@/modules/commerce/products/queries/get-product-inventory-summary";

const VIEWER_ROLES = ["super_admin", "branch_admin", "reception"];

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!VIEWER_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const tenant_id   = user.tenant_id;
  const location_id = await getEffectiveLocationId(user);

  if (!tenant_id || !location_id) {
    return NextResponse.json(
      { error: "La sesión no tiene tenant o location activos." },
      { status: 400 },
    );
  }

  const data = await getProductInventorySummary(tenant_id, location_id, params.id);
  return NextResponse.json(data);
}
