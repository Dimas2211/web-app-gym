// ─────────────────────────────────────────────────────────────────
// platform — get-platform-organization-by-id.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PlatformOrganizationDetail } from "../types/platform.types";

export async function getPlatformOrganizationByIdQuery(
  id: string,
): Promise<PlatformOrganizationDetail | null> {
  const row = await prisma.platformOrganization.findUnique({
    where: { id },
    select: {
      id:                  true,
      code:                true,
      name:                true,
      legal_name:          true,
      nit:                 true,
      tenant_id:           true,
      status:              true,
      license_status:      true,
      billing_cycle:       true,
      provisioning_status: true,
      trial_ends_at:       true,
      license_expires_at:  true,
      country_code:        true,
      timezone:            true,
      domain:              true,
      logo_url:            true,
      deployment_url:      true,
      instance_identifier: true,
      suspended_at:        true,
      suspension_reason:   true,
      created_at:          true,
      updated_at:          true,
      vertical: { select: { id: true, code: true, name: true } },
      plan:     { select: { id: true, code: true, name: true } },
    },
  });

  if (!row) return null;

  return {
    id:                  row.id,
    code:                row.code,
    name:                row.name,
    legal_name:          row.legal_name,
    nit:                 row.nit,
    tenant_id:           row.tenant_id,
    status:              row.status              as PlatformOrganizationDetail["status"],
    license_status:      row.license_status      as PlatformOrganizationDetail["license_status"],
    billing_cycle:       row.billing_cycle       as PlatformOrganizationDetail["billing_cycle"],
    provisioning_status: row.provisioning_status as PlatformOrganizationDetail["provisioning_status"],
    trial_ends_at:       row.trial_ends_at,
    license_expires_at:  row.license_expires_at,
    country_code:        row.country_code,
    timezone:            row.timezone,
    domain:              row.domain,
    logo_url:            row.logo_url,
    deployment_url:      row.deployment_url,
    instance_identifier: row.instance_identifier,
    suspended_at:        row.suspended_at,
    suspension_reason:   row.suspension_reason,
    vertical:            row.vertical,
    plan:                row.plan,
    created_at:          row.created_at,
    updated_at:          row.updated_at,
  };
}
