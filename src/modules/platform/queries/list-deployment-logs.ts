// ─────────────────────────────────────────────────────────────────
// platform — list-deployment-logs.ts
//
// Últimos logs de deployment para una organización.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PlatformDeploymentLogItem } from "../types/platform.types";

export async function listDeploymentLogsQuery(
  organizationId: string,
  limit = 30,
): Promise<PlatformDeploymentLogItem[]> {
  const rows = await prisma.platformDeploymentLog.findMany({
    where:   { organization_id: organizationId },
    orderBy: { created_at: "desc" },
    take:    limit,
  });

  return rows.map((r) => ({
    id:              r.id,
    organization_id: r.organization_id,
    action:          r.action,
    status:          r.status as PlatformDeploymentLogItem["status"],
    notes:           r.notes,
    metadata:        r.metadata as Record<string, unknown> | null,
    triggered_by:    r.triggered_by,
    started_at:      r.started_at,
    ended_at:        r.ended_at,
    created_at:      r.created_at,
  }));
}
