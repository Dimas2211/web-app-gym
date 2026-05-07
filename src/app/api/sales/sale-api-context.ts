// ─────────────────────────────────────────────────────────────────
// api/sales — sale-api-context.ts
//
// Contexto de autenticación para rutas de commerce/sales.
// Sales es tenant + location scoped: requiere location_id activa.
// ─────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import type { UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import { getLocationById } from "@/core/modules/locations/queries";
import { ACTIVE_LOCATION_COOKIE } from "@/lib/location/active-location";

type SaleApiContext =
  | { ok: true; user_id: string; tenant_id: string; location_id: string }
  | { ok: false; status: number; error: string };

export async function getSaleApiContext(req: NextRequest): Promise<SaleApiContext> {
  const session = await auth();
  const user = session?.user;

  if (!user) {
    return { ok: false, status: 401, error: "No autorizado." };
  }

  const role = user.role as UserRole;
  if (!getCapabilities(role).canManageStaff) {
    return { ok: false, status: 403, error: "Sin permisos para esta operación." };
  }

  const tenant_id = user.tenant_id;
  if (!tenant_id) {
    return { ok: false, status: 401, error: "Sesión sin tenant activo." };
  }

  // Usuario con location fija en JWT (branch_admin, etc.)
  if (user.location_id) {
    return { ok: true, user_id: user.id!, tenant_id, location_id: user.location_id };
  }

  // super_admin — buscar location activa desde cookie (triple estrategia)
  const fromReq       = req.cookies.get(ACTIVE_LOCATION_COOKIE)?.value;
  const cookieStore   = await cookies();
  const fromNextHdrs  = cookieStore.get(ACTIVE_LOCATION_COOKIE)?.value;
  const rawCookieHdr  = req.headers.get("cookie") ?? "";
  const fromRawHeader = rawCookieHdr
    .split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === ACTIVE_LOCATION_COOKIE)?.[1];

  const activeLocationId = fromReq ?? fromNextHdrs ?? fromRawHeader;

  if (!activeLocationId) {
    return {
      ok: false,
      status: 409,
      error: "Selecciona una location activa para operar con ventas.",
    };
  }

  const location = await getLocationById(activeLocationId);
  if (!location || location.tenant_id !== tenant_id) {
    return {
      ok: false,
      status: 409,
      error: "La location activa no es válida para este tenant.",
    };
  }

  return { ok: true, user_id: user.id!, tenant_id, location_id: location.id };
}
