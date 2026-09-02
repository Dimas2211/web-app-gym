import { z } from "zod";

// Bloque A — establece o limpia el override de un entitlement para una
// organización. clear=true elimina el override (vuelve a heredar el plan).
export const setOrganizationEntitlementOverrideSchema = z.object({
  organization_id:            z.string().min(1),
  entitlement_definition_id:  z.string().min(1),
  clear:                        z.boolean().default(false),
  numeric_value:               z.coerce.number().int().min(0).nullable().optional(),
  is_unlimited:                 z.boolean().default(false),
}).refine((v) => v.clear || v.is_unlimited || (v.numeric_value !== null && v.numeric_value !== undefined), {
  message: "Debe indicar un valor numérico o marcar como ilimitado.",
  path: ["numeric_value"],
});

export type SetOrganizationEntitlementOverrideInput = z.infer<typeof setOrganizationEntitlementOverrideSchema>;
