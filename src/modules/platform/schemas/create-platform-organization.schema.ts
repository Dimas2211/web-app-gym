// ─────────────────────────────────────────────────────────────────
// platform — create-platform-organization.schema.ts
//
// Validación Zod para la creación de una PlatformOrganization.
//
// Reglas de negocio validadas en schema:
//   - code: slug alfanumérico con guiones, único (unicidad en service)
//   - country_code: ISO alpha-2 (2 letras mayúsculas)
//   - timezone: string no vacío si se provee
//
// Unicidad de code se valida en la action/service, no aquí.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;
const ORG_CODE_REGEX     = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createPlatformOrganizationSchema = z.object({
  code: z
    .string({ required_error: "El código de organización es requerido." })
    .min(2, "El código debe tener al menos 2 caracteres.")
    .max(60, "El código no puede superar 60 caracteres.")
    .regex(ORG_CODE_REGEX, "El código solo puede contener letras minúsculas, números y guiones.")
    .trim(),

  name: z
    .string({ required_error: "El nombre es requerido." })
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(200, "El nombre no puede superar 200 caracteres.")
    .trim(),

  legal_name: z.string().max(200).trim().nullable().optional(),
  nit:        z.string().max(30).trim().nullable().optional(),
  tenant_id:  z.string().max(100).trim().nullable().optional(),

  vertical_id: z.string().uuid("ID de vertical inválido.").nullable().optional(),
  plan_id:     z.string().uuid("ID de plan inválido.").nullable().optional(),

  billing_cycle: z
    .enum(["MONTHLY", "ANNUAL", "LIFETIME", "NONE"])
    .default("MONTHLY"),

  country_code: z
    .string()
    .length(2, "El código de país debe tener exactamente 2 letras.")
    .regex(COUNTRY_CODE_REGEX, "El código de país debe ser ISO alpha-2 en mayúsculas (ej: SV, GT).")
    .nullable()
    .optional(),

  timezone: z.string().max(60).trim().nullable().optional(),
  domain:   z.string().max(200).trim().nullable().optional(),
  logo_url: z.string().max(500).trim().nullable().optional(),

  trial_ends_at:      z.coerce.date().nullable().optional(),
  license_expires_at: z.coerce.date().nullable().optional(),
});

export type CreatePlatformOrganizationInput = z.infer<typeof createPlatformOrganizationSchema>;
