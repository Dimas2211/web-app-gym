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
import { resolveEffectiveApiContext } from "@/modules/platform/runtime/effective-tenant-context";
import { getProductPurchaseHistory } from "@/modules/commerce/products/queries/get-product-purchase-history";
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

  // PASO 6A: bajo sesión runtime, nunca usar user.location_id (pertenece
  // al super_admin, no al tenant runtime) — null = todas las locations
  // del tenant efectivo, igual que el comportamiento normal de super_admin.
  const { context, dispose } = await resolveEffectiveApiContext({ tenantId: user.tenant_id });
  try {
    // Función real = consultar historial de COMPRAS -> module code commerce.purchases.
    const commercialCtx = await resolveCommercialEnforcementContext(context.tenantId);
    try {
      assertOrganizationModule(commercialCtx, "commerce.purchases");
    } catch (err) {
      if (err instanceof CommercialEnforcementError) {
        return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
      }
      throw err;
    }

    const rows = await getProductPurchaseHistory(
      context.tenantId,
      id,
      context.runtime ? null : (user.location_id ?? null),
      context.client,
    );

    return NextResponse.json(rows);
  } finally {
    await dispose();
  }
}
