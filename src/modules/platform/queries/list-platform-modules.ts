// ─────────────────────────────────────────────────────────────────
// platform — list-platform-modules.ts
//
// Catálogo global de módulos disponibles en la plataforma.
// Sin paginación clásica — el catálogo es pequeño y estable.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PlatformModuleFilters, PlatformModuleItem } from "../types/platform.types";

function buildWhere(filters: PlatformModuleFilters) {
  return {
    ...(filters.category    && { category:    filters.category }),
    ...(filters.status      && { status:      filters.status }),
    ...(filters.vertical_id && { vertical_id: filters.vertical_id }),
  };
}

export async function listPlatformModulesQuery(
  filters: PlatformModuleFilters = {},
): Promise<PlatformModuleItem[]> {
  const rows = await prisma.platformModule.findMany({
    where:   buildWhere(filters),
    select: {
      id:          true,
      code:        true,
      name:        true,
      description: true,
      category:    true,
      status:      true,
      version:     true,
      is_core:     true,
      vertical_id: true,
      created_at:  true,
      vertical: { select: { code: true, name: true } },
    },
    orderBy: [{ category: "asc" }, { code: "asc" }],
  });

  return rows.map((r) => ({
    id:          r.id,
    code:        r.code,
    name:        r.name,
    description: r.description,
    category:    r.category as PlatformModuleItem["category"],
    status:      r.status   as PlatformModuleItem["status"],
    version:     r.version,
    is_core:     r.is_core,
    vertical_id: r.vertical_id,
    vertical:    r.vertical,
    created_at:  r.created_at,
  }));
}
