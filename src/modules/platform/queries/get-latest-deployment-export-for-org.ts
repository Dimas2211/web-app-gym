// ─────────────────────────────────────────────────────────────────
// platform — get-latest-deployment-export-for-org.ts
//
// Obtiene el export de Deployment Bundle más reciente y exitoso
// para una organización. Usado para validar al crear un Job.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export interface LatestDeploymentExport {
  id:             string;
  export_type:    string;
  bundle_version: string;
  exported_by:    string | null;
  result:         string;
  created_at:     Date;
}

export async function getLatestDeploymentExportForOrgQuery(
  organizationId: string,
): Promise<LatestDeploymentExport | null> {
  const row = await prisma.platformDeploymentExportLog.findFirst({
    where: {
      organization_id: organizationId,
      export_type:     "DEPLOYMENT_BUNDLE",
      result:          "SUCCESS",
    },
    select: {
      id:             true,
      export_type:    true,
      bundle_version: true,
      exported_by:    true,
      result:         true,
      created_at:     true,
    },
    orderBy: { created_at: "desc" },
  });

  return row ?? null;
}
