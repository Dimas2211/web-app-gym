// ─────────────────────────────────────────────────────────────────
// platform — list-provisioning-logs.ts
//
// Lista logs de provisioning por organización.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PlatformProvisioningLogItem, PlatformProvisioningStatus } from "../types/platform.types";

export async function listProvisioningLogsQuery(
  organizationId: string,
  limit = 20,
): Promise<PlatformProvisioningLogItem[]> {
  const rows = await prisma.platformProvisioningLog.findMany({
    where:   { organization_id: organizationId },
    orderBy: { created_at: "desc" },
    take:    limit,
  });

  return rows.map((r) => ({
    id:                r.id,
    organization_id:   r.organization_id,
    result:            r.result as PlatformProvisioningStatus,
    triggered_by:      r.triggered_by,
    validation_errors: r.validation_errors as unknown[] | null,
    notes:             r.notes,
    created_at:        r.created_at,
  }));
}
