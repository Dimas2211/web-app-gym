// ─────────────────────────────────────────────────────────────────
// platform/runtime — runtime-database-router.errors.ts
//
// Errores tipados del Runtime Database Router. Cada uno expone un
// `code` estable para que las actions puedan mapear a mensajes de
// usuario sin depender de `instanceof` en capas UI.
//
// Ninguno de estos errores debe incluir la connection string ni el
// password — solo identificadores (organizationId, profileId, etc.).
// ─────────────────────────────────────────────────────────────────

export type RuntimeDatabaseRouterErrorCode =
  | "ORGANIZATION_NOT_FOUND"
  | "ORGANIZATION_WITHOUT_TENANT"
  | "ACTIVE_PROFILE_NOT_FOUND"
  | "PROFILE_NOT_FOUND"
  | "PROFILE_INACTIVE"
  | "PROFILE_CONNECTION_INVALID"
  | "RUNTIME_DATABASE_UNREACHABLE";

export class RuntimeDatabaseRouterError extends Error {
  readonly code: RuntimeDatabaseRouterErrorCode;

  constructor(code: RuntimeDatabaseRouterErrorCode, message: string) {
    super(message);
    this.name = "RuntimeDatabaseRouterError";
    this.code = code;
  }
}

export class OrganizationNotFoundError extends RuntimeDatabaseRouterError {
  constructor(organizationId: string) {
    super("ORGANIZATION_NOT_FOUND", `Organización no encontrada: ${organizationId}.`);
    this.name = "OrganizationNotFoundError";
  }
}

export class OrganizationWithoutTenantError extends RuntimeDatabaseRouterError {
  constructor(organizationId: string) {
    super(
      "ORGANIZATION_WITHOUT_TENANT",
      `La organización ${organizationId} no tiene tenant_id asignado (Tenant Binding pendiente).`,
    );
    this.name = "OrganizationWithoutTenantError";
  }
}

export class ActiveProfileNotFoundError extends RuntimeDatabaseRouterError {
  constructor(organizationId: string) {
    super(
      "ACTIVE_PROFILE_NOT_FOUND",
      `No hay ningún PlatformDatabaseProfile activo para la organización ${organizationId}.`,
    );
    this.name = "ActiveProfileNotFoundError";
  }
}

export class ProfileNotFoundError extends RuntimeDatabaseRouterError {
  constructor(profileId: string) {
    super("PROFILE_NOT_FOUND", `Perfil de base de datos no encontrado: ${profileId}.`);
    this.name = "ProfileNotFoundError";
  }
}

export class ProfileInactiveError extends RuntimeDatabaseRouterError {
  constructor(profileId: string) {
    super("PROFILE_INACTIVE", `El perfil de base de datos ${profileId} está inactivo.`);
    this.name = "ProfileInactiveError";
  }
}

export class ProfileConnectionInvalidError extends RuntimeDatabaseRouterError {
  constructor(profileId: string, reason: string) {
    super(
      "PROFILE_CONNECTION_INVALID",
      `Conexión inválida para el perfil ${profileId}: ${reason}`,
    );
    this.name = "ProfileConnectionInvalidError";
  }
}

export class RuntimeDatabaseUnreachableError extends RuntimeDatabaseRouterError {
  constructor(profileId: string, reason: string) {
    super(
      "RUNTIME_DATABASE_UNREACHABLE",
      `No se pudo conectar a la base runtime del perfil ${profileId}: ${reason}`,
    );
    this.name = "RuntimeDatabaseUnreachableError";
  }
}
