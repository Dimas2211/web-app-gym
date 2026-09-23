// ─────────────────────────────────────────────────────────────────
// platform — list-shared-runtime-targets.ts
//
// Lista los PlatformSharedRuntimeTarget registrados. NUNCA selecciona
// encrypted_password — campo excluido explícitamente. Para uso del
// selector "Shared Runtime" en Platform Admin (nueva organización /
// detalle de organización → panel Runtime).
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export interface PlatformSharedRuntimeTargetItem {
  id: string;
  label: string;
  environment: string;
  provider: string;
  db_host: string;
  db_port: number | null;
  db_name: string;
  is_active: boolean;
  last_tested_at: Date | null;
  last_test_status: string;
  organizationCount: number;
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
      // encrypted_password: omitido intencionalmente
      is_active:         true,
      last_tested_at:    true,
      last_test_status:  true,
      created_at:        true,
      updated_at:        true,
      _count: { select: { organizations: true } },
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
    is_active:         r.is_active,
    last_tested_at:    r.last_tested_at,
    last_test_status:  r.last_test_status,
    organizationCount: r._count.organizations,
    created_at:        r.created_at,
    updated_at:        r.updated_at,
  }));
}
