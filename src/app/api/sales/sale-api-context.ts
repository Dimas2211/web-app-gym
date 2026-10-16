// ─────────────────────────────────────────────────────────────────
// api/sales — sale-api-context.ts
//
// Contexto de autenticación para rutas de commerce/sales.
// Sales es tenant + location scoped: requiere location_id activa.
// ─────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { evaluateCommerceOperatorAccess } from "@/core/permissions/commerce-access";
import { assertCommerceOperatorAccess } from "@/modules/commerce/shared/require-commerce-operator-context";
import { getLocationById } from "@/core/modules/locations/queries";
import { ACTIVE_LOCATION_COOKIE, getEffectiveLocationId } from "@/lib/location/active-location";
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

// Opción opt-in SOLO para handlers GET de lectura (listado/detalle). Una
// identidad RUNTIME_CLIENT tenant-wide (location_id null en JWT) recibe
// locationId null de requireRuntimeOrganizationContext — por diseño,
// nunca se inventa una branch. Con esta opción, se resuelve la location
// activa del selector (cookie) validada contra la DB RUNTIME del tenant
// efectivo — mismo criterio que la página del módulo. Los handlers de
// escritura NO la usan (mismo patrón que dte-api-context.ts).
interface SaleApiContextOptions {
  resolveRuntimeActiveLocation?: boolean;
}

export async function getSaleApiContext(
  req: NextRequest,
  options: SaleApiContextOptions = {},
): Promise<SaleApiContext> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, status: 401, error: "No autorizado." };
  }
  const user = session.user as SessionUser;

  // Operar ventas (super_admin | branch_admin | reception) — NO canManageStaff.
  // Puerta del JWT; el rol LIVE se rechequea abajo tras resolver el contexto.
  const jwtAccess = evaluateCommerceOperatorAccess({ role: user.role, locationId: user.location_id });
  if (!jwtAccess.ok) {
    return { ok: false, status: 403, error: jwtAccess.message };
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
      const location = await getLocationById(activeLocationId, tenant_id);
      if (location && location.tenant_id === tenant_id) {
        baseLocationId = location.id;
      }
    }
  }

  // FASE VI-D6: `user` SIEMPRE se pasa como segundo argumento — antes se
  // omitía y una identidad RUNTIME_CLIENT caía silenciosamente al branch
  // PLATFORM_NATIVO (Prisma global + tenant_id de JWT sin revalidar) en
  // vez de resolverse vía requireRuntimeOrganizationContext (fail closed).
  const { context, dispose } = await resolveEffectiveApiContext(
    { tenantId: tenant_id, locationId: baseLocationId },
    user,
  );

  // Rechequeo con ROL LIVE (context.effectiveRole) — para RUNTIME_CLIENT es
  // el rol vigente en runtimeDb.user, no el del JWT (hasta 8h de antigüedad).
  // Para PLATFORM_NATIVE/SUPPORT_RUNTIME, effectiveRole es el mismo valor de
  // JWT ya chequeado arriba — el rechequeo es redundante pero inofensivo.
  // Se evalúa ANTES de resolver la location por cookie: un rol no global
  // sin sucursal fija se deniega y nunca elige sucursal vía selector.
  // Roles no globales: la sucursal de la sesión debe seguir siendo su
  // asignación actual (User.branch_id) en la DB efectiva.
  let liveDenied: string | null;
  try {
    liveDenied = await assertCommerceOperatorAccess({
      db: context.client,
      tenantId: context.tenantId,
      userId: user.id,
      role: context.effectiveRole,
      locationId: context.locationId,
    });
  } catch (err) {
    await dispose();
    throw err;
  }
  if (liveDenied) {
    await dispose();
    return { ok: false, status: 403, error: liveDenied };
  }

  const locationId =
    context.locationId ??
    (options.resolveRuntimeActiveLocation && context.runtimeMode === "RUNTIME_CLIENT"
      ? await getEffectiveLocationId(user, context.client, context.tenantId)
      : null);

  if (!locationId) {
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
    location_id: locationId,
    client:      context.client,
    runtime:     context.runtime,
    dispose,
  };
}
