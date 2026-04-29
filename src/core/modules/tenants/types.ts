/**
 * Contratos del dominio Tenant.
 *
 * Tenant es la raíz de multi-tenancy de la plataforma.
 * En el sistema GYM actual, Tenant equivale a Gym (tabla `gyms`).
 *
 * Relación con el sistema actual:
 *   Tenant.id   ←→  Gym.id   (columna gym_id en tablas operativas)
 *   Tenant.slug ←→  Gym.slug
 *
 * queries.ts y schemas.ts están implementados sobre la tabla `gyms`.
 * actions.ts queda pendiente hasta la Fase 4 del roadmap (creación
 * de tabla `tenants` en Prisma como entidad propia).
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
