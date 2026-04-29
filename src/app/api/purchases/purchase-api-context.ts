import type { NextRequest } from "next/server";
import type { UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import { getLocationById } from "@/core/modules/locations/queries";
import { ACTIVE_LOCATION_COOKIE } from "@/lib/location/active-location";

type PurchaseApiContext =
  | { ok: true; user_id: string; tenant_id: string; location_id: string }
  | { ok: false; status: number; error: string };

export async function getPurchaseApiContext(req: NextRequest): Promise<PurchaseApiContext> {
  const session = await auth();
  const user = session?.user;

  if (!user) {
    return { ok: false, status: 401, error: "No autorizado." };
  }

  const role = user.role as UserRole;
  if (!getCapabilities(role).canManageStaff) {
    return { ok: false, status: 403, error: "No autorizado." };
  }

  const tenant_id = user.tenant_id;
  if (!tenant_id) {
    return { ok: false, status: 401, error: "Sesión sin tenant activo." };
  }

  // Caso 1: usuario con location fija en JWT (branch_admin, reception, trainer)
  if (user.location_id) {
    return { ok: true, user_id: user.id!, tenant_id, location_id: user.location_id };
  }

  // Caso 2: super_admin — buscar location activa desde cookie.
  // Estrategia triple para mayor robustez ante variaciones de Next.js 15 / Auth.js v5:
  //   a) req.cookies (NextRequest — lectura directa del header Cookie de entrada)
  //   b) cookies() de next/headers (abstracción de Next.js sobre el mismo header)
  //   c) header Cookie raw (fallback si ambas APIs difieren)

  const fromReq       = req.cookies.get(ACTIVE_LOCATION_COOKIE)?.value;
  const cookieStore   = await cookies();
  const fromNextHdrs  = cookieStore.get(ACTIVE_LOCATION_COOKIE)?.value;
  const rawCookieHdr  = req.headers.get("cookie") ?? "";
  const fromRawHeader = rawCookieHdr
    .split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === ACTIVE_LOCATION_COOKIE)?.[1];

  // LOG DIAGNÓSTICO — retirar después de confirmar la causa raíz
  console.log("[purchases-api-ctx] user.location_id:", user.location_id);
  console.log("[purchases-api-ctx] user.tenant_id:", tenant_id);
  console.log("[purchases-api-ctx] req.cookies active_location_id:", fromReq);
  console.log("[purchases-api-ctx] next/headers cookies active_location_id:", fromNextHdrs);
  console.log("[purchases-api-ctx] raw Cookie header active_location_id:", fromRawHeader);
  console.log("[purchases-api-ctx] full raw Cookie header:", rawCookieHdr.substring(0, 200));

  const activeLocationId = fromReq ?? fromNextHdrs ?? fromRawHeader;

  if (!activeLocationId) {
    return {
      ok: false,
      status: 409,
      error: "Selecciona una location activa para consultar compras.",
    };
  }

  const location = await getLocationById(activeLocationId);
  if (!location || location.tenant_id !== tenant_id) {
    console.log("[purchases-api-ctx] location lookup failed:", { activeLocationId, location, tenant_id });
    return {
      ok: false,
      status: 409,
      error: "La location activa no es válida para este tenant.",
    };
  }

  return {
    ok: true,
    user_id: user.id!,
    tenant_id,
    location_id: location.id,
  };
}
