export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/products/[id]  — ficha completa de un producto
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { resolveEffectiveApiContext } from "@/modules/platform/runtime/effective-tenant-context";
import { getProductById } from "@/modules/commerce/products/queries/get-product-by-id";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

// Roles que pueden ver el catálogo
const VIEWER_ROLES = ["super_admin", "branch_admin", "reception"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  const { context, dispose } = await resolveEffectiveApiContext({ tenantId: user.tenant_id });
  try {
    const commercialCtx = await resolveCommercialEnforcementContext(context.tenantId);
    try {
      assertOrganizationModule(commercialCtx, "commerce.products");
    } catch (err) {
      if (err instanceof CommercialEnforcementError) {
        return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
      }
      throw err;
    }

    const product = await getProductById(context.tenantId, id, context.client);

    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });
    }

    return NextResponse.json(product);
  } finally {
    await dispose();
  }
}
