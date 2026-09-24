// ─────────────────────────────────────────────────────────────────
// platform/runtime — resolve-organization-runtime.ts
//
// SHARED-OPS-PARITY-1. Punto único de resolución para OPERACIONES
// administrativas tenant-scoped de Platform Admin (Data Onboarding,
// "Operar como cliente", baseline Commerce):
//
//   organizationId → PlatformOrganization → tenant_id
//     → Runtime Database Router (Shared o Dedicated) → runtime DB
//
// No es un segundo router: delega SIEMPRE en
// resolveRuntimeDatabaseProfileForOrganization /
// resolveRuntimeDatabaseProfileById. Solo añade:
//   - la metadata SEGURA (sin password/URL) para la UI —
//     OrganizationRuntimeHeader;
//   - el tipo de runtime (SHARED | DEDICATED);
//   - la fijación opcional de un perfil Dedicated concreto (links
//     históricos /data-onboarding/[profileId]), validando que ese perfil
//     pertenece a la MISMA organización y que la organización no es Shared.
//
// Reglas:
// - La identidad operativa es organizationId. Un Shared Runtime Target
//   (1 base física → N organizaciones) jamás identifica un tenant.
// - tenantId sale exclusivamente de PlatformOrganization.tenant_id.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[resolve-organization-runtime] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { controlPlanePrisma } from "./control-plane-prisma";
import {
  resolveRuntimeDatabaseProfileForOrganization,
  resolveRuntimeDatabaseProfileById,
  OrganizationNotFoundError,
  OrganizationWithoutTenantError,
  RuntimeDatabaseRouterError,
  type RuntimeDatabaseProfile,
} from "./runtime-database-router";
import type {
  OrganizationRuntimeHeader,
  OrganizationRuntimeKind,
} from "../types/platform.types";

export type { OrganizationRuntimeHeader, OrganizationRuntimeKind };

export interface ResolvedOrganizationRuntime {
  header:  OrganizationRuntimeHeader;
  /** Para uso server-side exclusivamente (withTemporaryPrismaClient). */
  profile: RuntimeDatabaseProfile;
}

export class OrganizationRuntimeMismatchError extends Error {
  readonly code = "ORGANIZATION_RUNTIME_MISMATCH";
  constructor(message: string) {
    super(message);
    this.name = "OrganizationRuntimeMismatchError";
  }
}

/** true para errores esperables del resolver (mensaje apto para UI, sin secretos). */
export function isOrganizationRuntimeResolutionError(err: unknown): err is Error {
  return err instanceof RuntimeDatabaseRouterError || err instanceof OrganizationRuntimeMismatchError;
}

const SAFE_TARGET_SELECT = {
  id:               true,
  label:            true,
  environment:      true,
  provider:         true,
  db_host:          true,
  db_port:          true,
  db_name:          true,
  db_user:          true,
  ssl_mode:         true,
  is_active:        true,
  last_test_status: true,
  last_tested_at:   true,
} as const;

export async function resolveOrganizationRuntime(input: {
  organizationId?: string | null;
  profileId?:      string | null;
}): Promise<ResolvedOrganizationRuntime> {
  const organizationIdInput = input.organizationId?.trim() || null;
  const profileIdInput      = input.profileId?.trim() || null;

  if (!organizationIdInput && !profileIdInput) {
    throw new OrganizationRuntimeMismatchError("organizationId requerido.");
  }

  let profile: RuntimeDatabaseProfile;
  let organizationId: string;

  if (profileIdInput) {
    // Link histórico Dedicated: el perfil fija QUÉ base Dedicated, pero la
    // organización sigue siendo la identidad operativa.
    profile = await resolveRuntimeDatabaseProfileById(profileIdInput);
    if (organizationIdInput && organizationIdInput !== profile.organizationId) {
      throw new OrganizationRuntimeMismatchError(
        "El perfil de base de datos no pertenece a la organización indicada.",
      );
    }
    organizationId = profile.organizationId;
  } else {
    organizationId = organizationIdInput as string;
    profile = await resolveRuntimeDatabaseProfileForOrganization(organizationId);
  }

  const organization = await controlPlanePrisma.platformOrganization.findUnique({
    where:  { id: organizationId },
    select: { id: true, code: true, name: true, tenant_id: true, shared_runtime_target_id: true },
  });
  if (!organization) throw new OrganizationNotFoundError(organizationId);
  if (!organization.tenant_id) throw new OrganizationWithoutTenantError(organizationId);

  const runtimeKind: OrganizationRuntimeKind = organization.shared_runtime_target_id ? "SHARED" : "DEDICATED";

  if (profileIdInput && runtimeKind === "SHARED") {
    throw new OrganizationRuntimeMismatchError(
      "La organización opera sobre un Shared Runtime; un perfil Dedicated no puede usarse como destino.",
    );
  }

  // Defensa en profundidad: el tenant resuelto por el router DEBE ser el
  // de la organización (fuente única: PlatformOrganization.tenant_id).
  if (profile.tenantId !== organization.tenant_id || profile.organizationId !== organization.id) {
    throw new OrganizationRuntimeMismatchError(
      "El runtime resuelto no corresponde al tenant de la organización.",
    );
  }

  const target = runtimeKind === "SHARED"
    ? await controlPlanePrisma.platformSharedRuntimeTarget.findUnique({
        where:  { id: profile.id },
        select: SAFE_TARGET_SELECT,
      })
    : await controlPlanePrisma.platformDatabaseProfile.findUnique({
        where:  { id: profile.id },
        select: SAFE_TARGET_SELECT,
      });
  if (!target) {
    throw new OrganizationRuntimeMismatchError("No se encontró la metadata del runtime resuelto.");
  }

  return {
    profile,
    header: {
      organizationId:   organization.id,
      organizationCode: organization.code,
      organizationName: organization.name,
      tenantId:         organization.tenant_id,
      runtimeKind,
      runtimeTargetId:  target.id,
      runtimeLabel:     target.label,
      environment:      String(target.environment),
      provider:         String(target.provider),
      db_host:          target.db_host,
      db_port:          target.db_port,
      db_name:          target.db_name,
      db_user:          target.db_user,
      ssl_mode:         String(target.ssl_mode),
      isActive:         target.is_active,
      lastTestStatus:   String(target.last_test_status),
      lastTestedAt:     target.last_tested_at?.toISOString() ?? null,
      pinnedProfileId:  profileIdInput ? profile.id : null,
    },
  };
}
