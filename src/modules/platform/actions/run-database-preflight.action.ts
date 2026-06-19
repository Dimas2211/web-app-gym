"use server";

// ─────────────────────────────────────────────────────────────────
// platform — run-database-preflight.action.ts
//
// Server action read-only.
// Ejecuta el preflight de base de datos operativa.
// Resuelve tenant y módulos activos desde PlatformOrganization.
// Solo super_admin. NO escribe ningún dato.
// ─────────────────────────────────────────────────────────────────

import { requireSuperAdmin }      from "@/lib/permissions/guards";
import { prisma }                 from "@/lib/db/prisma";
import { runDatabasePreflight }   from "../lib/database-preflight";
import type {
  DatabasePreflightResult,
  DatabasePreflightInput,
} from "../types/platform.types";

export type DatabasePreflightActionState =
  | { result: DatabasePreflightResult; error?: never }
  | { result?: never; error: string }
  | undefined;

export async function runDatabasePreflightAction(
  organizationId?: string,
): Promise<DatabasePreflightActionState> {
  await requireSuperAdmin();

  const input: DatabasePreflightInput = {};

  if (organizationId) {
    const org = await prisma.platformOrganization.findUnique({
      where:  { id: organizationId },
      select: {
        tenant_id: true,
        vertical:  { select: { code: true } },
        modules: {
          where:  { is_active: true },
          select: { module: { select: { code: true } } },
        },
      },
    });

    if (!org) {
      return { error: "Organización no encontrada." };
    }

    if (org.tenant_id) {
      input.tenantId = org.tenant_id;
    }

    if (org.vertical?.code) {
      input.verticalCode = org.vertical.code;
    }

    input.activeModuleCodes = org.modules.map((m) => m.module.code);
  }

  const result = await runDatabasePreflight(input);
  return { result };
}
