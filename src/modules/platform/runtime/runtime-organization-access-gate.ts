// ─────────────────────────────────────────────────────────────────
// platform/runtime — runtime-organization-access-gate.ts
//
// RUNTIME LICENSE ENFORCEMENT — gate de UX para superficies
// renderizadas (layouts de dashboard/portal, getSessionOrRedirect()).
//
// La barrera de seguridad autoritativa sigue siendo
// requireRuntimeOrganizationContext(): todo Route Handler / Server
// Action / página que resuelve contexto runtime falla cerrado allí si
// la licencia está bloqueada. Este gate existe para que una licencia
// bloqueada NO termine en un error 500 sino en una redirección limpia a
// /access-restricted, ANTES de que la página intente resolver contexto.
//
// Ambos aplican la MISMA política central (organization-access-policy.ts)
// sobre datos leídos en vivo de Control Plane — nunca del JWT.
//
// Solo afecta auth_scope="RUNTIME_CLIENT". PLATFORM (nativo o Support
// Session) nunca se bloquea aquí: soporte debe poder seguir entrando.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[runtime-organization-access-gate] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { cache } from "react";
import { redirect } from "next/navigation";
import { controlPlanePrisma } from "./control-plane-prisma";
import {
  evaluateOrganizationAccess,
  getOrganizationAccessWarningMessage,
  type OrganizationAccessDecision,
} from "./organization-access-policy";

export const ACCESS_RESTRICTED_PATH = "/access-restricted";

/**
 * Decisión de acceso live para una organización. Memoizada por request
 * (React cache) — layout + página + guards comparten una sola query.
 * null si la organización no existe (el contrato runtime fail closed se
 * encarga de ese caso con su propio error).
 */
export const resolveRuntimeOrganizationAccess = cache(
  async (organizationId: string): Promise<OrganizationAccessDecision | null> => {
    const org = await controlPlanePrisma.platformOrganization.findUnique({
      where: { id: organizationId },
      select: {
        status: true,
        license_status: true,
        billing_cycle: true,
        trial_ends_at: true,
        license_expires_at: true,
        timezone: true,
      },
    });
    if (!org) return null;
    const decision = evaluateOrganizationAccess(org, new Date());
    const warning = getOrganizationAccessWarningMessage(decision);
    if (warning) console.warn(warning);
    return decision;
  },
);

/**
 * Redirige a /access-restricted si `user` es RUNTIME_CLIENT y su
 * organización está bloqueada (técnica o comercialmente). No-op para
 * cualquier otro auth_scope.
 */
export async function enforceRuntimeOrganizationAccess(user: {
  auth_scope?: string;
  organization_id?: string;
}): Promise<void> {
  if (user.auth_scope !== "RUNTIME_CLIENT") return;
  // Identidad RUNTIME_CLIENT sin organization_id es inválida — la
  // rechaza requireRuntimeOrganizationContext (MISSING_ORGANIZATION_ID).
  if (!user.organization_id) return;

  const decision = await resolveRuntimeOrganizationAccess(user.organization_id);
  if (decision && !decision.allowed) redirect(ACCESS_RESTRICTED_PATH);
}
