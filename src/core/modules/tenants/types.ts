/**
 * Contratos del dominio Tenant.
 *
 * Tenant es la raíz de multi-tenancy de la plataforma, respaldada por
 * el modelo Prisma RuntimeTenant (tabla `runtime_tenants`). Gym es una
 * extensión vertical opcional de un RuntimeTenant, no su raíz.
 *
 * Relación con el sistema actual:
 *   Tenant.id       ←→  RuntimeTenant.id
 *   Tenant.slug     ←→  RuntimeTenant.slug
 *   Tenant.logo_url ←→  RuntimeTenant.gym?.logo_url (null si no hay vertical Gym)
 *
 * queries.ts y schemas.ts están implementados sobre `runtime_tenants`.
 * actions.ts queda pendiente hasta que se necesiten mutaciones de tenant
 * fuera del flujo de provisioning actual.
 */

// ─── Tipo base del tenant ──────────────────────────────────────────────────────

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  status: "active" | "inactive" | "suspended";
  created_at: Date;
  updated_at: Date;
};

// ─── Tipo de creación ──────────────────────────────────────────────────────────

export type CreateTenantInput = {
  name: string;
  slug: string;
  logo_url?: string;
};

// ─── Tipo de actualización ─────────────────────────────────────────────────────

export type UpdateTenantInput = Partial<Omit<CreateTenantInput, "slug">>;

// ─── Estado de implementación ─────────────────────────────────────────────────
// queries.ts  ✓ implementado (read-only, fuente temporal: tabla gyms)
// actions.ts  → pendiente (Fase 3 — requiere tabla tenants en Prisma)
// schemas.ts  ✓ implementado (createTenantSchema, updateTenantSchema)
