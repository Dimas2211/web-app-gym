// ─────────────────────────────────────────────────────────────────
// api/dte — dte-api-context.ts
//
// Contexto de autenticación para rutas de commerce/dte outgoing.
// DTE outgoing es tenant + location scoped: requiere location_id activa.
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

// PASO 6A (corrección de alcance): resuelve además el tenant_id/
// location_id/PrismaClient EFECTIVOS — los del perfil runtime "Operar
// como cliente" si hay sesión activa, o los normales del usuario en
// caso contrario. Solo aplica a LECTURA de documentos DTE existentes
// (GET) — nunca a generación, firma, transmisión o invalidación, que
// siguen sin tocarse y se bloquean aparte bajo sesión runtime.
// El caller SIEMPRE debe llamar `ctx.dispose()` (ideal: try/finally).
type DteApiContext =
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

export async function getDteApiContext(req: NextRequest): Promise<DteApiContext> {
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
        : "Selecciona una location activa para operar con documentos DTE.",
    };
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
