// ─────────────────────────────────────────────────────────────────
// platform — list-platform-entitlement-definitions.ts
//
// Catálogo de capacidades/límites comerciales (Bloque A). Sin
// paginación — catálogo pequeño y estable, igual que platform_modules.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PlatformEntitlementDefinitionItem } from "../types/platform.types";

export async function listPlatformEntitlementDefinitionsQuery(
  onlyActive = false,
): Promise<PlatformEntitlementDefinitionItem[]> {
  const rows = await prisma.platformEntitlementDefinition.findMany({
    where:   onlyActive ? { is_active: true } : {},
    select: {
      id:          true,
      code:        true,
      name:        true,
      description: true,
      category:    true,
      value_type:  true,
      period_type: true,
      is_active:   true,
      created_at:  true,
    },
    orderBy: [{ category: "asc" }, { code: "asc" }],
  });

  return rows.map((r) => ({
    id:          r.id,
    code:        r.code,
    name:        r.name,
    description: r.description,
    category:    r.category,
    value_type:  r.value_type  as PlatformEntitlementDefinitionItem["value_type"],
    period_type: r.period_type as PlatformEntitlementDefinitionItem["period_type"],
    is_active:   r.is_active,
    created_at:  r.created_at,
  }));
}
