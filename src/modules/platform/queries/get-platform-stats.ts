// ─────────────────────────────────────────────────────────────────
// platform — get-platform-stats.ts
//
// Contadores para el dashboard de plataforma.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export interface PlatformStats {
  totalOrgs:      number;
  activeOrgs:     number;
  trialOrgs:      number;
  totalModules:   number;
  totalVerticals: number;
}

export async function getPlatformStatsQuery(): Promise<PlatformStats> {
  const [totalOrgs, activeOrgs, trialOrgs, totalModules, totalVerticals] =
    await prisma.$transaction([
      prisma.platformOrganization.count(),
      prisma.platformOrganization.count({ where: { status: "ACTIVE" } }),
      prisma.platformOrganization.count({ where: { license_status: "TRIAL" } }),
      prisma.platformModule.count(),
      prisma.platformVertical.count({ where: { is_active: true } }),
    ]);

  return { totalOrgs, activeOrgs, trialOrgs, totalModules, totalVerticals };
}
