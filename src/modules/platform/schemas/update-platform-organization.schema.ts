// ─────────────────────────────────────────────────────────────────
// platform — update-platform-organization.schema.ts
//
// Validación Zod para actualizar campos de una PlatformOrganization.
// code no se puede cambiar una vez creado.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;

export const updatePlatformOrganizationSchema = z.object({
  id: z.string().uuid("ID de organización inválido."),

  name:       z.string().min(2).max(200).trim().optional(),
  legal_name: z.string().max(200).trim().nullable().optional(),
  nit:        z.string().max(30).trim().nullable().optional(),
  tenant_id:  z.string().max(100).trim().nullable().optional(),

  vertical_id: z.string().uuid().nullable().optional(),
  plan_id:     z.string().uuid().nullable().optional(),

  billing_cycle: z.enum(["MONTHLY", "ANNUAL", "LIFETIME", "NONE"]).optional(),

  country_code: z
    .string()
    .length(2)
    .regex(COUNTRY_CODE_REGEX, "Debe ser ISO alpha-2 en mayúsculas.")
    .nullable()
    .optional(),

  timezone: z.string().max(60).trim().nullable().optional(),
  domain:   z.string().max(200).trim().nullable().optional(),
  logo_url: z.string().max(500).trim().nullable().optional(),

  deployment_url:      z.string().max(500).trim().nullable().optional(),
  instance_identifier: z.string().max(200).trim().nullable().optional(),

  trial_ends_at:      z.coerce.date().nullable().optional(),
  license_expires_at: z.coerce.date().nullable().optional(),
});

export type UpdatePlatformOrganizationInput = z.infer<typeof updatePlatformOrganizationSchema>;
