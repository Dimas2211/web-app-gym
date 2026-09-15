// ─────────────────────────────────────────────────────────────────
// lib/location/active-location.ts
//
// Helper reutilizable de contexto operativo de location activa.
//
// PROBLEMA QUE RESUELVE:
//   El JWT codifica correctamente que un super_admin no tiene una
//   location fija (location_id = null). Pero los módulos location-scoped
//   (inventory, purchases, sales, etc.) necesitan saber en qué location
//   está operando el usuario en este momento.
//
//   Para usuarios con location fija (branch_admin, reception, trainer):
//     → location_id viene del JWT — no se necesita nada más.
//   Para usuarios globales (super_admin):
//     → La location activa se guarda en una cookie de contexto operativo.
//     → El usuario la selecciona desde el LocationSwitcher en el header.
//     → No requiere relogin — es una preferencia de sesión de trabajo.
//
// USO EN MÓDULOS LOCATION-SCOPED:
//   const locationId = await getEffectiveLocationId(user);
//   if (!locationId) { /* mostrar selector o mensaje */ }
//
// SEGURIDAD:
//   La cookie no contiene secretos — solo un UUID de location.
//   Al leerla, siempre se valida que la location pertenezca al tenant
//   del usuario autenticado (según JWT). Previene que una cookie
//   obsoleta o manipulada acceda a datos de otro tenant.
// ─────────────────────────────────────────────────────────────────

import { cookies } from "next/headers";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getLocationById } from "@/core/modules/locations/queries";
import type { SessionUser } from "@/lib/permissions/guards";

// ── Constante del nombre de la cookie ─────────────────────────────
//
// Exportada para que set-active-location.action.ts y cualquier
// otro consumidor usen el mismo nombre sin duplicarlo.

export const ACTIVE_LOCATION_COOKIE = "active_location_id";

// ── Helper principal ──────────────────────────────────────────────

/**
 * Devuelve el location_id efectivo para el usuario dado.
 *
 * Lógica:
 *   1. Si el usuario tiene location_id en JWT → devolverlo directamente.
 *      (branch_admin, reception, trainer tienen location fija en BD)
 *   2. Si location_id es null → leer cookie ACTIVE_LOCATION_COOKIE.
 *      (super_admin u otros roles globales)
 *   3. Validar que la location de la cookie exista y pertenezca al tenant.
 *   4. Si no es válida → devolver null (el módulo decide cómo manejarlo).
 *
 * @param user - Usuario de sesión autenticado (desde getSessionOrRedirect)
 * @param db   - PrismaClient efectivo. FASE VI-D3 — default Prisma global
 *               solo para compatibilidad de callers PLATFORM_NATIVE no
 *               migrados; todo caller runtime-aware DEBE pasar
 *               `context.client` explícito (nunca alcanzar este default
 *               desde RUNTIME_CLIENT, que validaría contra la DB
 *               equivocada).
 * @param effectiveTenantId - tenant EFECTIVO contra el que validar la
 *               cookie. Default `user.tenant_id` (comportamiento previo,
 *               correcto para PLATFORM_NATIVE). Un caller runtime-aware
 *               debe pasar el tenant efectivo (igual al tenant de `db`).
 * @returns location_id válido o null si no hay contexto operativo activo
 */
export async function getEffectiveLocationId(
  user: SessionUser,
  db: PrismaClient = prisma,
  effectiveTenantId: string = user.tenant_id,
): Promise<string | null> {
  // Caso 1: usuario con location fija en JWT.
  // No consultar cookie — el JWT es la fuente de verdad para este rol.
  // NOTA: esto es el valor congelado en sesión; la revalidación LIVE contra
  // runtimeDb para RUNTIME_CLIENT ya ocurre en
  // requireRuntimeOrganizationContext (ETAPA E de VI-D3) antes de llegar aquí.
  if (user.location_id) {
    return user.location_id;
  }

  // Caso 2: usuario global (super_admin) — leer la cookie de contexto operativo.
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ACTIVE_LOCATION_COOKIE)?.value;

  if (!cookieValue) {
    return null; // No ha seleccionado una location de trabajo todavía
  }

  // Validar que la location de la cookie exista y pertenezca al tenant
  // EFECTIVO — contra `db` (runtime propio si aplica), nunca Prisma
  // global desde un caller runtime-aware. Previene que cookies antiguas
  // o de otro tenant filtren datos cruzados.
  const location = await getLocationById(cookieValue, db);

  if (!location || location.tenant_id !== effectiveTenantId) {
    return null; // Cookie obsoleta o de tenant distinto — ignorar
  }

  return location.id;
}
