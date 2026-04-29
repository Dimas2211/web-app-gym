export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/products/[id]  — ficha completa de un producto
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getProductById } from "@/modules/commerce/products/queries/get-product-by-id";

// Roles que pueden ver el catálogo
const VIEWER_ROLES = ["super_admin", "branch_admin", "reception"];

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!VIEWER_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const product = await getProductById(user.tenant_id, params.id);

  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });
  }

  return NextResponse.json(product);
}
