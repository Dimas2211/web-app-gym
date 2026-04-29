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

  // 2. Solo usuarios globales pueden cambiar su active location.
  //    Para roles con location fija (branch_admin, reception), location_id
  //    viene del JWT y no tiene sentido sobreescribirlo con una cookie.
  const caps = getCapabilities(user.role);
  if (!caps.isGlobal) {
    return {
      ok: false,
      error: "Solo usuarios de alcance global pueden cambiar la location activa.",
    };
  }

  // 3. Validar que la location exista y pertenezca al tenant del usuario.
  //    El tenant_id viene del JWT — es la fuente de verdad para el scope.
  const location = await getLocationById(locationId);

  if (!location) {
    return { ok: false, error: "Location no encontrada." };
  }

  if (location.tenant_id !== user.tenant_id) {
    return { ok: false, error: "Location no pertenece a este tenant." };
  }

  if (location.status !== "active") {
    return { ok: false, error: "La location seleccionada no está activa." };
  }

  // 4. Escribir la cookie de contexto operativo.
  //    No es HttpOnly — no contiene secretos.
  //    Segura porque siempre se revalida contra el tenant del JWT al leer.
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_LOCATION_COOKIE, locationId, {
    path:     "/",
    sameSite: "lax",
    secure:   process.env.NODE_ENV === "production",
    maxAge:   60 * 60 * 24 * 30, // 30 días
  });

  return { ok: true, locationName: location.name };
}
