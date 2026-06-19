// ─────────────────────────────────────────────────────────────────
// platform — list-database-profiles.ts
//
// Lista los PlatformDatabaseProfile de una organización.
// NUNCA selecciona encrypted_password — campo excluido explícitamente.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type {
  PlatformDatabaseProfileItem,
  PlatformDatabaseProfileFilters,
} from "../types/platform.types";

export async function listDatabaseProfiles(
  filters: PlatformDatabaseProfileFilters = {},
): Promise<PlatformDatabaseProfileItem[]> {
  const rows = await prisma.platformDatabaseProfile.findMany({
    where: {
      ...(filters.organization_id ? { organization_id: filters.organization_id } : {}),
      ...(filters.environment     ? { environment:     filters.environment     } : {}),
      ...(filters.is_active !== undefined ? { is_active: filters.is_active } : {}),
    },
    select: {
      id:                true,
      organization_id:   true,
      organization: {
        select: { code: true, name: true },
      },
      label:             true,
      environment:       true,
      provider:          true,
      db_host:           true,
      db_port:           true,
      db_name:           true,
      db_user:           true,
      // encrypted_password: omitido intencionalmente
      ssl_mode:          true,
      connection_options: true,
      last_tested_at:    true,
      last_test_status:  true,
      last_test_message: true,
      is_active:         true,
      created_at:        true,
      updated_at:        true,
      created_by:        true,
      updated_by:        true,
    },
    orderBy: [
      { organization_id: "asc" },
      { environment:     "asc" },
      { label:           "asc" },
    ],
  });

  return rows.map((r) => ({
    id:               r.id,
    organization_id:  r.organization_id,
    organization:     r.organization,
    label:            r.label,
    environment:      r.environment as PlatformDatabaseProfileItem["environment"],
    provider:         r.provider   as PlatformDatabaseProfileItem["provider"],
    db_host:          r.db_host,
    db_port:          r.db_port,
    db_name:          r.db_name,
    db_user:          r.db_user,
    ssl_mode:         r.ssl_mode   as PlatformDatabaseProfileItem["ssl_mode"],
    connection_options: r.connection_options as Record<string, unknown> | null,
    last_tested_at:   r.last_tested_at,
    last_test_status: r.last_test_status as PlatformDatabaseProfileItem["last_test_status"],
    last_test_message: r.last_test_message,
    is_active:        r.is_active,
    created_at:       r.created_at,
    updated_at:       r.updated_at,
    created_by:       r.created_by,
    updated_by:       r.updated_by,
  }));
}
