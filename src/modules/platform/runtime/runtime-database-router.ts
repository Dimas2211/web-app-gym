// ─────────────────────────────────────────────────────────────────
// platform/runtime — runtime-database-router.ts
//
// Runtime Database Router — PASO 2 de la Plataforma Multiindustria.
//
// Resuelve dinámicamente a qué base CLIENTE (no plataforma) debe
// conectarse una operación runtime, a partir de una organización o
// un perfil explícito, y ejecuta callbacks contra un PrismaClient
// temporal apuntando a esa base.
//
// Separación estricta:
// - CONTROL PLANE  → controlPlanePrisma (./control-plane-prisma).
//   Solo PlatformOrganization/PlatformDatabaseProfile/PlatformDeploymentLog.
// - CLIENT RUNTIME → SOLO a través de withRuntimePrisma /
//   withOrganizationRuntimePrisma. Nunca importar el Prisma global
//   de src/lib/db/prisma.ts para leer/escribir datos de un cliente.
//
// Reglas de seguridad:
// - Server-only (throw si se importa en browser).
// - Nunca loguea encrypted_password, DATABASE_URL ni la URL construida.
// - Cada PrismaClient runtime se desconecta siempre en `finally`
//   (mismo patrón que withTemporaryPrismaClient).
// - No cachea PrismaClient todavía (ver TODO de caché abajo) — prioriza
//   estabilidad/seguridad sobre optimización prematura en este paso.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[runtime-database-router] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { PrismaClient } from "@prisma/client";
import { controlPlanePrisma } from "./control-plane-prisma";
import { withTemporaryPrismaClient } from "../lib/client-prisma";
import {
  buildDatabaseUrlFromProfile,
  sanitizeDatabaseError,
} from "../lib/database-profile-url";
import { assertEncryptionAvailable } from "@/lib/security/encryption";
import {
  OrganizationNotFoundError,
  OrganizationWithoutTenantError,
  ActiveProfileNotFoundError,
  ProfileNotFoundError,
  ProfileInactiveError,
  ProfileConnectionInvalidError,
  RuntimeDatabaseUnreachableError,
} from "./runtime-database-router.errors";
import type {
  RuntimeDatabaseProfile,
  RuntimeTarget,
} from "./runtime-database-router.types";

// ── Selección de perfil activo cuando hay varios ─────────────────
// Un mismo organization_id puede tener varios perfiles is_active=true
// (uno por environment: LOCAL/SANDBOX/TEST/STAGING/PRODUCTION). Sin una
// columna explícita de "perfil activo único", el desempate determinista
// prioriza el entorno más productivo.
const ENVIRONMENT_PRIORITY: Record<string, number> = {
  PRODUCTION: 0,
  STAGING:    1,
  SANDBOX:    2,
  TEST:       3,
  LOCAL:      4,
};

const PROFILE_SELECT = {
  id:                 true,
  label:              true,
  environment:        true,
  provider:           true,
  db_host:            true,
  db_port:            true,
  db_name:            true,
  db_user:            true,
  encrypted_password: true,
  ssl_mode:           true,
  is_active:          true,
  updated_at:         true,
} as const;

function toRuntimeProfile(
  row: {
    id: string; label: string; environment: string; provider: string;
    db_host: string; db_port: number | null; db_name: string; db_user: string;
    encrypted_password: string; ssl_mode: string; updated_at: Date;
  },
  organizationId: string,
  organizationName: string,
  tenantId: string,
): RuntimeDatabaseProfile {
  return {
    id:               row.id,
    label:            row.label,
    environment:      row.environment as RuntimeDatabaseProfile["environment"],
    provider:         row.provider as RuntimeDatabaseProfile["provider"],
    organizationId,
    organizationName,
    tenantId,
    updatedAt:        row.updated_at,
    _connection: {
      db_host:            row.db_host,
      db_port:            row.db_port,
      db_name:            row.db_name,
      db_user:            row.db_user,
      encrypted_password: row.encrypted_password,
      ssl_mode:           row.ssl_mode,
    },
  };
}

async function fetchOrganizationWithTenant(organizationId: string) {
  const organization = await controlPlanePrisma.platformOrganization.findUnique({
    where:  { id: organizationId },
    select: { id: true, name: true, tenant_id: true },
  });

  if (!organization) throw new OrganizationNotFoundError(organizationId);
  if (!organization.tenant_id) throw new OrganizationWithoutTenantError(organizationId);

  return organization as { id: string; name: string; tenant_id: string };
}

/**
 * Resuelve el perfil runtime activo de una organización (control plane).
 * No abre conexión a la base cliente — solo lee metadata + credenciales
 * cifradas del control plane.
 */
export async function resolveRuntimeDatabaseProfileForOrganization(
  organizationId: string,
): Promise<RuntimeDatabaseProfile> {
  const organization = await fetchOrganizationWithTenant(organizationId);

  const candidates = await controlPlanePrisma.platformDatabaseProfile.findMany({
    where:  { organization_id: organizationId, is_active: true },
    select: PROFILE_SELECT,
  });

  if (candidates.length === 0) throw new ActiveProfileNotFoundError(organizationId);

  const [chosen] = [...candidates].sort(
    (a, b) =>
      (ENVIRONMENT_PRIORITY[a.environment] ?? 99) -
      (ENVIRONMENT_PRIORITY[b.environment] ?? 99),
  );

  return toRuntimeProfile(chosen, organization.id, organization.name, organization.tenant_id);
}

