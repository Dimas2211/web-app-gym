// ─────────────────────────────────────────────────────────────────
// platform — list-deployment-export-logs.ts
//
// Lista el historial de exportaciones de deployment bundles.
// Soporta filtro por organización o listado global.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { DeploymentExportLogItem, DeploymentExportType, DeploymentExportResult } from "../types/platform.types";

export async function listDeploymentExportLogsQuery(
  organizationId?: string,
  limit = 50,
): Promise<DeploymentExportLogItem[]> {
  const rows = await prisma.platformDeploymentExportLog.findMany({
    where: organizationId ? { organization_id: organizationId } : undefined,
    orderBy: { created_at: "desc" },
    take: limit,
    select: {
      id:              true,
      organization_id: true,
      export_type:     true,
      bundle_version:  true,
      exported_by:     true,
      result:          true,
      error_message:   true,
      created_at:      true,
      organization: {
        select: { code: true, name: true },
      },
    },
  });

  return rows.map((r) => ({
    id:              r.id,
    organization_id: r.organization_id,
    organization:    r.organization,
    export_type:     r.export_type    as DeploymentExportType,
    bundle_version:  r.bundle_version,
    exported_by:     r.exported_by,
    result:          r.result         as DeploymentExportResult,
    error_message:   r.error_message,
    created_at:      r.created_at,
  }));
}
