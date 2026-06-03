// ─────────────────────────────────────────────────────────────────
// platform — platform-permissions.constants.ts
//
// Constantes de permisos del dominio Platform.
// Seguir el patrón: "dominio.recurso.accion"
//
// Solo super_admin tiene acceso al dominio platform en el sistema actual.
// Estas constantes se usarán en guards y middleware cuando el módulo
// de permisos granulares sea implementado en una etapa posterior.
// ─────────────────────────────────────────────────────────────────

export const PLATFORM_PERMISSIONS = {
  // ── Organizations ─────────────────────────────────────────────
  ORGANIZATIONS_VIEW:   "platform.organizations.view",
  ORGANIZATIONS_MANAGE: "platform.organizations.manage",

  // ── Modules ───────────────────────────────────────────────────
  MODULES_VIEW:   "platform.modules.view",
  MODULES_MANAGE: "platform.modules.manage",

  // ── Plans ─────────────────────────────────────────────────────
  PLANS_VIEW:   "platform.plans.view",
  PLANS_MANAGE: "platform.plans.manage",

  // ── Branding ──────────────────────────────────────────────────
  BRANDING_VIEW:   "platform.branding.view",
  BRANDING_MANAGE: "platform.branding.manage",

  // ── Deployments ───────────────────────────────────────────────
  DEPLOYMENTS_VIEW:   "platform.deployments.view",
  DEPLOYMENTS_MANAGE: "platform.deployments.manage",
} as const;

export type PlatformPermission =
  (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

// Todos los permisos de lectura de platform
export const PLATFORM_READ_PERMISSIONS: PlatformPermission[] = [
  PLATFORM_PERMISSIONS.ORGANIZATIONS_VIEW,
  PLATFORM_PERMISSIONS.MODULES_VIEW,
  PLATFORM_PERMISSIONS.PLANS_VIEW,
  PLATFORM_PERMISSIONS.BRANDING_VIEW,
  PLATFORM_PERMISSIONS.DEPLOYMENTS_VIEW,
];

// Todos los permisos de gestión de platform
export const PLATFORM_MANAGE_PERMISSIONS: PlatformPermission[] = [
  PLATFORM_PERMISSIONS.ORGANIZATIONS_MANAGE,
  PLATFORM_PERMISSIONS.MODULES_MANAGE,
  PLATFORM_PERMISSIONS.PLANS_MANAGE,
  PLATFORM_PERMISSIONS.BRANDING_MANAGE,
  PLATFORM_PERMISSIONS.DEPLOYMENTS_MANAGE,
];
