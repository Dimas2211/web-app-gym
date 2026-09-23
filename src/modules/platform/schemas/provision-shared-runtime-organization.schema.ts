// ─────────────────────────────────────────────────────────────────
// platform/schemas — provision-shared-runtime-organization.schema.ts
//
// SHARED-PILOT-4A / Gap A. Input Zod para
// provisionSharedRuntimeOrganizationAction. No recibe UUIDs de tenant,
// gym, location ni profile desde el browser — esos se resuelven o
// crean server-side.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";
import { passwordSchema } from "@/core/modules/users/schemas";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const slugSchema = z
  .string()
  .trim()
  .min(2, "Mínimo 2 caracteres")
  .max(60, "Máximo 60 caracteres")
  .regex(SLUG_PATTERN, "Solo minúsculas, números y guiones (ej: cliente-demo)");

const provisionAdminSchema = z.object({
  email:      z.string().trim().toLowerCase().email("Correo electrónico inválido"),
  password:   passwordSchema,
  first_name: z.string().trim().min(2, "Mínimo 2 caracteres").max(50, "Máximo 50 caracteres"),
  last_name:  z.string().trim().min(2, "Mínimo 2 caracteres").max(50, "Máximo 50 caracteres"),
});

const baseProvisionSchema = z.object({
  organizationId: z.string().uuid("organizationId debe ser un UUID válido."),
  tenantName:     z.string().trim().min(2, "Mínimo 2 caracteres").max(120, "Máximo 120 caracteres"),
  tenantSlug:     slugSchema,
  locationName:   z.string().trim().min(2, "Mínimo 2 caracteres").max(120, "Máximo 120 caracteres"),
  admin:          provisionAdminSchema,
});

export const provisionSharedRuntimeOrganizationSchema = z.discriminatedUnion("mode", [
  baseProvisionSchema.extend({ mode: z.literal("COMMERCE_ONLY") }),
  baseProvisionSchema.extend({
    mode:    z.literal("GYM"),
    gymName: z.string().trim().min(2, "Mínimo 2 caracteres").max(120, "Máximo 120 caracteres"),
    gymSlug: slugSchema,
  }),
]);

export type ProvisionSharedRuntimeOrganizationInput = z.infer<
  typeof provisionSharedRuntimeOrganizationSchema
>;
