import { z } from "zod";

export const updateOrganizationLicenseSchema = z.object({
  id:                 z.string().uuid(),
  license_status:     z.enum(["TRIAL", "ACTIVE", "SUSPENDED", "EXPIRED", "CANCELLED"]).optional(),
  billing_cycle:      z.enum(["MONTHLY", "ANNUAL", "LIFETIME", "NONE"]).optional(),
  trial_ends_at:      z.coerce.date().nullable().optional(),
  license_expires_at: z.coerce.date().nullable().optional(),
  suspended_at:       z.coerce.date().nullable().optional(),
  suspension_reason:  z.string().max(500).trim().nullable().optional(),
});

export type UpdateOrganizationLicenseInput = z.infer<typeof updateOrganizationLicenseSchema>;
