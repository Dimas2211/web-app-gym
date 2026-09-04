// ─────────────────────────────────────────────────────────────────
// api/sales — sale-api-context.ts
//
// Contexto de autenticación para rutas de commerce/sales.
// Sales es tenant + location scoped: requiere location_id activa.
// ─────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import type { PrismaClient, UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import { getLocationById } from "@/core/modules/locations/queries";
import { ACTIVE_LOCATION_COOKIE } from "@/lib/location/active-location";
import {
  resolveEffectiveApiContext,
  type RuntimeSessionPayload,
} from "@/modules/platform/runtime/effective-tenant-context";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

// PASO 6A (corrección de alcance): además de autenticar y resolver la
// location activa del usuario, este contexto resuelve el tenant_id/
// location_id/PrismaClient EFECTIVOS — los del perfil runtime "Operar
// como cliente" si hay sesión activa, o los normales del usuario en
// caso contrario. El caller SIEMPRE debe llamar `ctx.dispose()`
// (ideal: try/finally) para cerrar el PrismaClient runtime si aplica.
type SaleApiContext =
  | {
      ok:          true;
      user_id:     string;
      tenant_id:   string;
      location_id: string;
      client:      PrismaClient;
      runtime:     RuntimeSessionPayload | null;
      dispose:     () => Promise<void>;
    }
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

  // Resolver location "base" (comportamiento normal, sin sesión runtime).
  // Si hay sesión runtime activa, resolveEffectiveApiContext ignora este
  // valor y resuelve su propia location dentro del tenant runtime.
  let baseLocationId: string | null = user.location_id ?? null;

  if (!baseLocationId) {
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

    if (activeLocationId) {
      const location = await getLocationById(activeLocationId);
      if (location && location.tenant_id === tenant_id) {
        baseLocationId = location.id;
      }
    }
  }

  const { context, dispose } = await resolveEffectiveApiContext({
    tenantId:   tenant_id,
    locationId: baseLocationId,
  });

  if (!context.locationId) {
    await dispose();
    return {
      ok: false,
      status: 409,
      error: context.runtime
        ? "El tenant runtime no tiene sucursales activas configuradas."
        : "Selecciona una location activa para operar con ventas.",
    };
  }

  // Bloque B — guard central único: cubre automáticamente todos los
  // Route Handlers que llaman getSaleApiContext (route.ts, [id]/route.ts,
  // y products/search-for-sale ya guardado explícitamente también).
  try {
    const commercialCtx = await resolveCommercialEnforcementContext(context.tenantId);
    assertOrganizationModule(commercialCtx, "commerce.sales");
  } catch (err) {
    await dispose();
    if (err instanceof CommercialEnforcementError) {
      return { ok: false, status: err.httpStatus, error: err.userMessage };
    }
    throw err;
  }

  return {
    ok:          true,
    user_id:     user.id!,
    tenant_id:   context.tenantId,
    location_id: context.locationId,
    client:      context.client,
    runtime:     context.runtime,
    dispose,
  };
}
