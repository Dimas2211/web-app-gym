export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/products/[id]/purchase-history
//
// Historial de compras de un producto específico.
// Solo lectura. Filtra por tenant_id de sesión (obligatorio)
// y location_id de sesión (si está presente).
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getProductPurchaseHistory } from "@/modules/commerce/products/queries/get-product-purchase-history";

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

  const rows = await getProductPurchaseHistory(
    user.tenant_id,
    id,
    user.location_id ?? null,
  );

  return NextResponse.json(rows);
}