/**
 * Resuelve el perfil runtime activo a partir de un tenant_id (gym.id
 * vinculado en organization.tenant_id vía Tenant Binding).
 */
export async function resolveActiveRuntimeDatabaseProfileForTenant(
  tenantId: string,
): Promise<RuntimeDatabaseProfile> {
  const organization = await controlPlanePrisma.platformOrganization.findUnique({
    where:  { tenant_id: tenantId },
    select: { id: true },
  });

  if (!organization) {
    throw new OrganizationNotFoundError(`tenant_id:${tenantId}`);
  }

  return resolveRuntimeDatabaseProfileForOrganization(organization.id);
}

/** Resuelve un perfil runtime por profileId explícito. Exige is_active=true. */
export async function resolveRuntimeDatabaseProfileById(
  profileId: string,
): Promise<RuntimeDatabaseProfile> {
  const row = await controlPlanePrisma.platformDatabaseProfile.findUnique({
    where:  { id: profileId },
    select: {
      ...PROFILE_SELECT,
      organization: { select: { id: true, name: true, tenant_id: true } },
    },
  });

  if (!row) throw new ProfileNotFoundError(profileId);
  if (!row.is_active) throw new ProfileInactiveError(profileId);
  if (!row.organization.tenant_id) {
    throw new OrganizationWithoutTenantError(row.organization.id);
  }

  return toRuntimeProfile(
    row,
    row.organization.id,
    row.organization.name,
    row.organization.tenant_id,
  );
}

async function resolveTarget(target: RuntimeTarget): Promise<RuntimeDatabaseProfile> {
  if ("profileId" in target && target.profileId) {
    return resolveRuntimeDatabaseProfileById(target.profileId);
  }
  if ("organizationId" in target && target.organizationId) {
    return resolveRuntimeDatabaseProfileForOrganization(target.organizationId);
  }
  throw new ProfileConnectionInvalidError(
    "unknown",
    "RuntimeTarget inválido: debe incluir organizationId o profileId.",
  );
}

/**
 * Construye la DATABASE_URL en memoria para un perfil ya resuelto.
 * Nunca loguear el resultado — contiene el password descifrado.
 */
export function getRuntimeDatabaseUrlFromProfile(profile: RuntimeDatabaseProfile): string {
  try {
    assertEncryptionAvailable();
    return buildDatabaseUrlFromProfile(profile._connection);
  } catch (err) {
    throw new ProfileConnectionInvalidError(profile.id, sanitizeDatabaseError(err));
  }
}

/**
 * Crea un PrismaClient runtime temporal apuntando a la base del perfil.
 * El caller es responsable de `$disconnect()` — usar preferentemente
 * `withRuntimePrisma` / `withOrganizationRuntimePrisma`, que lo garantizan.
 *
 * TODO(perf, futuro): si al migrar módulos operativos (Commerce/DTE) el
 * costo de abrir/cerrar PrismaClient por request resulta significativo,
 * evaluar una caché server-only de PrismaClient runtime keyeada por
 * `profileId:updatedAt.getTime()`, con invalidación explícita al
 * actualizar/desactivar un perfil (update-database-profile.action.ts,
 * set-database-profile-active.action.ts). No implementado en este paso
 * para priorizar seguridad/estabilidad sobre optimización prematura.
 */
export function createRuntimePrismaClient(profile: RuntimeDatabaseProfile): {
  client: PrismaClient;
  disconnect: () => Promise<void>;
} {
  const databaseUrl = getRuntimeDatabaseUrlFromProfile(profile);
  // Caso de escape para callers que no pueden usar withRuntimePrisma
  // (p.ej. necesitan mantener el client vivo entre varias llamadas).
  // Preferir siempre withRuntimePrisma/withOrganizationRuntimePrisma.
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [],
  });
  return { client, disconnect: () => client.$disconnect() };
}

/**
 * Ejecuta `callback` con un PrismaClient runtime resuelto por
 * organizationId o profileId. Garantiza `$disconnect()` en `finally`.
 * Envuelve errores de conexión como RuntimeDatabaseUnreachableError.
 */
export async function withRuntimePrisma<T>(
  target: RuntimeTarget,
  callback: (client: PrismaClient, profile: RuntimeDatabaseProfile) => Promise<T>,
): Promise<T> {
  const profile = await resolveTarget(target);
  const databaseUrl = getRuntimeDatabaseUrlFromProfile(profile);

  try {
    return await withTemporaryPrismaClient(databaseUrl, (client) => callback(client, profile));
  } catch (err) {
    // withTemporaryPrismaClient ya desconectó en su finally; solo re-tipamos el error.
    throw new RuntimeDatabaseUnreachableError(profile.id, sanitizeDatabaseError(err));
  }
}

/** Azúcar sintáctico: resuelve siempre por organizationId. */
export async function withOrganizationRuntimePrisma<T>(
  organizationId: string,
  callback: (client: PrismaClient, profile: RuntimeDatabaseProfile) => Promise<T>,
): Promise<T> {
  return withRuntimePrisma({ organizationId }, callback);
}

export type { RuntimeDatabaseProfile, RuntimeTarget } from "./runtime-database-router.types";
export {
  RuntimeDatabaseRouterError,
  OrganizationNotFoundError,
  OrganizationWithoutTenantError,
  ActiveProfileNotFoundError,
  ProfileNotFoundError,
  ProfileInactiveError,
  ProfileConnectionInvalidError,
  RuntimeDatabaseUnreachableError,
} from "./runtime-database-router.errors";
