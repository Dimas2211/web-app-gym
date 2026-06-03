import { z } from "zod";

export const createPlatformPlanSchema = z.object({
  code:          z.string().min(2).max(60).trim().toLowerCase(),
  name:          z.string().min(2).max(200).trim(),
  description:   z.string().max(500).trim().nullable().optional(),
  billing_cycle: z.enum(["MONTHLY", "ANNUAL", "LIFETIME", "NONE"]).default("MONTHLY"),
  price_monthly: z.coerce.number().min(0).nullable().optional(),
  price_annual:  z.coerce.number().min(0).nullable().optional(),
  max_locations: z.coerce.number().int().min(1).nullable().optional(),
  max_users:     z.coerce.number().int().min(1).nullable().optional(),
});

export type CreatePlatformPlanInput = z.infer<typeof createPlatformPlanSchema>;
