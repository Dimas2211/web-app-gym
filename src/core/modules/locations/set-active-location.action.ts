"use server";

// ─────────────────────────────────────────────────────────────────
// core/modules/locations — set-active-location.action.ts
//
// Server Action para cambiar la location operativa activa de un
// usuario global (super_admin).
//
// Este archivo es un Server Action con "use server" — a diferencia
// de actions.ts en este mismo módulo, que son funciones puras sin
// acceso a sesión ni cookies.
//
// QUÉ HACE:
//   - Valida que el usuario está autenticado
//   - Valida que el usuario tiene scopeType "global" (solo globales cambian location)
//   - Valida que la location pertenece al tenant del usuario
//   - Escribe la cookie ACTIVE_LOCATION_COOKIE
//   - NO toca el JWT ni auth.ts
//   - NO requiere relogin
//
// LLAMADO DESDE: LocationSwitcher (componente client-side en dashboard header)
// ─────────────────────────────────────────────────────────────────

import { cookies } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import { getLocationById } from "@/core/modules/locations/queries";
import { ACTIVE_LOCATION_COOKIE } from "@/lib/location/active-location";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import type { SessionUser } from "@/lib/permissions/guards";
import type { UserRole } from "@prisma/client";

// ── Tipo de retorno ───────────────────────────────────────────────

export type SetActiveLocationResult =
  | { ok: true; locationName: string }
  | { ok: false; error: string };

// ── Server Action ─────────────────────────────────────────────────

export async function setActiveLocationAction(
  locationId: string,
): Promise<SetActiveLocationResult> {
  // 1. Autenticación
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "No autorizado." };
  }

  const user = session.user as SessionUser & { role: UserRole };

  // FASE VI-D3 — resolver contexto operacional efectivo (DB + rol LIVE)
  // ANTES de validar la location. Sin `module`: este selector es core,
  // no está gateado por ningún módulo comercial.
  let handle;
  try {
    handle = await requireOperationalContext(user);
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    // 2. Solo usuarios globales pueden cambiar su active location. El rol
    //    LIVE decide para RUNTIME_CLIENT (no el rol del JWT arriba) — un
    //    downgrade a un rol con location fija no debe seguir pudiendo
    //    sobreescribir la cookie.
    const caps = getCapabilities(context.effectiveUser.role as UserRole);
    if (!caps.isGlobal) {
      return {
        ok: false,
        error: "Solo usuarios de alcance global pueden cambiar la location activa.",
      };
    }

    // 3. Validar que la location exista y pertenezca al tenant EFECTIVO,
    //    contra la DB EFECTIVA (runtime propia para RUNTIME_CLIENT) —
    //    nunca Prisma global.
    const location = await getLocationById(locationId, context.tenantId, context.client);

    if (!location) {
      return { ok: false, error: "Location no encontrada." };
    }

    if (location.tenant_id !== context.tenantId) {
      return { ok: false, error: "Location no pertenece a este tenant." };
    }

    if (location.status !== "active") {
      return { ok: false, error: "La location seleccionada no está activa." };
    }

    // 4. Escribir la cookie de contexto operativo.
    //    No es HttpOnly — no contiene secretos.
    //    Segura porque siempre se revalida contra el tenant efectivo al leer.
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_LOCATION_COOKIE, locationId, {
      path:     "/",
      sameSite: "lax",
      secure:   process.env.NODE_ENV === "production",
      maxAge:   60 * 60 * 24 * 30, // 30 días
    });

    return { ok: true, locationName: location.name };
  } finally {
    await dispose();
  }
}
