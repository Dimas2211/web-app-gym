// ─────────────────────────────────────────────────────────────────
// platform — update-platform-branding.schema.ts
//
// Validación para actualizar el branding de una organización.
//
// Reglas:
//   - primary_color y secondary_color deben ser hex válidos (#RRGGBB)
//   - custom_domain: solo hostname, sin protocolo ni trailing slash
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

const HEX_COLOR_REGEX    = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const HOSTNAME_REGEX     = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;

const optionalHexColor = z
  .string()
  .regex(HEX_COLOR_REGEX, "Debe ser un color hex válido (#RGB o #RRGGBB).")
  .nullable()
  .optional();

export const updatePlatformBrandingSchema = z.object({
  organization_id: z.string().uuid("ID de organización inválido."),

  primary_color:   optionalHexColor,
  secondary_color: optionalHexColor,
  logo_url:        z.string().max(500).trim().nullable().optional(),
  favicon_url:     z.string().max(500).trim().nullable().optional(),

  custom_domain: z
    .string()
    .max(200)
    .regex(HOSTNAME_REGEX, "El dominio debe ser un hostname válido sin protocolo (ej: app.miempresa.com).")
    .trim()
    .nullable()
    .optional(),
});

export type UpdatePlatformBrandingInput = z.infer<typeof updatePlatformBrandingSchema>;
