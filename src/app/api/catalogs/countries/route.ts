export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/catalogs/countries
//
// Catálogo de países — ISO 3166-1 alpha-2.
// Sin filtros — el catálogo es pequeño (≤50 registros activos)
// y se carga completo. El filtrado por texto se hace en cliente
// dentro del componente Select.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getCountries } from "@/modules/commerce/suppliers/queries/get-countries";

const ADMIN_ROLES = ["super_admin", "branch_admin"];

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const items = await getCountries();
  return NextResponse.json({ items });
}
