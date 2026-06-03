// ─────────────────────────────────────────────────────────────────
// platform — list-platform-verticals.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PlatformVerticalItem } from "../types/platform.types";

export async function listPlatformVerticalsQuery(
  onlyActive = false,
): Promise<PlatformVerticalItem[]> {
  const rows = await prisma.platformVertical.findMany({
    where:   onlyActive ? { is_active: true } : {},
    select: {
      id:          true,
      code:        true,
      name:        true,
      description: true,
      is_active:   true,
      created_at:  true,
    },
    orderBy: { name: "asc" },
  });

  return rows;
}
