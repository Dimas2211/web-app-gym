import { z } from "zod";

// Bloque A — un módulo incluido en el plan (checkbox marcado en la UI).
const planModuleInputSchema = z.object({
  module_id:  z.string().min(1),
  is_enabled: z.boolean().default(true),
});

// Bloque A — valor configurado para un entitlement del catálogo.
// is_unlimited=true → numeric_value se ignora (se guarda null).
// is_unlimited=false → numeric_value requerido para value_type COUNT.
const planEntitlementInputSchema = z.object({
  entitlement_definition_id: z.string().min(1),
  numeric_value:              z.coerce.number().int().min(0).nullable().optional(),
  is_unlimited:                z.boolean().default(false),
}).refine((v) => v.is_unlimited || v.numeric_value !== null && v.numeric_value !== undefined, {
  message: "Debe indicar un valor numérico o marcar como ilimitado.",
  path: ["numeric_value"],
});

export const createPlatformPlanSchema = z.object({
  code:          z.string().min(2).max(60).trim().toLowerCase(),
  name:          z.string().min(2).max(200).trim(),
  description:   z.string().max(500).trim().nullable().optional(),
  billing_cycle: z.enum(["MONTHLY", "ANNUAL", "LIFETIME", "NONE"]).default("MONTHLY"),
  price_monthly: z.coerce.number().min(0).nullable().optional(),
  price_annual:  z.coerce.number().min(0).nullable().optional(),
  max_locations: z.coerce.number().int().min(1).nullable().optional(),
  max_users:     z.coerce.number().int().min(1).nullable().optional(),
  modules:      z.array(planModuleInputSchema).default([]),
  entitlements: z.array(planEntitlementInputSchema).default([]),
});

export type CreatePlatformPlanInput = z.infer<typeof createPlatformPlanSchema>;
