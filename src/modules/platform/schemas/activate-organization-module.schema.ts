// ─────────────────────────────────────────────────────────────────
// platform — activate-organization-module.schema.ts
//
// Validación para activar o desactivar un módulo en una organización.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

export const activateOrganizationModuleSchema = z.object({
  organization_id: z.string().uuid("ID de organización inválido."),
  module_id:       z.string().uuid("ID de módulo inválido."),
});

export type ActivateOrganizationModuleInput = z.infer<typeof activateOrganizationModuleSchema>;

export const deactivateOrganizationModuleSchema = z.object({
  organization_id: z.string().uuid("ID de organización inválido."),
  module_id:       z.string().uuid("ID de módulo inválido."),
  reason:          z.string().max(300).trim().nullable().optional(),
});

export type DeactivateOrganizationModuleInput = z.infer<typeof deactivateOrganizationModuleSchema>;
