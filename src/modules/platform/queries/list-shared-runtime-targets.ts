// ─────────────────────────────────────────────────────────────────
// platform — list-shared-runtime-targets.ts
//
// Lista los PlatformSharedRuntimeTarget registrados. NUNCA selecciona
// encrypted_password — campo excluido explícitamente. Para uso del
// selector "Shared Runtime" en Platform Admin (nueva organización /
// detalle de organización → panel Runtime).
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

/**
 * SHARED-OPS-PARITY-1. Organización asignada a un Shared Runtime Target —
 * unidad de las operaciones tenant-scoped (onboarding, operar como
 * cliente, baseline). Solo metadata pública del Control Plane.
 */
export interface SharedRuntimeTargetOrganizationItem {
  id:                  string;
  code:                string;
  name:                string;
  tenant_id:           string | null;
  status:              string;
  provisioning_status: string;
  domain:              string | null;
}

export interface PlatformSharedRuntimeTargetItem {
  id: string;
  label: string;
  environment: string;
  provider: string;
  db_host: string;
  db_port: number | null;
  db_name: string;
  db_user: string;
  ssl_mode: string;
  is_active: boolean;
  last_tested_at: Date | null;
  last_test_status: string;
  last_test_message: string | null;
  organizationCount: number;
  organizations: SharedRuntimeTargetOrganizationItem[];
  created_at: Date;
  updated_at: Date;
}

export async function listSharedRuntimeTargets(
  filters: { is_active?: boolean } = {},
): Promise<PlatformSharedRuntimeTargetItem[]> {
  const rows = await prisma.platformSharedRuntimeTarget.findMany({
    where: {
      ...(filters.is_active !== undefined ? { is_active: filters.is_active } : {}),
    },
    select: {
      id:                true,
      label:             true,
      environment:       true,
      provider:          true,
      db_host:           true,
      db_port:           true,
      db_name:           true,
      db_user:           true,
      ssl_mode:          true,
      // encrypted_password: omitido intencionalmente
      is_active:         true,
      last_tested_at:    true,
      last_test_status:  true,
      last_test_message: true,
      created_at:        true,
      updated_at:        true,
      _count: { select: { organizations: true } },
      organizations: {
        select: {
          id:                  true,
          code:                true,
          name:                true,
          tenant_id:           true,
          status:              true,
          provisioning_status: true,
          domain:              true,
        },
        orderBy: [{ name: "asc" }],
      },
    },
    orderBy: [{ label: "asc" }],
  });

  return rows.map((r) => ({
    id:                r.id,
    label:             r.label,
    environment:       r.environment,
    provider:          r.provider,
    db_host:           r.db_host,
    db_port:           r.db_port,
    db_name:           r.db_name,
    db_user:           r.db_user,
    ssl_mode:          r.ssl_mode,
    is_active:         r.is_active,
    last_tested_at:    r.last_tested_at,
    last_test_status:  r.last_test_status,
    last_test_message: r.last_test_message,
    organizationCount: r._count.organizations,
    organizations:     r.organizations.map((o) => ({
      id:                  o.id,
      code:                o.code,
      name:                o.name,
      tenant_id:           o.tenant_id,
      status:              String(o.status),
      provisioning_status: String(o.provisioning_status),
      domain:              o.domain,
    })),
    created_at:        r.created_at,
    updated_at:        r.updated_at,
  }));
}
