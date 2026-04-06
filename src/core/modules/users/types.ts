/**
 * Contratos del dominio User core.
 *
 * ESTADO: Esqueleto. Sin implementar.
 *
 * User core representa cuentas de acceso cross-industry (staff y acceso).
 * Difiere del módulo GYM actual (src/modules/users/) en que:
 *   - No asume la existencia de Trainer ni ningún perfil GYM-específico.
 *   - Usa tenant_id y location_id en lugar de gym_id y branch_id.
 *   - El campo `role` es string genérico, no el enum UserRole de Prisma.
 *
 * Relación con el sistema actual:
 *   CoreUser.id          ←→  User.id
 *   CoreUser.tenant_id   ←→  User.gym_id
 *   CoreUser.location_id ←→  User.branch_id
 *   CoreUser.role        ←→  User.role (con conversión)
 *
 * IMPORTANTE: Este módulo NO debe reemplazar src/modules/users/ hasta que
 * la migración Tenant esté completa (Fase 4 del roadmap).
 */

import type { Tenant } from "@/core/modules/tenants/types";
import type { Location } from "@/core/modules/locations/types";

// ─── Tipo base cross-industry ──────────────────────────────────────────────────

export type CoreUser = {
  id: string;
  tenant_id: Tenant["id"];
  location_id: Location["id"] | null;
  email: string;
  first_name: string;
  last_name: string;
  role: string;               // string genérico; cada industria narra con su enum
  status: "active" | "inactive" | "suspended";
  avatar_url: string | null;
  created_at: Date;
  updated_at: Date;
};

// ─── Tipos de operación ────────────────────────────────────────────────────────

export type CreateUserInput = {
  tenant_id: string;
  location_id?: string | null;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  password: string;
};

export type UpdateUserInput = Partial<
  Omit<CreateUserInput, "tenant_id" | "password"> & { password?: string }
>;

// ─── Tipo liviano para referencias ────────────────────────────────────────────

export type UserSummary = Pick<CoreUser, "id" | "first_name" | "last_name" | "email" | "role">;

// ─── Estado de implementación ─────────────────────────────────────────────────
// queries.ts  ✓ implementado (read-only, fuente temporal: tabla users)
// actions.ts  ✓ implementado (createCoreUser, updateCoreUser, toggleCoreUserStatus — deleteUser queda en wrapper GYM)
// schemas.ts  ✓ implementado (createCoreUserSchema, updateCoreUserSchema, passwordSchema)
