import { z } from "zod";

// Bloque A — mismas piezas que create-platform-plan.schema.ts.
const planModuleInputSchema = z.object({
  module_id:  z.string().min(1),
  is_enabled: z.boolean().default(true),
});

const planEntitlementInputSchema = z.object({
  entitlement_definition_id: z.string().min(1),
  numeric_value:              z.coerce.number().int().min(0).nullable().optional(),
  is_unlimited:                z.boolean().default(false),
}).refine((v) => v.is_unlimited || v.numeric_value !== null && v.numeric_value !== undefined, {
  message: "Debe indicar un valor numérico o marcar como ilimitado.",
  path: ["numeric_value"],
});

export const updatePlatformPlanSchema = z.object({
  id:            z.string().uuid(),
  name:          z.string().min(2).max(200).trim().optional(),
  description:   z.string().max(500).trim().nullable().optional(),
  billing_cycle: z.enum(["MONTHLY", "ANNUAL", "LIFETIME", "NONE"]).optional(),
  price_monthly: z.coerce.number().min(0).nullable().optional(),
  price_annual:  z.coerce.number().min(0).nullable().optional(),
  max_locations: z.coerce.number().int().min(1).nullable().optional(),
  max_users:     z.coerce.number().int().min(1).nullable().optional(),
  modules:      z.array(planModuleInputSchema).default([]),
  entitlements: z.array(planEntitlementInputSchema).default([]),
});

export type UpdatePlatformPlanInput = z.infer<typeof updatePlatformPlanSchema>;
