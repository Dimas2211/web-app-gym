export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/inventory/product-locations/[id]
// Detalle completo de un ProductLocation para el panel lateral.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getProductLocationById } from "@/modules/commerce/inventory/queries/get-product-location-by-id";
import { getEffectiveLocationId } from "@/lib/location/active-location";

const VIEWER_ROLES = ["super_admin", "branch_admin", "reception"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  const { id } = await params;

  const record = await getProductLocationById(id, tenant_id, location_id);

  if (!record) {
    return NextResponse.json(
      { error: "Registro de inventario no encontrado." },
      { status: 404 },
    );
  }

  return NextResponse.json(record);
}
