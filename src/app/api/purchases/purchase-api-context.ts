import type { NextRequest } from "next/server";
import type { PrismaClient, UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
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
type PurchaseApiContext =
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

export async function getPurchaseApiContext(req: NextRequest): Promise<PurchaseApiContext> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, status: 401, error: "No autorizado." };
  }
  const user = session.user as SessionUser;

  const role = user.role as UserRole;
  if (!getCapabilities(role).canManageStaff) {
    return { ok: false, status: 403, error: "No autorizado." };
  }

  const tenant_id = user.tenant_id;
  if (!tenant_id) {
    return { ok: false, status: 401, error: "Sesión sin tenant activo." };
  }

  // Resolver location "base" (comportamiento normal, sin sesión runtime):
  // JWT fija (branch_admin, reception, trainer) o cookie de sucursal
  // activa (super_admin). Si hay sesión runtime "Operar como cliente"
  // activa, resolveEffectiveApiContext IGNORA este valor y resuelve su
  // propia location dentro del tenant runtime — por eso no hace falta
  // bloquear aquí por falta de cookie cuando el caller viene en modo runtime.
  let baseLocationId: string | null = user.location_id ?? null;

  if (!baseLocationId) {
    // Caso super_admin — buscar location activa desde cookie.
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

    const activeLocationId = fromReq ?? fromNextHdrs ?? fromRawHeader;

    if (activeLocationId) {
      const location = await getLocationById(activeLocationId, tenant_id);
      if (location && location.tenant_id === tenant_id) {
        baseLocationId = location.id;
      }
    }
  }

  // PASO 6A: resolver tenant/location/client EFECTIVOS — del perfil
  // runtime si hay sesión activa, o los normales calculados arriba.
  //
  // FASE VI-D6: `user` SIEMPRE se pasa como segundo argumento — antes se
  // omitía y una identidad RUNTIME_CLIENT caía silenciosamente al branch
  // PLATFORM_NATIVO (Prisma global + tenant_id de JWT sin revalidar) en
  // vez de resolverse vía requireRuntimeOrganizationContext (fail closed).
  const { context, dispose } = await resolveEffectiveApiContext(
    { tenantId: tenant_id, locationId: baseLocationId },
    user,
  );

  if (!context.locationId) {
    await dispose();
    return {
      ok: false,
      status: 409,
      error: context.runtime
        ? "El tenant runtime no tiene sucursales activas configuradas."
        : "Selecciona una location activa para consultar compras.",
    };
  }

  // Rechequeo con ROL LIVE (context.effectiveRole) — para RUNTIME_CLIENT es
  // el rol vigente en runtimeDb.user, no el del JWT (hasta 8h de antigüedad).
  // Para PLATFORM_NATIVE/SUPPORT_RUNTIME, effectiveRole es el mismo valor de
  // JWT ya chequeado arriba — el rechequeo es redundante pero inofensivo.
  if (!getCapabilities(context.effectiveRole as UserRole).canManageStaff) {
    await dispose();
    return { ok: false, status: 403, error: "No autorizado." };
  }

  // Bloque B — guard central único: cubre automáticamente todos los
  // Route Handlers que llaman getPurchaseApiContext (route.ts, [id]/route.ts,
  // products/route.ts) sin duplicar el guard en cada archivo.
  try {
    const commercialCtx = await resolveCommercialEnforcementContext(context.tenantId);
    assertOrganizationModule(commercialCtx, "commerce.purchases");
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
