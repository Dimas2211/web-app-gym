export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getActiveClients } from "@/modules/reports/queries";
import { resolveEffectiveApiContext } from "@/modules/platform/runtime/effective-tenant-context";

// Bloque B (cierre reporting) — Client no tiene module code propio en el
// catálogo de 15 (mismo criterio ya aplicado a la navegación de
// "Clientes"). Este endpoint queda sin module guard deliberadamente;
// solo aplica el guard de rol existente.
const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as SessionUser;
  if (!ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  // PASO 6C: tenant/PrismaClient EFECTIVOS bajo sesión runtime "Operar como cliente".
  const { context, dispose } = await resolveEffectiveApiContext({ tenantId: user.tenant_id });

  try {
    const { searchParams } = req.nextUrl;
    const branchIdParam = searchParams.get("branchId") ?? undefined;

    const branchId =
      user.role === "branch_admin" || user.role === "reception"
        ? (user.location_id ?? undefined)
        : branchIdParam;

    const data = await getActiveClients({ tenantId: context.tenantId, branchId }, context.client);
    return NextResponse.json(data);
  } finally {
    await dispose();
  }
}
