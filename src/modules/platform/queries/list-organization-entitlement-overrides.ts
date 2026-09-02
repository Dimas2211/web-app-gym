// ─────────────────────────────────────────────────────────────────
// platform — list-organization-entitlement-overrides.ts
//
// Overrides explícitos de entitlements para una organización (Bloque A).
// La ausencia de una fila para un entitlement_definition_id significa
// "usar el valor del plan" — ver getEffectiveOrganizationEntitlements.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { OrganizationEntitlementOverrideItem } from "../types/platform.types";

export async function listOrganizationEntitlementOverridesQuery(
  organizationId: string,
): Promise<OrganizationEntitlementOverrideItem[]> {
  const rows = await prisma.platformOrganizationEntitlementOverride.findMany({
    where:  { organization_id: organizationId },
    select: {
      id:                        true,
      organization_id:           true,
      entitlement_definition_id: true,
      numeric_value:             true,
      is_unlimited:              true,
      created_at:                true,
      updated_at:                true,
    },
    orderBy: { created_at: "asc" },
  });

  return rows;
}
