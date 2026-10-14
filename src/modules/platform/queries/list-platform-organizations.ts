// ─────────────────────────────────────────────────────────────────
// platform — list-platform-organizations.ts
//
// Lista filtrada de PlatformOrganizations.
// Solo accesible por super_admin (validación en la action/page que la llama).
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type {
  PlatformOrganizationFilters,
  PlatformOrganizationListRow,
  PlatformListResult,
} from "../types/platform.types";
import { summarizeEffectiveLicense } from "../lib/effective-license-summary";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE     = 500;

const ORG_LIST_SELECT = {
  id:                  true,
  code:                true,
  name:                true,
  legal_name:          true,
  tenant_id:           true,
  status:              true,
  license_status:      true,
  billing_cycle:       true,
  provisioning_status: true,
  country_code:        true,
  timezone:            true,
  trial_ends_at:       true,
  license_expires_at:  true,
  created_at:          true,
  vertical: {
    select: { id: true, code: true, name: true },
  },
  plan: {
    select: { id: true, code: true, name: true },
  },
} as const;

function buildWhere(filters: PlatformOrganizationFilters) {
  return {
    ...(filters.search?.trim() && {
      OR: [
        { name:  { contains: filters.search.trim(), mode: "insensitive" as const } },
        { code:  { contains: filters.search.trim(), mode: "insensitive" as const } },
      ],
    }),
    ...(filters.status         && { status:         filters.status }),
    ...(filters.license_status && { license_status: filters.license_status }),
    ...(filters.vertical_id    && { vertical_id:    filters.vertical_id }),
    ...(filters.plan_id        && { plan_id:        filters.plan_id }),
  };
}

/**
 * `now` es inyectable solo para tests. Un único `now` por carga: todas
 * las filas se evalúan contra el mismo instante (cada una en SU
 * timezone, vía la política central).
 */
export async function listPlatformOrganizationsQuery(
  filters: PlatformOrganizationFilters = {},
  now: Date = new Date(),
): Promise<PlatformListResult<PlatformOrganizationListRow>> {
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.page_size ?? DEFAULT_PAGE_SIZE));
  const where    = buildWhere(filters);

  const [rows, total] = await prisma.$transaction([
    prisma.platformOrganization.findMany({
      where,
      select:  ORG_LIST_SELECT,
      orderBy: { name: "asc" },
      take:    pageSize,
    }),
    prisma.platformOrganization.count({ where }),
  ]);

  const items: PlatformOrganizationListRow[] = rows.map((r) => ({
    id:                  r.id,
    code:                r.code,
    name:                r.name,
    legal_name:          r.legal_name,
    tenant_id:           r.tenant_id,
    status:              r.status              as PlatformOrganizationListRow["status"],
    license_status:      r.license_status      as PlatformOrganizationListRow["license_status"],
    billing_cycle:       r.billing_cycle       as PlatformOrganizationListRow["billing_cycle"],
    provisioning_status: r.provisioning_status as PlatformOrganizationListRow["provisioning_status"],
    country_code:        r.country_code,
    timezone:            r.timezone,
    trial_ends_at:       r.trial_ends_at,
    license_expires_at:  r.license_expires_at,
    // Estado EFECTIVO derivado (política central) — nunca persistido.
    effective_license:   summarizeEffectiveLicense(r, now),
    vertical:            r.vertical,
    plan:                r.plan,
    created_at:          r.created_at,
  }));

  return {
    items,
    total,
    page:       1,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
