import { z } from "zod";

export const updatePlatformPlanSchema = z.object({
  id:            z.string().uuid(),
  name:          z.string().min(2).max(200).trim().optional(),
  description:   z.string().max(500).trim().nullable().optional(),
  billing_cycle: z.enum(["MONTHLY", "ANNUAL", "LIFETIME", "NONE"]).optional(),
  price_monthly: z.coerce.number().min(0).nullable().optional(),
  price_annual:  z.coerce.number().min(0).nullable().optional(),
  max_locations: z.coerce.number().int().min(1).nullable().optional(),
  max_users:     z.coerce.number().int().min(1).nullable().optional(),
});

export type UpdatePlatformPlanInput = z.infer<typeof updatePlatformPlanSchema>;
