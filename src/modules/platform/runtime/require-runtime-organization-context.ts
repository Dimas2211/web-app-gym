// ─────────────────────────────────────────────────────────────────
// platform/runtime — require-runtime-organization-context.ts
//
// FASE VI-C — ETAPA P/Q. Contrato central para que módulos futuros
// (VI-D/VI-E en adelante) resuelvan el contexto runtime real de una
// identidad auth_scope="RUNTIME_CLIENT". NO se migra ningún módulo
// operativo a esto en VI-C — se define y certifica el contrato.
//
// Diferencia con Support Session (runtime-session.ts /
// effective-tenant-context.ts):
// - Support Session es "un super_admin de PLATFORM opera temporalmente
//   como si fuera un cliente" — identidad real sigue siendo el
//   super_admin, cookie explícita, siempre readOnly.
// - Este helper es "la identidad YA ES un usuario runtime real de un
//   cliente" (login runtime, FASE VI-C) — no hay cookie de soporte, no
//   hay degradación a modo normal: cualquier problema de resolución
//   es FAIL CLOSED (nunca fallback a Control Plane / Prisma global).
//
// ETAPA Q — NO FALLBACK PELIGROSO:
// Ante organization ausente, perfil ausente, tenant mismatch o base
// runtime inalcanzable, esta función SIEMPRE lanza — nunca retorna un
// contexto "normal"/global como sustituto.
//
// ETAPA Z — deuda documentada explícitamente:
// Esta función SÍ revalida organization/perfil "en vivo" (Control
// Plane) en cada llamada — eso evita que una organización eliminada o
// un perfil desactivado/rotado queden "colados" por un JWT viejo.
// Lo que NO revalida en VI-C es el propio `role`/`status` del usuario
// runtime dentro de su base — eso permanece congelado en el JWT hasta
// que se implemente revalidación por request (fase posterior). No se
// oculta: es una limitación conocida, no un bug.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[require-runtime-organization-context] Módulo server-only. No usar en contexto de navegador.",
  );
}

import type { PrismaClient, PlatformOrganizationStatus } from "@prisma/client";
import { controlPlanePrisma } from "./control-plane-prisma";
import {
  resolveRuntimeDatabaseProfileForOrganization,
  createRuntimePrismaClient,
} from "./runtime-database-router";
import { RuntimeDatabaseRouterError } from "./runtime-database-router.errors";
import { canOrganizationAuthenticate } from "./resolve-organization-by-hostname";
import type { CoreSessionUser } from "@/core/auth/types";

export type RuntimeIdentityErrorCode =
  | "NOT_RUNTIME_SCOPE"
  | "MISSING_ORGANIZATION_ID"
  | "ORGANIZATION_NOT_FOUND"
  | "ORGANIZATION_NOT_ELIGIBLE"
  | "ORGANIZATION_WITHOUT_TENANT"
  | "TENANT_MISMATCH"
  | "RUNTIME_PROFILE_UNAVAILABLE";

export class RuntimeIdentityError extends Error {
  readonly code: RuntimeIdentityErrorCode;

  constructor(code: RuntimeIdentityErrorCode, message: string) {
    super(message);
    this.name = "RuntimeIdentityError";
    this.code = code;
  }
}

export interface RuntimeOrganizationContext {
  organization: { id: string; name: string; tenantId: string };
  tenantId: string;
  locationId: string | null;
  runtimeDb: PrismaClient;
  authScope: "RUNTIME_CLIENT";
}

export interface RuntimeOrganizationContextHandle {
  context: RuntimeOrganizationContext;
  /** SIEMPRE debe invocarse (`finally`) — cierra el PrismaClient runtime abierto. */
  dispose: () => Promise<void>;
}

/** Forma mínima inyectable del Control Plane — facilita tests. */
export interface OrganizationContextLookupClient {
  platformOrganization: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true; name: true; tenant_id: true; status: true };
    }) => Promise<{
      id: string;
      name: string;
      tenant_id: string | null;
      status: PlatformOrganizationStatus;
    } | null>;
  };
}

/**
 * Resuelve el contexto runtime real para una identidad
 * auth_scope="RUNTIME_CLIENT". Lanza RuntimeIdentityError (fail
 * closed) ante cualquier condición inválida — nunca degrada a un
 * contexto global/Control Plane.
 *
 * `client` es inyectable solo para tests; en producción siempre usa
 * controlPlanePrisma.
 */
export async function requireRuntimeOrganizationContext(
  user: Pick<CoreSessionUser, "auth_scope" | "organization_id" | "tenant_id" | "location_id">,
  client: OrganizationContextLookupClient = controlPlanePrisma as unknown as OrganizationContextLookupClient,
): Promise<RuntimeOrganizationContextHandle> {
  if (user.auth_scope !== "RUNTIME_CLIENT") {
    throw new RuntimeIdentityError(
      "NOT_RUNTIME_SCOPE",
      "requireRuntimeOrganizationContext() solo aplica a auth_scope=RUNTIME_CLIENT.",
    );
  }

  if (!user.organization_id) {
    throw new RuntimeIdentityError(
      "MISSING_ORGANIZATION_ID",
      "Identidad RUNTIME_CLIENT sin organization_id — identidad runtime inválida.",
    );
  }

  const organization = await client.platformOrganization.findUnique({
    where: { id: user.organization_id },
    select: { id: true, name: true, tenant_id: true, status: true },
  });

  if (!organization) {
    throw new RuntimeIdentityError(
      "ORGANIZATION_NOT_FOUND",
      `Organización ${user.organization_id} no existe en Control Plane.`,
    );
  }

  if (!organization.tenant_id) {
    throw new RuntimeIdentityError(
      "ORGANIZATION_WITHOUT_TENANT",
      `Organización ${organization.id} sin tenant_id (Tenant Binding pendiente).`,
    );
  }

  if (!canOrganizationAuthenticate(organization)) {
    throw new RuntimeIdentityError(
      "ORGANIZATION_NOT_ELIGIBLE",
      `Organización ${organization.id} no está en condiciones de autenticar (status=${organization.status}).`,
    );
  }

  // CRÍTICO — el tenant de la sesión (congelado en el JWT desde el
  // login) debe seguir coincidiendo con el tenant real de la
  // organización resuelta en vivo. Un desalineamiento aquí (ej.
  // Tenant Binding cambiado después del login) es fail closed.
  if (user.tenant_id !== organization.tenant_id) {
    throw new RuntimeIdentityError(
      "TENANT_MISMATCH",
      `tenant_id de sesión (${user.tenant_id}) no coincide con organization.tenant_id (${organization.tenant_id}).`,
    );
  }

  try {
    const profile = await resolveRuntimeDatabaseProfileForOrganization(organization.id);
    const { client: runtimeDb, disconnect } = createRuntimePrismaClient(profile);

    return {
      context: {
        organization: { id: organization.id, name: organization.name, tenantId: organization.tenant_id },
        tenantId: organization.tenant_id,
        locationId: user.location_id,
        runtimeDb,
        authScope: "RUNTIME_CLIENT",
      },
      dispose: disconnect,
    };
  } catch (err) {
    if (err instanceof RuntimeDatabaseRouterError) {
      throw new RuntimeIdentityError(
        "RUNTIME_PROFILE_UNAVAILABLE",
        `No se pudo resolver un perfil runtime usable para ${organization.id}: ${err.code}`,
      );
    }
    throw err;
  }
}
