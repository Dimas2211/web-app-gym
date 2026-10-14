import { z } from "zod";

export const updateOrganizationLicenseSchema = z
  .object({
  id:                 z.string().uuid(),
  license_status:     z.enum(["TRIAL", "ACTIVE", "SUSPENDED", "EXPIRED", "CANCELLED"]).optional(),
  billing_cycle:      z.enum(["MONTHLY", "ANNUAL", "LIFETIME", "NONE"]).optional(),
  trial_ends_at:      z.coerce.date().nullable().optional(),
  license_expires_at: z.coerce.date().nullable().optional(),
  suspended_at:       z.coerce.date().nullable().optional(),
  suspension_reason:  z.string().max(500).trim().nullable().optional(),
  })
  // RUNTIME LICENSE ENFORCEMENT — trial_ends_at es la fecha autoritativa
  // del trial: toda configuración TRIAL nueva/actualizada debe definirla.
  // (Registros legacy TRIAL sin fecha siguen permitidos por la política.)
  .refine((data) => data.license_status !== "TRIAL" || !!data.trial_ends_at, {
    path:    ["trial_ends_at"],
    message: "La fecha de fin del trial es obligatoria para una licencia Trial.",
  });

export type UpdateOrganizationLicenseInput = z.infer<typeof updateOrganizationLicenseSchema>;
