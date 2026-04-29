/**
 * Contratos del dominio Location.
 *
 * Location representa una ubicación física dentro de un tenant.
 * En el sistema GYM actual, Location equivale a Branch (tabla `branches`).
 *
 * Relación con el sistema actual:
 *   Location.id        ←→  Branch.id      (columna branch_id en tablas operativas)
 *   Location.tenant_id ←→  Branch.gym_id
 *
 * queries.ts, schemas.ts y actions.ts están implementados sobre la tabla `branches`.
 */

import type { Tenant } from "@/core/modules/tenants/types";

// ─── Tipo base de ubicación ────────────────────────────────────────────────────

export type Location = {
  id: string;
  tenant_id: Tenant["id"];
  name: string;
  address: string | null;
  phone: string | null;
  status: "active" | "inactive";
  created_at: Date;
  updated_at: Date;
};

// ─── Tipo de creación ──────────────────────────────────────────────────────────

export type CreateLocationInput = {
  tenant_id: string;
  name: string;
  address?: string;
  phone?: string;
};

// ─── Tipo de actualización ─────────────────────────────────────────────────────

export type UpdateLocationInput = Partial<Omit<CreateLocationInput, "tenant_id">>;

// ─── Tipo liviano para selects ─────────────────────────────────────────────────

export type LocationOption = Pick<Location, "id" | "name">;

// ─── Estado de implementación ─────────────────────────────────────────────────
// queries.ts  ✓ implementado (read-only, fuente temporal: tabla branches)
// actions.ts  ✓ implementado (createLocation, updateLocation, toggleLocationStatus)
// schemas.ts  ✓ implementado (createLocationSchema, updateLocationSchema)
