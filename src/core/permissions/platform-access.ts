/**
 * Frontera única de decisión "¿puede este usuario actuar como Platform Admin?".
 *
 * FASE VI-B — Runtime Identity Security Foundation.
 *
 * PROBLEMA que resuelve:
 * Antes de esta fase, `requireSuperAdmin()` autorizaba Platform Admin usando
 * únicamente `getCapabilities(role).isGlobal`. Eso funcionaba solo porque HOY
 * todo login viene del Prisma global. En cuanto exista login runtime (FASE
 * VI-C), un usuario de un cliente con `role=super_admin` (privilegio legítimo
 * DENTRO de su organización) NO debe poder cruzar al Control Plane.
 *
 * REGLA:
 * Platform Admin requiere AMBAS condiciones:
 *   1. auth_scope === "PLATFORM"        (origen/alcance de la identidad)
 *   2. getCapabilities(role).isGlobal   (privilegio de rol)
 *
 * Ninguna de las dos es suficiente por sí sola. Un futuro RUNTIME_CLIENT con
 * role=super_admin sigue pudiendo ser tenant-wide dentro de su organización
 * (isGlobal sigue gobernando eso) — lo que nunca puede hacer es pasar esta
 * función.
 *
 * TODAS las decisiones de acceso a Platform Admin (server guards y UI) deben
 * usar esta única función — no duplicar `role === "super_admin" && ...` en
 * distintos archivos.
 */

import { getCapabilities } from "./role-capabilities";
import type { AuthScope } from "@/core/auth/types";

export function canAccessPlatformAdmin(user: {
  role: string;
  auth_scope: AuthScope | undefined;
}): boolean {
  return user.auth_scope === "PLATFORM" && getCapabilities(user.role).isGlobal;
}
