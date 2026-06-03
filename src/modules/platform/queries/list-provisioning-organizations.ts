// ─────────────────────────────────────────────────────────────────
// platform — list-provisioning-organizations.ts
//
// Lista organizaciones con su estado de provisioning.
// Solo accesible por super_admin.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type {
  ProvisioningOrganizationItem,
  PlatformOrganizationStatus,
  PlatformLicenseStatus,
  PlatformProvisioningStatus,
} from "../types/platform.types";

export async function listProvisioningOrganizationsQuery(): Promise<ProvisioningOrganizationItem[]> {
  const rows = await prisma.platformOrganization.findMany({
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
    },
    orderBy: { name: "asc" },
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
    created_at:          r.created_at,
  }));
}
