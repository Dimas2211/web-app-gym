// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3B — contexto autorizado de LECTURA del portal del alumno.
//
// Las páginas del portal leían con resolveEffectiveTenantContext: runtime
// correcto, pero sin entitlement comercial, sin rol LIVE y resolviendo el
// Client solo por user_id. Este helper aplica a las lecturas las mismas
// puertas que ya tienen las escrituras (client-portal/actions.ts):
//
//  1. requireOperationalContext(sessionUser, { module }) — runtime efectivo
//     (context.client, nunca el Prisma global en modo runtime) y, si se
//     pide, el módulo comercial (FAIL CLOSED: MODULE_DISABLED).
//  2. Rol LIVE (context.effectiveUser.role) = client. El JWT puede estar
//     desactualizado; el rol vigente manda.
//  3. Client desde sessionUser.id + tenant del contexto (nunca un id del
//     navegador). Filas heredadas con tenant_id NULL solo si su gym_id es
//     el del contexto.
//
// Las páginas reciben un resultado discriminado y muestran un mensaje
// claro sin consultar nada más cuando la puerta se cierra.
// ─────────────────────────────────────────────────────────────────

import type { SessionUser } from "@/lib/permissions/guards";
import {
  requireOperationalContext,
  OperationalContextError,
  type OperationalContext,
} from "@/modules/platform/runtime/require-operational-context";
import {
  hasOrganizationModule,
  resolveCommercialEnforcementContext,
} from "@/modules/platform/runtime/commercial-enforcement";
import { getClientByUserId } from "./queries";

export type PortalClient = NonNullable<Awaited<ReturnType<typeof getClientByUserId>>>;

export type PortalAccessDenied = {
  ok: false;
  reason: "UNAVAILABLE" | "MODULE_DISABLED" | "FORBIDDEN" | "NO_PROFILE";
  message: string;
};

export type PortalAccess =
  | {
      ok: true;
      context: OperationalContext;
      client: PortalClient;
      /** Módulos opcionales consultados (`optionalModules`), ya resueltos. */
      modules: Record<string, boolean>;
      dispose: () => Promise<void>;
    }
  | PortalAccessDenied;

export const PORTAL_NO_PROFILE_MESSAGE = "Tu perfil de cliente aún no está configurado.";
export const PORTAL_FORBIDDEN_MESSAGE = "Tu cuenta no tiene acceso al portal del alumno.";

/** Scope de tenant para resolver el Client propio (tenant del contexto; heredadas NULL solo del mismo gym). */
export function portalClientScope(context: Pick<OperationalContext, "tenantId" | "gymId">) {
  return { tenantId: context.tenantId, gymId: context.gymId };
}

export async function openPortalContext(
  sessionUser: SessionUser,
  options: { module?: string; optionalModules?: string[] } = {}
): Promise<PortalAccess> {
  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: options.module });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return {
        ok: false,
        reason: err.code === "MODULE_DISABLED" ? "MODULE_DISABLED" : "UNAVAILABLE",
        message: err.userMessage,
      };
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (context.effectiveUser.role !== "client") {
      await dispose();
      return { ok: false, reason: "FORBIDDEN", message: PORTAL_FORBIDDEN_MESSAGE };
    }

    const client = await getClientByUserId(sessionUser.id, context.client, portalClientScope(context));
    if (!client) {
      await dispose();
      return { ok: false, reason: "NO_PROFILE", message: PORTAL_NO_PROFILE_MESSAGE };
    }

    const modules: Record<string, boolean> = {};
    if (options.optionalModules?.length) {
      // Fail closed: si el contexto comercial no se puede resolver, las
      // secciones opcionales quedan ocultas (nunca se asumen habilitadas).
      const commercial =
        context.commercialContext ?? (await resolveCommercialEnforcementContext(context.tenantId).catch(() => null));
      for (const code of options.optionalModules) {
        modules[code] = commercial ? hasOrganizationModule(commercial, code) : false;
      }
    }

    return { ok: true, context, client, modules, dispose };
  } catch (err) {
    await dispose();
    throw err;
  }
}
