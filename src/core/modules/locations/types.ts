/**
 * Contratos del dominio Location.
 *
 * ESTADO: Esqueleto. Sin implementar.
 *
 * Location representa una ubicación física dentro de un tenant.
 * En el sistema GYM actual, Location equivale a Branch (tabla `branches`).
 * Este módulo recibirá implementación cuando se complete la abstracción Tenant.
 *
 * Relación con el sistema actual:
 *   Location.id        ←→  Branch.id  (branch_id en tablas actuales)
 *   Location.tenant_id ←→  Branch.gym_id
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
