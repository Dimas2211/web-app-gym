// ─────────────────────────────────────────────────────────────────
// platform — list-deployment-preparation-organizations.ts
//
// Lista organizaciones con sus estados de provisioning y export,
// para el Deployment Preparation Dashboard.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type {
  DeploymentPreparationItem,
  PlatformOrganizationStatus,
  PlatformLicenseStatus,
  PlatformProvisioningStatus,
} from "../types/platform.types";

export async function listDeploymentPreparationOrgsQuery(): Promise<DeploymentPreparationItem[]> {
  const rows = await prisma.platformOrganization.findMany({
    orderBy: [
      { provisioning_status: "asc" },
      { created_at: "desc" },
    ],
    select: {
      id:                  true,
      code:                true,
      name:                true,
      status:              true,
      license_status:      true,
      provisioning_status: true,
      created_at:          true,
      vertical: { select: { code: true, name: true } },
      plan:     { select: { code: true, name: true } },
      export_logs: {
        where:   { export_type: "DEPLOYMENT_BUNDLE", result: "SUCCESS" },
        orderBy: { created_at: "desc" },
        take:    1,
        select:  { created_at: true },
      },
      _count: {
        select: {
          export_logs: {
            where: { export_type: "DEPLOYMENT_BUNDLE", result: "SUCCESS" },
          },
        },
      },
    },
  });

  return rows.map((r) => ({
    id:                  r.id,
    code:                r.code,
    name:                r.name,
    status:              r.status              as PlatformOrganizationStatus,
    license_status:      r.license_status      as PlatformLicenseStatus,
    provisioning_status: r.provisioning_status as PlatformProvisioningStatus,
    vertical:            r.vertical,
    plan:                r.plan,
    export_count:        r._count.export_logs,
    last_export_at:      r.export_logs[0]?.created_at ?? null,
    created_at:          r.created_at,
  }));
}
