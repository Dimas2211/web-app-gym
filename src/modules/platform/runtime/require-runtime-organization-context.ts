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
// ETAPA Z (VI-C) — deuda documentada explícitamente:
// Esta función SÍ revalida organization/perfil "en vivo" (Control
// Plane) en cada llamada — eso evita que una organización eliminada o
// un perfil desactivado/rotado queden "colados" por un JWT viejo.
// Lo que NO revalidaba en VI-C es el propio `role`/`status` del usuario
// runtime dentro de su base — eso permanecía congelado en el JWT hasta
// que se implementara revalidación por request.
//
// FASE VI-D — ETAPA T: implementado. Tras abrir el PrismaClient runtime
// se revalida en vivo `runtimeDb.user.findUnique(id)`: debe existir,
// status debe ser "active", y su gym_id (columna física de tenant_id en
// el modelo User) debe coincidir con el tenant efectivo ya validado
// contra Control Plane. Cualquier fallo aquí es FAIL CLOSED igual que
// el resto de este contrato — nunca se ignora un usuario desactivado o
// con tenant desalineado solo porque el JWT todavía lo permite (JWT
// vive hasta 8h). El PrismaClient runtime se desconecta antes de
// propagar el error para no dejar conexiones abiertas.
//
// Lo que esta revalidación NO hace todavía (deuda explícita que
// permanece): no recalcula `role` efectivo para autorización — eso
// sigue viniendo del JWT. Si el rol cambió en runtimeDb, la sesión
// seguirá autorizando según el rol del JWT hasta su expiración/renovación;
// solo el estado activo/inactivo y el tenant se revalidan en vivo aquí.
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
  | "RUNTIME_PROFILE_UNAVAILABLE"
  | "RUNTIME_USER_NOT_FOUND"
  | "RUNTIME_USER_INACTIVE"
  | "RUNTIME_USER_TENANT_MISMATCH"
  | "RUNTIME_LOCATION_INVALID";

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
  /**
   * FASE VI-D2 — ETAPA A. Rol LIVE del usuario runtime, leído de
   * runtimeDb en esta misma llamada — nunca el rol congelado en el JWT
   * (hasta 8h de antigüedad). Los entry points operativos deben usar
   * ESTE valor para autorización, no `sessionUser.role`.
   */
  role: string;
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
  user: Pick<CoreSessionUser, "id" | "auth_scope" | "organization_id" | "tenant_id" | "location_id">,
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

  let runtimeDb: PrismaClient;
  let disconnect: () => Promise<void>;
  try {
    const profile = await resolveRuntimeDatabaseProfileForOrganization(organization.id);
    ({ client: runtimeDb, disconnect } = createRuntimePrismaClient(profile));
  } catch (err) {
    if (err instanceof RuntimeDatabaseRouterError) {
      throw new RuntimeIdentityError(
        "RUNTIME_PROFILE_UNAVAILABLE",
        `No se pudo resolver un perfil runtime usable para ${organization.id}: ${err.code}`,
      );
    }
    throw err;
  }

  // ETAPA T — revalidación live del usuario runtime dentro de SU PROPIA
  // base (no del JWT, que puede tener hasta 8h de antigüedad). Cualquier
  // fallo aquí desconecta el PrismaClient runtime recién abierto antes
  // de propagar — nunca se deja una conexión huérfana.
  let liveRole: string;
  try {
    const liveUser = await runtimeDb.user.findUnique({
      where: { id: user.id },
      select: { status: true, gym_id: true, role: true },
    });

    if (!liveUser) {
      throw new RuntimeIdentityError(
        "RUNTIME_USER_NOT_FOUND",
        `Usuario ${user.id} no existe en la base runtime de ${organization.id}.`,
      );
    }
    if (liveUser.status !== "active") {
      throw new RuntimeIdentityError(
        "RUNTIME_USER_INACTIVE",
        `Usuario ${user.id} no está activo (status=${liveUser.status}) en la base runtime.`,
      );
    }
    if (liveUser.gym_id !== organization.tenant_id) {
      throw new RuntimeIdentityError(
        "RUNTIME_USER_TENANT_MISMATCH",
        `Usuario ${user.id} pertenece a un tenant runtime distinto del efectivo.`,
      );
    }
    liveRole = liveUser.role;

    // FASE VI-D3 — ETAPA E: revalidación live de location. `location_id`
    // null es una identidad tenant-wide legítima (mismo significado que
    // hoy tiene para PLATFORM_NATIVE super_admin) — no se valida nada en
    // ese caso, nunca se "inventa" una branch. Cuando SÍ viene informado
    // (branch_admin/reception/trainer con branch fija en el JWT), debe
    // existir, pertenecer al tenant efectivo y estar activa — el JWT
    // puede tener hasta 8h de antigüedad y la branch pudo desactivarse,
    // eliminarse o reasignarse a otro tenant desde entonces.
    if (user.location_id) {
      const branch = await runtimeDb.branch.findFirst({
        where: { id: user.location_id, gym_id: organization.tenant_id, status: "active" },
        select: { id: true },
      });
      if (!branch) {
        throw new RuntimeIdentityError(
          "RUNTIME_LOCATION_INVALID",
          `Location ${user.location_id} no existe, no pertenece al tenant efectivo, o no está activa.`,
        );
      }
    }
  } catch (err) {
    await disconnect();
    throw err;
  }

  return {
    context: {
      organization: { id: organization.id, name: organization.name, tenantId: organization.tenant_id },
      tenantId: organization.tenant_id,
      locationId: user.location_id,
      runtimeDb,
      authScope: "RUNTIME_CLIENT",
      role: liveRole,
    },
    dispose: disconnect,
  };
}
