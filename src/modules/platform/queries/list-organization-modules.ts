// ─────────────────────────────────────────────────────────────────
// platform — list-organization-modules.ts
//
// Lista los módulos activados (y desactivados) para una organización.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { OrganizationModuleItem } from "../types/platform.types";

export async function listOrganizationModulesQuery(
  organizationId: string,
  onlyActive = false,
): Promise<OrganizationModuleItem[]> {
  const rows = await prisma.platformOrganizationModule.findMany({
    where: {
      organization_id: organizationId,
      ...(onlyActive && { is_active: true }),
    },
    select: {
      id:              true,
      organization_id: true,
      module_id:       true,
      is_active:       true,
      activated_at:    true,
      deactivated_at:  true,
      module: {
        select: { code: true, name: true, category: true },
      },
    },
    orderBy: { module: { code: "asc" } },
  });

  return rows.map((r) => ({
    id:              r.id,
    organization_id: r.organization_id,
    module_id:       r.module_id,
    module:          {
      code:     r.module.code,
      name:     r.module.name,
      category: r.module.category as OrganizationModuleItem["module"]["category"],
    },
    is_active:      r.is_active,
    activated_at:   r.activated_at,
    deactivated_at: r.deactivated_at,
  }));
}
