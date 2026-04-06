/**
 * Contratos del dominio Tenant.
 *
 * ESTADO: Esqueleto. Sin implementar.
 *
 * Tenant es la raíz de multi-tenancy de la plataforma.
 * En el sistema GYM actual, Tenant equivale a Gym (tabla `gyms`).
 * En Fase 3 del roadmap, se creará la tabla `tenants` en Prisma
 * y este módulo recibirá su implementación real.
 *
 * Relación con el sistema actual:
 *   Tenant.id  ←→  Gym.id  (gym_id en todas las tablas actuales)
 *   Tenant.slug ←→  Gym.slug
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
